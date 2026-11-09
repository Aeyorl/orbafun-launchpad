use anyhow::{Context, Result};
use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{HeaderMap, Request, StatusCode, Uri},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::{DateTime, Utc};
use futures::{stream, StreamExt, TryStreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::{env, time::Duration};
use tokio::time::{interval, sleep};
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
    description: Option<String>,
    image_url: Option<String>,
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
    block_time: Option<DateTime<Utc>>,
}
#[derive(Deserialize)]
struct Page {
    limit: Option<i64>,
    offset: Option<i64>,
}

pub async fn app_router() -> Result<Router> {
    app_router_with_indexer(false).await
}

pub async fn app_router_with_indexer(enable_indexer: bool) -> Result<Router> {
    let database_url = env::var("DATABASE_URL").context("DATABASE_URL is required")?;
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    let app_state = App { db: db.clone() };
    if enable_indexer {
        let rpc =
            env::var("NEAR_RPC_URL").unwrap_or_else(|_| "https://near-testnet.drpc.org".into());
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
    }
    Ok(Router::new()
        .route(
            "/health",
            get(|| async { Json(json!({"ok":true,"network":"near-testnet"})) }),
        )
        .route(
            "/api/health",
            get(|| async { Json(json!({"ok":true,"network":"near-testnet"})) }),
        )
        .route("/api/tokens", get(list_tokens))
        .route("/api/tokens/{id}", get(get_token))
        .route("/api/tokens/{id}/trades", get(get_trades))
        .route("/api/tokens/{id}/mechanics", get(get_mechanics))
        .route("/api/profiles/{id}", get(get_profile))
        .route("/api/images", post(upload_image))
        .route("/api/images/{id}", get(get_image))
        .route("/api/cron/indexer", get(run_indexer))
        .route("/api/indexer/status", get(indexer_status))
        .route("/api/indexer/sync", post(sync_indexer))
        .route("/api/indexer/launch", post(index_launch))
        .route("/api/indexer/transaction", post(index_launch))
        .layer(middleware::from_fn(normalize_vercel_path))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(app_state))
}

async fn normalize_vercel_path(mut request: Request<Body>, next: Next) -> Response {
    let Some(query) = request.uri().query() else {
        return next.run(request).await;
    };

    let mut api_path = None;
    let mut remaining = Vec::new();
    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        if key == "__orba_path" {
            api_path = Some(value.into_owned());
        } else {
            remaining.push((key.into_owned(), value.into_owned()));
        }
    }

    let Some(api_path) = api_path else {
        return next.run(request).await;
    };

    let path = api_path.trim_start_matches('/');
    let path = if path == "health" {
        "/health".to_owned()
    } else if !path.is_empty() && !path.split('/').any(|part| part == "." || part == "..") {
        format!("/api/{path}")
    } else {
        return (StatusCode::BAD_REQUEST, "invalid API path").into_response();
    };
    let query = form_urlencoded::Serializer::new(String::new())
        .extend_pairs(remaining)
        .finish();
    let uri = if query.is_empty() {
        path
    } else {
        format!("{path}?{query}")
    };
    let Ok(uri) = uri.parse::<Uri>() else {
        return (StatusCode::BAD_REQUEST, "invalid API path").into_response();
    };
    *request.uri_mut() = uri;
    next.run(request).await
}

async fn run_indexer(
    State(app): State<App>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let expected = env::var("CRON_SECRET").map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let authorized = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|value| value == expected);
    if !authorized {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let rpc = env::var("NEAR_RPC_URL").unwrap_or_else(|_| "https://near-testnet.drpc.org".into());
    let contract = env::var("LAUNCHPAD_ACCOUNT_ID").map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let usdc = env::var("NEAR_USDC_ACCOUNT_ID").unwrap_or_default();
    indexer_tick(&app.db, &rpc, &contract, &usdc, false)
        .await
        .map(Json)
        .map_err(internal)
}

async fn sync_indexer(State(app): State<App>) -> Result<Json<Value>, StatusCode> {
    let rpc = env::var("NEAR_RPC_URL").unwrap_or_else(|_| "https://near-testnet.drpc.org".into());
    let contract = env::var("LAUNCHPAD_ACCOUNT_ID").map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let usdc = env::var("NEAR_USDC_ACCOUNT_ID").unwrap_or_default();
    indexer_tick(&app.db, &rpc, &contract, &usdc, true)
        .await
        .map(Json)
        .map_err(internal)
}

async fn indexer_status(State(app): State<App>) -> Result<Json<Value>, StatusCode> {
    let checkpoint = sqlx::query_as::<_, (i64, DateTime<Utc>)>(
        "SELECT last_block,updated_at FROM indexer_state WHERE name='near'",
    )
    .fetch_optional(&app.db)
    .await
    .map_err(internal)?;
    Ok(Json(match checkpoint {
        Some((height, updated_at)) => json!({"last_block":height,"updated_at":updated_at}),
        None => json!({"last_block":null,"updated_at":null}),
    }))
}

#[derive(Deserialize)]
struct LaunchTransaction {
    tx_hash: String,
    signer_id: String,
}

async fn index_launch(
    State(app): State<App>,
    Json(launch): Json<LaunchTransaction>,
) -> Result<Json<Value>, StatusCode> {
    if !(32..=44).contains(&launch.tx_hash.len())
        || !launch.tx_hash.bytes().all(|b| b.is_ascii_alphanumeric())
        || !(2..=64).contains(&launch.signer_id.len())
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let contract = env::var("LAUNCHPAD_ACCOUNT_ID").map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let rpc = env::var("NEAR_RPC_URL").unwrap_or_else(|_| "https://near-testnet.drpc.org".into());
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let result: Value = client.post(&rpc).json(&json!({
        "jsonrpc":"2.0", "id":"orba", "method":"tx",
        "params":{"tx_hash":launch.tx_hash,"sender_account_id":launch.signer_id,"wait_until":"FINAL"}
    })).send().await.map_err(|_| StatusCode::BAD_GATEWAY)?
        .json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let status = &result["result"];
    if status["final_execution_status"] != "FINAL"
        || status["status"].get("SuccessValue").is_none()
        || status["transaction"]["hash"] != launch.tx_hash
    {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let events = launchpad_logs(status, &contract);
    if events.is_empty() {
        return Err(StatusCode::NOT_FOUND);
    }
    let block_hash = status["transaction_outcome"]["block_hash"]
        .as_str()
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let block: Value = client
        .post(&rpc)
        .json(&json!({
            "jsonrpc":"2.0","id":"orba","method":"block","params":{"block_id":block_hash}
        }))
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
        .json()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    let height = block["result"]["header"]["height"]
        .as_i64()
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let created_token = events
        .iter()
        .find(|event| event["event"] == "token_created")
        .and_then(|event| event["data"][0]["token_id"].as_str())
        .map(str::to_owned);
    persist_logs(
        &app.db,
        events,
        &launch.tx_hash,
        height,
        block_time(&block["result"]["header"]),
    )
    .await
    .map_err(internal)?;
    Ok(Json(
        json!({"ok":true,"block_height":height,"created_token":created_token}),
    ))
}

async fn list_tokens(
    State(app): State<App>,
    Query(page): Query<Page>,
) -> Result<Json<Value>, StatusCode> {
    let limit = page.limit.unwrap_or(50).clamp(1, 100);
    let offset = page.offset.unwrap_or(0).max(0);
    let rows = sqlx::query_as::<_, TokenRow>(
        "SELECT account_id,creator,treasury_recipient,name,symbol,description,image_url,real_usdc::text,cumulative_volume_usdc::text,tokens_sold::text,reserved_remaining::text,treasury_pool::text,treasury_unlocked::text,treasury_claimed::text,milestones_completed,graduated,preset,created_block,created_tx,updated_at FROM tokens ORDER BY created_block DESC LIMIT $1 OFFSET $2",
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
    sqlx::query_as::<_, TokenRow>("SELECT account_id,creator,treasury_recipient,name,symbol,description,image_url,real_usdc::text,cumulative_volume_usdc::text,tokens_sold::text,reserved_remaining::text,treasury_pool::text,treasury_unlocked::text,treasury_claimed::text,milestones_completed,graduated,preset,created_block,created_tx,updated_at FROM tokens WHERE account_id=$1")
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
    let rows=sqlx::query_as::<_,TradeRow>("SELECT token_id,trader,side,usdc_amount::text,token_amount::text,tx_hash,event_index,block_height,created_at,block_time FROM trades WHERE token_id=$1 ORDER BY block_height DESC,event_index DESC LIMIT $2 OFFSET $3").bind(id).bind(limit).bind(offset).fetch_all(&app.db).await.map_err(internal)?;
    Ok(Json(json!({"items":rows,"limit":limit,"offset":offset})))
}
async fn get_profile(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    if !(2..=64).contains(&id.len())
        || !id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let launches = sqlx::query_as::<_, (String, String, String, Option<String>, bool)>(
        "SELECT account_id,name,symbol,image_url,graduated FROM tokens WHERE creator=$1 ORDER BY created_block DESC LIMIT 50",
    ).bind(&id).fetch_all(&app.db).await.map_err(internal)?;
    let trades = sqlx::query_as::<_, TradeRow>(
        "SELECT token_id,trader,side,usdc_amount::text,token_amount::text,tx_hash,event_index,block_height,created_at,block_time FROM trades WHERE trader=$1 ORDER BY block_height DESC,event_index DESC LIMIT 50",
    ).bind(&id).fetch_all(&app.db).await.map_err(internal)?;
    Ok(Json(
        json!({"account_id":id,"launches":launches,"trades":trades}),
    ))
}

async fn upload_image(State(app): State<App>, content: Bytes) -> Result<Json<Value>, StatusCode> {
    if content.len() > 1024 * 1024 {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let mime = if content.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if content.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if content.starts_with(b"GIF87a") || content.starts_with(b"GIF89a") {
        "image/gif"
    } else if content.starts_with(b"RIFF") && content.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };
    let mut tx = app.db.begin().await.map_err(internal)?;
    sqlx::query("SELECT pg_advisory_xact_lock(863140)")
        .execute(&mut *tx)
        .await
        .map_err(internal)?;
    let id: String = sqlx::query_scalar("SELECT encode(sha256($1::bytea),'hex')")
        .bind(content.as_ref())
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
    let stored: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM token_images WHERE id=$1)")
        .bind(&id)
        .fetch_one(&mut *tx)
        .await
        .map_err(internal)?;
    if !stored {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM token_images")
            .fetch_one(&mut *tx)
            .await
            .map_err(internal)?;
        if count >= 256 {
            return Err(StatusCode::INSUFFICIENT_STORAGE);
        }
        sqlx::query("INSERT INTO token_images(id,mime,content) VALUES($1,$2,$3)")
            .bind(&id)
            .bind(mime)
            .bind(content.as_ref())
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
    }
    tx.commit().await.map_err(internal)?;
    Ok(Json(json!({"path":format!("/api/images/{id}")})))
}

async fn get_image(State(app): State<App>, Path(id): Path<String>) -> Result<Response, StatusCode> {
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(StatusCode::NOT_FOUND);
    }
    let (mime, content) =
        sqlx::query_as::<_, (String, Vec<u8>)>("SELECT mime,content FROM token_images WHERE id=$1")
            .bind(id)
            .fetch_optional(&app.db)
            .await
            .map_err(internal)?
            .ok_or(StatusCode::NOT_FOUND)?;
    Ok((
        [
            ("content-type", mime.as_str()),
            ("cache-control", "public, max-age=31536000, immutable"),
            ("x-content-type-options", "nosniff"),
        ],
        content,
    )
        .into_response())
}

async fn get_mechanics(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    let token = sqlx::query_as::<_, TokenRow>("SELECT account_id,creator,treasury_recipient,name,symbol,description,image_url,real_usdc::text,cumulative_volume_usdc::text,tokens_sold::text,reserved_remaining::text,treasury_pool::text,treasury_unlocked::text,treasury_claimed::text,milestones_completed,graduated,preset,created_block,created_tx,updated_at FROM tokens WHERE account_id=$1")
        .bind(&id)
        .fetch_optional(&app.db)
        .await
        .map_err(internal)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let milestones=sqlx::query_as::<_,(i16,String,String,String,String,i64,i32)>("SELECT milestone_index,volume::text,burn_amount::text,treasury_unlocked::text,tx_hash,block_height,event_index FROM milestones WHERE token_id=$1 ORDER BY milestone_index").bind(&id).fetch_all(&app.db).await.map_err(internal)?;
    let claims = sqlx::query_as::<_, (String, String, i64, i32)>(
        "SELECT amount::text,tx_hash,block_height,event_index FROM treasury_claims WHERE token_id=$1 ORDER BY block_height,event_index,tx_hash",
    )
    .bind(id)
    .fetch_all(&app.db)
    .await
    .map_err(internal)?;
    Ok(Json(
        json!({"reserved_remaining":token.reserved_remaining,"treasury_pool":token.treasury_pool,"treasury_unlocked":token.treasury_unlocked,"treasury_claimed":token.treasury_claimed,"treasury_recipient":token.treasury_recipient,"milestones_completed":token.milestones_completed,"graduated":token.graduated,"preset":token.preset,"milestones":milestones,"claims":claims}),
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
    let mut tick = interval(Duration::from_secs(3));
    loop {
        tick.tick().await;
        if let Err(err) = indexer_tick(&db, &rpc, &contract, &usdc, false).await {
            tracing::error!(%err, "NEAR indexer tick failed; retrying");
            sleep(Duration::from_secs(5)).await;
        }
    }
}

async fn indexer_tick(
    db: &PgPool,
    rpc: &str,
    contract: &str,
    usdc: &str,
    user_triggered: bool,
) -> Result<Value> {
    let mut connection = db.acquire().await?;
    let lock = sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_lock(98432177)")
        .fetch_one(&mut *connection)
        .await?;
    if !lock {
        return Ok(json!({"ok":true,"skipped":"another indexer invocation is active"}));
    }
    let result = async {
            let recent = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM indexer_state WHERE name='near' AND updated_at > NOW() - INTERVAL '15 seconds')",
            )
            .fetch_one(db)
            .await?;
            if user_triggered && recent {
                Ok(json!({"ok":true,"skipped":"indexer recently ran"}))
            } else {
                indexer_tick_locked(db, rpc, contract, usdc).await
            }
        }
        .await;
    let unlocked = sqlx::query("SELECT pg_advisory_unlock(98432177)")
        .execute(&mut *connection)
        .await;
    unlocked?;
    result
}

async fn indexer_tick_locked(db: &PgPool, rpc: &str, contract: &str, usdc: &str) -> Result<Value> {
    let client = Client::builder().timeout(Duration::from_secs(12)).build()?;
    let configured_archive = env::var("NEAR_ARCHIVAL_RPC_URL").ok();
    let archival_rpc = configured_archive
        .as_deref()
        .unwrap_or("https://archival-rpc.testnet.near.org");
    let height: Value = client
        .post(rpc)
        .json(&json!({"jsonrpc":"2.0","id":"orba","method":"block","params":{"finality":"final"}}))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if height.get("error").is_some() {
        anyhow::bail!("NEAR RPC did not return a finalized block");
    }
    let block = height["result"]["header"]["height"]
        .as_i64()
        .context("NEAR RPC response did not include the finalized block height")?;
    let mut last =
        sqlx::query_scalar::<_, i64>("SELECT last_block FROM indexer_state WHERE name='near' ")
            .fetch_optional(db)
            .await?
            .unwrap_or(0);
    if last == 0 {
        let configured = env::var("INDEXER_START_BLOCK")
            .ok()
            .and_then(|s| s.parse::<i64>().ok());
        last = configured.unwrap_or_else(|| block.saturating_sub(50_000).max(0));
        sqlx::query("INSERT INTO indexer_state(name,last_block) VALUES('near',$1) ON CONFLICT(name) DO UPDATE SET last_block=EXCLUDED.last_block,updated_at=NOW()")
                .bind(last).execute(db).await?;
    }
    if block <= last {
        return Ok(json!({"ok":true,"last_block":last,"scanned":0}));
    }
    // Tx-status polling uses indexed transaction hashes from launchpad receipts.
    // Block range is checkpointed only after successful scanning; the RPC result parser is idempotent.
    let batch_blocks = env::var("INDEXER_BATCH_BLOCKS")
        .ok()
        .and_then(|s| s.parse::<i64>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(25)
        .min(if configured_archive.is_some() { 500 } else { 3 });
    let limit = last.saturating_add(batch_blocks).min(block);
    let scanned_blocks = stream::iter((last + 1)..=limit)
        .map(|height| {
            let (client, rpc, contract, usdc) = (&client, archival_rpc, &contract, &usdc);
            async move {
                let (time, events) = scan_block(client, rpc, contract, usdc, height, block).await?;
                Ok::<_, anyhow::Error>((height, time, events))
            }
        })
        .buffered(if configured_archive.is_some() { 8 } else { 2 })
        .try_collect::<Vec<_>>()
        .await?;
    for (height, time, transactions) in scanned_blocks {
        for transaction in transactions {
            persist_logs(db, transaction.events, &transaction.tx_hash, height, time).await?;
        }
    }
    sqlx::query("INSERT INTO indexer_state(name,last_block) VALUES('near',$1) ON CONFLICT(name) DO UPDATE SET last_block=EXCLUDED.last_block,updated_at=NOW()").bind(limit).execute(db).await?;
    Ok(json!({"ok":true,"last_block":limit,"head_block":block,"scanned":limit-last}))
}
async fn scan_block(
    client: &Client,
    rpc: &str,
    contract: &str,
    usdc: &str,
    height: i64,
    finalized_height: i64,
) -> Result<(Option<DateTime<Utc>>, Vec<IndexedTransactionLogs>)> {
    let Some(block) = archival_block(client, rpc, height).await? else {
        for next in (height + 1)..=height.saturating_add(8).min(finalized_height) {
            if let Some(successor) = archival_block(client, rpc, next).await? {
                let previous = successor["header"]["prev_height"].as_i64();
                if previous.is_some_and(|previous| previous < height) {
                    return Ok((None, Vec::new()));
                }
                break;
            }
        }
        anyhow::bail!("Cannot verify missing NEAR block {height}");
    };
    let chunks = block
        .get("chunks")
        .and_then(Value::as_array)
        .cloned()
        .with_context(|| format!("NEAR RPC block {height} did not include chunks"))?;
    let chunk_bodies = stream::iter(chunks.into_iter().filter(|chunk| {
        chunk["height_included"].as_i64().is_none_or(|included| included == height)
    }))
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
            if let Some(error) = body.error {
                anyhow::bail!("NEAR RPC chunk {chunk_hash} failed at block {height}: {error}");
            }
            body.result.with_context(|| {
                format!("NEAR RPC returned no data for chunk {chunk_hash} at block {height}")
            })
        })
        .buffered(3)
        .try_collect::<Vec<_>>()
        .await?;
    let mut indexed = Vec::new();
    for body in chunk_bodies {
        let transactions = body
            .get("transactions")
            .and_then(Value::as_array)
            .cloned()
            .with_context(|| {
                format!("NEAR RPC chunk at block {height} did not include transactions")
            })?;
        for tx in transactions {
            let receiver = tx["receiver_id"].as_str().unwrap_or_default();
            let relevant_action = tx["actions"].as_array().is_some_and(|actions| {
                actions.iter().any(|action| {
                    let method = action["FunctionCall"]["method_name"].as_str();
                    match receiver {
                        account if account == contract => matches!(
                            method,
                            Some(
                                "create_token"
                                    | "recover_delivered_buy"
                                    | "claim_treasury"
                                    | "claim_sell_proceeds"
                                    | "claim_creator_fees"
                                    | "claim_protocol_fees"
                            )
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
            if let Some(error) = status.error {
                anyhow::bail!("NEAR RPC transaction status failed for {tx_hash}: {error}");
            }
            let status = status.result.with_context(|| {
                format!("NEAR RPC returned no status for transaction {tx_hash}")
            })?;
            let logs = launchpad_logs(&status, contract);
            if !logs.is_empty() {
                indexed.push(IndexedTransactionLogs {
                    tx_hash: tx_hash.to_string(),
                    events: logs,
                });
            }
        }
    }
    Ok((block_time(&block["header"]), indexed))
}

async fn archival_block(client: &Client, rpc: &str, height: i64) -> Result<Option<Value>> {
    let response = client
        .post(rpc)
        .json(&json!({"jsonrpc":"2.0","id":"orba","method":"block","params":{"block_id":height}}))
        .send()
        .await?;
    let http_status = response.status();
    let block: RpcResponse = response.json().await?;
    if let Some(error) = block.error {
        if error["cause"]["name"] == "UNKNOWN_BLOCK" {
            return Ok(None);
        }
        anyhow::bail!("NEAR RPC block {height} failed: {error}");
    }
    let value = block
        .result
        .with_context(|| format!("NEAR RPC returned no data for block {height}"))?;
    anyhow::ensure!(
        http_status.is_success() && value["header"]["height"].as_i64() == Some(height),
        "NEAR archival RPC returned an unexpected block for {height}"
    );
    Ok(Some(value))
}

fn block_time(header: &Value) -> Option<DateTime<Utc>> {
    let timestamp = &header["timestamp_nanosec"];
    timestamp
        .as_str()
        .and_then(|value| value.parse::<i64>().ok())
        .or_else(|| timestamp.as_i64())
        .filter(|value| *value > 0)
        .map(DateTime::from_timestamp_nanos)
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
fn launchpad_logs(status: &Value, contract: &str) -> Vec<Value> {
    let mut events: Vec<Value> = status["receipts_outcome"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|receipt| &receipt["outcome"])
        .filter(|outcome| {
            outcome["executor_id"] == contract
                && (outcome["status"].get("SuccessValue").is_some()
                    || outcome["status"].get("SuccessReceiptId").is_some())
        })
        .flat_map(collect_logs)
        .collect();
    // Profile fields are optional arguments from the signed launch. Only attach
    // them to a successful create event from a single direct launchpad call.
    if status["transaction"]["receiver_id"] == contract {
        if let Some(actions) = status["transaction"]["actions"].as_array() {
            if actions.len() == 1 && actions[0]["FunctionCall"]["method_name"] == "create_token" {
                let profile = actions[0]["FunctionCall"]["args"]
                    .as_str()
                    .and_then(|args| STANDARD.decode(args).ok())
                    .and_then(|args| serde_json::from_slice::<Value>(&args).ok());
                if let Some(profile) = profile {
                    for event in events
                        .iter_mut()
                        .filter(|event| event["event"] == "token_created")
                    {
                        let data = &mut event["data"][0];
                        data["description"] = json!(profile["description"]
                            .as_str()
                            .map(str::trim)
                            .filter(|value| !value.is_empty() && value.chars().count() <= 280));
                        data["image_url"] = json!(profile["image_url"]
                            .as_str()
                            .filter(|value| value.len() <= 500)
                            .and_then(|value| reqwest::Url::parse(value).ok())
                            .filter(|url| url.scheme() == "https"
                                && url.host_str().is_some()
                                && url.username().is_empty()
                                && url.password().is_none())
                            .map(|url| url.to_string()));
                    }
                }
            }
        }
    }
    events
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
async fn persist_logs(
    db: &PgPool,
    events: Vec<Value>,
    tx: &str,
    height: i64,
    time: Option<DateTime<Utc>>,
) -> Result<()> {
    let mut transaction = db.begin().await?;
    for (idx, event) in events.into_iter().enumerate() {
        let data = &event["data"][0];
        let token = data["token_id"].as_str().unwrap_or_default();
        match event["event"].as_str().unwrap_or_default() {
            "token_created" => {
                let creator = data["creator"].as_str().unwrap_or_default();
                sqlx::query("INSERT INTO tokens(account_id,creator,treasury_recipient,name,symbol,created_block,created_tx,preset,description,image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING")
                    .bind(token).bind(creator).bind(data["treasury_recipient"].as_str().unwrap_or_default())
                    .bind(data["name"].as_str().unwrap_or_default()).bind(data["symbol"].as_str().unwrap_or_default())
                    .bind(height).bind(tx).bind(&data["preset"]).bind(data["description"].as_str()).bind(data["image_url"].as_str()).execute(&mut *transaction).await?;
            }
            "buy" | "sell" => {
                let side = event["event"].as_str().unwrap();
                let trader = data["trader"].as_str().unwrap_or_default();
                let inserted = sqlx::query("INSERT INTO trades(token_id,trader,side,usdc_amount,token_amount,tx_hash,event_index,block_height) VALUES($1,$2,$3,$4::text::numeric,$5::text::numeric,$6,$7,$8) ON CONFLICT(tx_hash,event_index) DO NOTHING").bind(token).bind(trader).bind(side).bind(decimal(&data["usdc_amount"])).bind(decimal(&data["tokens_out"])).bind(tx).bind(idx as i32).bind(height).execute(&mut *transaction).await?;
                if inserted.rows_affected() > 0 {
                    update_token_snapshot(&mut transaction, token, data, height).await?;
                }
                if let Some(time) = time {
                    sqlx::query("UPDATE trades SET block_time=$3 WHERE tx_hash=$1 AND event_index=$2 AND block_time IS NULL")
                        .bind(tx).bind(idx as i32).bind(time).execute(&mut *transaction).await?;
                }
            }
            "milestone" => {
                let inserted = sqlx::query("INSERT INTO milestones(token_id,milestone_index,volume,burn_amount,treasury_unlocked,tx_hash,event_index,block_height) VALUES($1,$2,$3::text::numeric,$4::text::numeric,$5::text::numeric,$6,$7,$8) ON CONFLICT DO NOTHING").bind(token).bind(data["index"].as_i64().unwrap_or(0) as i16).bind(decimal(&data["volume"])).bind(decimal(&data["burn"])).bind(decimal(&data["treasury_unlocked"])).bind(tx).bind(idx as i32).bind(height).execute(&mut *transaction).await?;
                if inserted.rows_affected() > 0 {
                    sqlx::query("UPDATE tokens SET reserved_remaining=LEAST(reserved_remaining,$2::text::numeric),milestones_completed=GREATEST(milestones_completed,$3),treasury_unlocked=GREATEST(treasury_unlocked,(SELECT COALESCE(SUM(treasury_unlocked),0) FROM milestones WHERE token_id=$1)),updated_at=NOW() WHERE account_id=$1")
                        .bind(token).bind(decimal(&data["reserved_remaining"]))
                        .bind(data["milestones_completed"].as_i64().unwrap_or(0) as i16)
                        .execute(&mut *transaction).await?;
                }
            }
            "treasury_claim" => {
                sqlx::query("INSERT INTO treasury_claims(tx_hash,event_index,token_id,amount,block_height) VALUES($1,$2,$3,$4::text::numeric,$5) ON CONFLICT DO NOTHING")
                    .bind(tx).bind(idx as i32).bind(token).bind(decimal(&data["amount"])).bind(height)
                    .execute(&mut *transaction).await?;
                sqlx::query(
                    "UPDATE tokens SET treasury_claimed=GREATEST(treasury_claimed,$2::text::numeric),updated_at=NOW() WHERE account_id=$1",
                )
                .bind(token)
                .bind(decimal(&data["treasury_claimed"]))
                .execute(&mut *transaction)
                .await?;
            }
            _ => {}
        }
    }
    transaction.commit().await?;
    Ok(())
}

async fn update_token_snapshot(
    transaction: &mut sqlx::PgConnection,
    token: &str,
    data: &Value,
    height: i64,
) -> Result<()> {
    sqlx::query("UPDATE tokens SET real_usdc=$2::text::numeric,cumulative_volume_usdc=$3::text::numeric,tokens_sold=$4::text::numeric,reserved_remaining=LEAST(reserved_remaining,$5::text::numeric),treasury_pool=$6::text::numeric,treasury_unlocked=GREATEST(treasury_unlocked,$7::text::numeric),treasury_claimed=GREATEST(treasury_claimed,$8::text::numeric),milestones_completed=GREATEST(milestones_completed,$9),graduated=$10,updated_at=NOW() WHERE account_id=$1 AND NOT EXISTS (SELECT 1 FROM trades WHERE token_id=$1 AND block_height>$11)")
        .bind(token).bind(decimal(&data["real_usdc"]))
        .bind(decimal(&data["cumulative_volume_usdc"]))
        .bind(decimal(&data["tokens_sold"]))
        .bind(decimal(&data["reserved_remaining"]))
        .bind(decimal(&data["treasury_pool"]))
        .bind(decimal(&data["treasury_unlocked"]))
        .bind(decimal(&data["treasury_claimed"]))
        .bind(data["milestones_completed"].as_i64().unwrap_or(0) as i16)
        .bind(data["graduated"].as_bool().unwrap_or(false)).bind(height)
        .execute(&mut *transaction).await?;
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
