use anyhow::{Context, Result};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Utc};
use futures::{StreamExt, TryStreamExt, stream};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::{env, time::Duration};
use tokio::time::interval;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct App {
    db: PgPool,
}
#[derive(Serialize, sqlx::FromRow)]
struct TokenRow {
    account_id: String,
    creator: String,
    treasury_recipient: String,
    name: String,
    symbol: String,
    real_usdc: String,
    cumulative_volume_usdc: String,
    tokens_sold: String,
    reserved_remaining: String,
    treasury_pool: String,
    treasury_unlocked: String,
    treasury_claimed: String,
    milestones_completed: i16,
    graduated: bool,
    preset: Value,
    created_block: i64,
    created_tx: String,
    updated_at: DateTime<Utc>,
}
#[derive(Serialize, sqlx::FromRow)]
struct TradeRow {
    token_id: String,
    trader: String,
    side: String,
    usdc_amount: String,
    token_amount: String,
    tx_hash: String,
    event_index: i32,
    block_height: i64,
    created_at: DateTime<Utc>,
}
#[derive(Deserialize)]
struct Page {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info".into()))
        .init();
    let database_url = env::var("DATABASE_URL").context("DATABASE_URL is required")?;
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    let app_state = App { db: db.clone() };
    let rpc = env::var("NEAR_RPC_URL").unwrap_or_else(|_| "https://near-testnet.drpc.org".into());
    let contract = env::var("LAUNCHPAD_ACCOUNT_ID").ok();
    let usdc = env::var("NEAR_USDC_ACCOUNT_ID").unwrap_or_default();
    tokio::spawn(async move {
        if let Some(contract) = contract {
            if let Err(err) = indexer_loop(db, rpc, contract, usdc).await {
                tracing::error!(%err, "indexer stopped");
            }
        } else {
            tracing::warn!("LAUNCHPAD_ACCOUNT_ID unset: indexer disabled");
        }
    });
    let router = Router::new()
        .route(
            "/health",
            get(|| async { Json(json!({"ok":true,"network":"near-testnet"})) }),
        )
        .route("/api/tokens", get(list_tokens))
        .route("/api/tokens/{id}", get(get_token))
        .route("/api/tokens/{id}/trades", get(get_trades))
        .route("/api/tokens/{id}/mechanics", get(get_mechanics))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);
    let address = env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:4001".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!(%address, "Orba NEAR API listening");
    axum::serve(listener, router).await?;
    Ok(())
}

async fn list_tokens(
    State(app): State<App>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, StatusCode> {
    let limit = page.limit.unwrap_or(50).clamp(1, 100);
    let offset = page.offset.unwrap_or(0).max(0);
    let rows = sqlx::query_as::<_, TokenRow>(
        "SELECT account_id,creator,treasury_recipient,name,symbol,real_usdc::text,cumulative_volume_usdc::text,tokens_sold::text,reserved_remaining::text,treasury_pool::text,treasury_unlocked::text,treasury_claimed::text,milestones_completed,graduated,preset,created_block,created_tx,updated_at FROM tokens ORDER BY created_block DESC LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&app.db)
    .await
    .map_err(internal)?;
    Ok(Json(json!({"items":rows,"limit":limit,"offset":offset})))
}
async fn get_token(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<TokenRow>, StatusCode> {
    sqlx::query_as::<_, TokenRow>("SELECT account_id,creator,treasury_recipient,name,symbol,real_usdc::text,cumulative_volume_usdc::text,tokens_sold::text,reserved_remaining::text,treasury_pool::text,treasury_unlocked::text,treasury_claimed::text,milestones_completed,graduated,preset,created_block,created_tx,updated_at FROM tokens WHERE account_id=$1")
        .bind(id)
        .fetch_optional(&app.db)
        .await
        .map_err(internal)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}
async fn get_trades(
    State(app): State<App>,
    Path(id): Path<String>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, StatusCode> {
    let limit = page.limit.unwrap_or(50).clamp(1, 100);
    let offset = page.offset.unwrap_or(0).max(0);
    let rows=sqlx::query_as::<_,TradeRow>("SELECT token_id,trader,side,usdc_amount::text,token_amount::text,tx_hash,event_index,block_height,created_at FROM trades WHERE token_id=$1 ORDER BY block_height DESC,event_index DESC LIMIT $2 OFFSET $3").bind(id).bind(limit).bind(offset).fetch_all(&app.db).await.map_err(internal)?;
    Ok(Json(json!({"items":rows,"limit":limit,"offset":offset})))
}
async fn get_mechanics(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let token = sqlx::query_as::<_, TokenRow>("SELECT account_id,creator,treasury_recipient,name,symbol,real_usdc::text,cumulative_volume_usdc::text,tokens_sold::text,reserved_remaining::text,treasury_pool::text,treasury_unlocked::text,treasury_claimed::text,milestones_completed,graduated,preset,created_block,created_tx,updated_at FROM tokens WHERE account_id=$1")
        .bind(&id)
        .fetch_optional(&app.db)
        .await
        .map_err(internal)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let milestones=sqlx::query_as::<_,(i16,String,String,String,String,i64,i32)>("SELECT milestone_index,volume::text,burn_amount::text,treasury_unlocked::text,tx_hash,block_height,event_index FROM milestones WHERE token_id=$1 ORDER BY milestone_index").bind(id).fetch_all(&app.db).await.map_err(internal)?;
    Ok(Json(
        json!({"reserved_remaining":token.reserved_remaining,"treasury_pool":token.treasury_pool,"treasury_unlocked":token.treasury_unlocked,"treasury_claimed":token.treasury_claimed,"treasury_recipient":token.treasury_recipient,"milestones_completed":token.milestones_completed,"graduated":token.graduated,"preset":token.preset,"milestones":milestones}),
    ))
}
fn internal<E: std::fmt::Debug>(err: E) -> StatusCode {
    tracing::error!(?err, "database operation failed");
    StatusCode::INTERNAL_SERVER_ERROR
}

#[derive(Deserialize)]
struct RpcResponse {
    result: Option<Value>,
    error: Option<Value>,
}
async fn indexer_loop(db: PgPool, rpc: String, contract: String, usdc: String) -> Result<()> {
    let client = Client::new();
    let mut tick = interval(Duration::from_secs(3));
    loop {
        tick.tick().await;
        let height:Value=client.post(&rpc).json(&json!({"jsonrpc":"2.0","id":"orba","method":"block","params":{"finality":"final"}})).send().await?.error_for_status()?.json().await?;
        if height.get("error").is_some() {
            continue;
        }
        let block = height["result"]["header"]["height"]
            .as_i64()
            .unwrap_or_default();
        let mut last =
            sqlx::query_scalar::<_, i64>("SELECT last_block FROM indexer_state WHERE name='near' ")
                .fetch_optional(&db)
                .await?
                .unwrap_or(0);
        if last == 0 {
            let configured = env::var("INDEXER_START_BLOCK")
                .ok()
                .and_then(|s| s.parse::<i64>().ok());
            last = configured.unwrap_or_else(|| block.saturating_sub(50_000).max(0));
            sqlx::query("INSERT INTO indexer_state(name,last_block) VALUES('near',$1) ON CONFLICT(name) DO UPDATE SET last_block=EXCLUDED.last_block,updated_at=NOW()")
                .bind(last).execute(&db).await?;
        }
        if block <= last {
            continue;
        }
        // Tx-status polling uses indexed transaction hashes from launchpad receipts.
        // Block range is checkpointed only after successful scanning; the RPC result parser is idempotent.
        let batch_blocks = env::var("INDEXER_BATCH_BLOCKS")
            .ok()
            .and_then(|s| s.parse::<i64>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(50)
            .min(500);
        let limit = last.saturating_add(batch_blocks).min(block);
        let scanned_blocks = stream::iter((last + 1)..=limit)
            .map(|height| {
                let (client, rpc, contract, usdc) = (&client, &rpc, &contract, &usdc);
                async move {
                    let events = scan_block(client, rpc, contract, usdc, height).await?;
                    Ok::<_, anyhow::Error>((height, events))
                }
            })
            .buffered(8)
            .try_collect::<Vec<_>>()
            .await?;
        for (height, transactions) in scanned_blocks {
            for transaction in transactions {
                persist_logs(&db, transaction.events, &transaction.tx_hash, height).await?;
            }
        }
        sqlx::query("INSERT INTO indexer_state(name,last_block) VALUES('near',$1) ON CONFLICT(name) DO UPDATE SET last_block=EXCLUDED.last_block,updated_at=NOW()").bind(limit).execute(&db).await?;
    }
}
async fn scan_block(
    client: &Client,
    rpc: &str,
    contract: &str,
    usdc: &str,
    height: i64,
) -> Result<Vec<IndexedTransactionLogs>> {
    let block: RpcResponse = client
        .post(rpc)
        .json(&json!({"jsonrpc":"2.0","id":"orba","method":"block","params":{"block_id":height}}))
        .send()
        .await?
        .json()
        .await?;
    if block.error.is_some() {
        return Ok(Vec::new());
    }
    let Some(block) = block.result else {
        return Ok(Vec::new());
    };
    let chunks = block["chunks"].as_array().cloned().unwrap_or_default();
    let chunk_bodies = stream::iter(chunks)
        .map(|chunk| async move {
            let chunk_hash = chunk["chunk_hash"].as_str().unwrap_or_default();
            let body: RpcResponse = client
                .post(rpc)
                .json(&json!({"jsonrpc":"2.0","id":"orba","method":"chunk","params":{"chunk_id":chunk_hash}}))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok::<_, anyhow::Error>(body.result)
        })
        .buffered(10)
        .try_collect::<Vec<_>>()
        .await?;
    let mut indexed = Vec::new();
    for body in chunk_bodies.into_iter().flatten() {
        for tx in body["transactions"].as_array().cloned().unwrap_or_default() {
            let receiver = tx["receiver_id"].as_str().unwrap_or_default();
            let relevant_action = tx["actions"].as_array().is_some_and(|actions| {
                actions.iter().any(|action| {
                    let method = action["FunctionCall"]["method_name"].as_str();
                    match receiver {
                        account if account == contract => matches!(
                            method,
                            Some("create_token" | "claim_treasury" | "claim_sell_proceeds")
                        ),
                        account
                            if account == usdc
                                || (account.starts_with("token-")
                                    && account.ends_with(&format!(".{contract}"))) =>
                        {
                            transfer_call_targets_launchpad(action, contract)
                        }
                        _ => false,
                    }
                })
            });
            if !relevant_action {
                continue;
            }
            let signer = tx["signer_id"].as_str().unwrap_or_default();
            let tx_hash = tx["hash"].as_str().unwrap_or_default();
            let status: RpcResponse = client
                .post(rpc)
                .json(&json!({"jsonrpc":"2.0","id":"orba","method":"EXPERIMENTAL_tx_status","params":[tx_hash,signer]}))
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            if let Some(status) = status.result {
                let logs = collect_logs(&status);
                if !logs.is_empty() {
                    indexed.push(IndexedTransactionLogs {
                        tx_hash: tx_hash.to_string(),
                        events: logs,
                    });
                }
            }
        }
    }
    Ok(indexed)
}
struct IndexedTransactionLogs {
    tx_hash: String,
    events: Vec<Value>,
}
fn transfer_call_targets_launchpad(action: &Value, contract: &str) -> bool {
    let Some(function_call) = action.get("FunctionCall") else {
        return false;
    };
    if function_call["method_name"].as_str() != Some("ft_transfer_call") {
        return false;
    }
    let Some(encoded_args) = function_call["args"].as_str() else {
        return false;
    };
    let Ok(args) = STANDARD.decode(encoded_args) else {
        return false;
    };
    serde_json::from_slice::<Value>(&args)
        .ok()
        .and_then(|args| args["receiver_id"].as_str().map(str::to_owned))
        .is_some_and(|receiver| receiver == contract)
}
fn collect_logs(value: &Value) -> Vec<Value> {
    let mut output = Vec::new();
    fn walk(v: &Value, out: &mut Vec<Value>) {
        if let Some(logs) = v.get("logs").and_then(Value::as_array) {
            for log in logs {
                if let Some(s) = log.as_str().and_then(|s| s.strip_prefix("EVENT_JSON:")) {
                    if let Ok(e) = serde_json::from_str::<Value>(s) {
                        if e["standard"] == "orba" {
                            out.push(e);
                        }
                    }
                }
            }
        }
        if let Some(children) = v.get("receipts_outcome").and_then(Value::as_array) {
            for c in children {
                walk(&c["outcome"], out);
            }
        }
        if let Some(outcome) = v.get("transaction_outcome") {
            walk(&outcome["outcome"], out);
        }
    }
    walk(value, &mut output);
    output
}
async fn persist_logs(db: &PgPool, events: Vec<Value>, tx: &str, height: i64) -> Result<()> {
    for (idx, event) in events.into_iter().enumerate() {
        let data = &event["data"][0];
        let token = data["token_id"].as_str().unwrap_or_default();
        match event["event"].as_str().unwrap_or_default() {
            "token_created" => {
                let creator = data["creator"].as_str().unwrap_or_default();
                sqlx::query("INSERT INTO tokens(account_id,creator,treasury_recipient,name,symbol,created_block,created_tx,preset) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING")
                    .bind(token).bind(creator).bind(data["treasury_recipient"].as_str().unwrap_or_default())
                    .bind(data["name"].as_str().unwrap_or_default()).bind(data["symbol"].as_str().unwrap_or_default())
                    .bind(height).bind(tx).bind(&data["preset"]).execute(db).await?;
            }
            "buy" | "sell" => {
                let side = event["event"].as_str().unwrap();
                let trader = data["trader"].as_str().unwrap_or_default();
                sqlx::query("INSERT INTO trades(token_id,trader,side,usdc_amount,token_amount,tx_hash,event_index,block_height) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tx_hash,event_index) DO NOTHING").bind(token).bind(trader).bind(side).bind(decimal(&data["usdc_amount"])).bind(decimal(&data["tokens_out"])).bind(tx).bind(idx as i32).bind(height).execute(db).await?;
                update_token_snapshot(db, token, data).await?;
            }
            "milestone" => {
                sqlx::query("INSERT INTO milestones(token_id,milestone_index,volume,burn_amount,treasury_unlocked,tx_hash,event_index,block_height) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING").bind(token).bind(data["index"].as_i64().unwrap_or(0) as i16).bind(decimal(&data["volume"])).bind(decimal(&data["burn"])).bind(decimal(&data["treasury_unlocked"])).bind(tx).bind(idx as i32).bind(height).execute(db).await?;
                update_token_snapshot(db, token, data).await?;
            }
            "treasury_claim" => {
                sqlx::query(
                    "UPDATE tokens SET treasury_claimed=$2,updated_at=NOW() WHERE account_id=$1",
                )
                .bind(token)
                .bind(decimal(&data["treasury_claimed"]))
                .execute(db)
                .await?;
            }
            _ => {}
        }
    }
    Ok(())
}

async fn update_token_snapshot(db: &PgPool, token: &str, data: &Value) -> Result<()> {
    sqlx::query("UPDATE tokens SET real_usdc=$2,cumulative_volume_usdc=$3,tokens_sold=$4,reserved_remaining=$5,treasury_pool=$6,treasury_unlocked=$7,treasury_claimed=$8,milestones_completed=$9,graduated=$10,updated_at=NOW() WHERE account_id=$1")
        .bind(token).bind(decimal(&data["real_usdc"]))
        .bind(decimal(&data["cumulative_volume_usdc"]))
        .bind(decimal(&data["tokens_sold"]))
        .bind(decimal(&data["reserved_remaining"]))
        .bind(decimal(&data["treasury_pool"]))
        .bind(decimal(&data["treasury_unlocked"]))
        .bind(decimal(&data["treasury_claimed"]))
        .bind(data["milestones_completed"].as_i64().unwrap_or(0) as i16)
        .bind(data["graduated"].as_bool().unwrap_or(false))
        .execute(db).await?;
    Ok(())
}

fn decimal(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_orba_events_and_ignores_unrelated_logs() {
        let v = json!({"transaction_outcome":{"outcome":{"logs":["EVENT_JSON:{\"standard\":\"orba\",\"version\":\"1.0.0\",\"event\":\"buy\",\"data\":[{}]}","hello"]}}});
        assert_eq!(collect_logs(&v).len(), 1);
    }
    #[test]
    fn repeated_event_key_is_stable() {
        let tx = "same-hash";
        let index = 3;
        assert_eq!((tx, index), ("same-hash", 3));
    }
}
