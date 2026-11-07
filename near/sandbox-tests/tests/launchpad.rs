use anyhow::{Context, Result};
use near_workspaces::types::NearToken;
use near_workspaces::{Account, AccountId, Contract, Worker, network::Sandbox};
use serde_json::{Value, json};

const TOKEN_WASM: &[u8] =
    include_bytes!("../../target/wasm32-unknown-unknown/release/orba_near_token.wasm");
const LAUNCHPAD_WASM: &[u8] =
    include_bytes!("../../target/wasm32-unknown-unknown/release/orba_near_launchpad.wasm");
const USDC_SUPPLY: &str = "1000000000000"; // 1,000,000 USDC (6 decimals)
const STORAGE_DEPOSIT: NearToken = NearToken::from_near(1);

struct Fixture {
    worker: Worker<Sandbox>,
    buyer: Account,
    treasury: Account,
    usdc: Contract,
    launchpad: Contract,
    token_id: AccountId,
}

async fn setup(preset: &str) -> Result<Fixture> {
    let worker = near_workspaces::sandbox().await?;
    let creator = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;
    let treasury = worker.dev_create_account().await?;
    let usdc = worker.dev_deploy(TOKEN_WASM).await?;
    let launchpad = worker.dev_deploy(LAUNCHPAD_WASM).await?;

    launchpad
        .call("new")
        .args_json(json!({
            "owner": creator.id(),
            "usdc_id": usdc.id(),
            "token_wasm": TOKEN_WASM,
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Initialize mock USDC from the launchpad account so its initial balance
    // belongs to the launchpad, as it will for treasury and sale payouts.
    launchpad
        .as_account()
        .call(usdc.id(), "new")
        .args_json(json!({
            "name": "Sandbox USDC",
            "symbol": "USDC",
            "total_supply": USDC_SUPPLY,
        }))
        .transact()
        .await?
        .into_result()?;

    register(&buyer, usdc.id()).await?;
    launchpad
        .as_account()
        .call(usdc.id(), "ft_transfer")
        .args_json(json!({
            "receiver_id": buyer.id(),
            "amount": "500000000000",
            "memo": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    creator
        .call(launchpad.id(), "create_token")
        .args_json(json!({
            "name": "Sandbox Orba",
            "symbol": "SBOX",
            "treasury_recipient": treasury.id(),
            "preset_name": preset,
        }))
        .max_gas()
        .deposit(NearToken::from_near(10))
        .transact()
        .await?
        .into_result()?;

    let token_id: AccountId = format!("token-0.{}", launchpad.id()).parse()?;
    worker
        .view_account(&token_id)
        .await
        .context("token subaccount was not created")?;
    register(&buyer, &token_id).await?;

    Ok(Fixture {
        worker,
        buyer,
        treasury,
        usdc,
        launchpad,
        token_id,
    })
}

async fn register(account: &Account, token_id: &AccountId) -> Result<()> {
    account
        .call(token_id, "storage_deposit")
        .args_json(json!({ "account_id": account.id(), "registration_only": true }))
        .deposit(STORAGE_DEPOSIT)
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn token_state(launchpad: &Contract, token_id: &AccountId) -> Result<Value> {
    Ok(launchpad
        .view("get_token")
        .args_json(json!({ "token_id": token_id }))
        .await?
        .json::<Value>()?)
}

async fn buy(
    f: &Fixture,
    amount: &str,
    min_tokens_out: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let message = json!({
        "action": "buy",
        "token_id": f.token_id,
        "min_tokens_out": min_tokens_out,
    })
    .to_string();
    Ok(f.buyer
        .call(f.usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": f.launchpad.id(),
            "amount": amount,
            "memo": null,
            "msg": message,
        }))
        .max_gas()
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?)
}

#[tokio::test]
async fn launch_buy_sell_and_failed_then_successful_treasury_claim() -> Result<()> {
    let f = setup("spark").await?;

    let quote: Value = f
        .launchpad
        .view("quote_buy")
        .args_json(json!({ "token_id": f.token_id, "usdc_amount": "11000000" }))
        .await?
        .json()?;
    let quoted_tokens = quote
        .as_str()
        .context("quote_buy must return U128 string")?;

    // A failed receiver call must resolve back to the buyer without mutating curve state.
    let invalid_token_msg = json!({
        "action": "buy",
        "token_id": "missing.test.near",
        "min_tokens_out": "1",
    })
    .to_string();
    let invalid_token_result = f
        .buyer
        .call(f.usdc.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": f.launchpad.id(),
            "amount": "1000000",
            "memo": null,
            "msg": invalid_token_msg,
        }))
        .max_gas()
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(invalid_token_result.is_success());
    let buyer_usdc_after_invalid: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    assert_eq!(buyer_usdc_after_invalid, "500000000000");

    let slippage = buy(&f, "11000000", "999999999999999999999999999999").await?;
    assert!(
        slippage.is_success(),
        "NEP-141 resolver should refund slippage"
    );
    let unchanged: Value = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(unchanged["cumulative_volume_usdc"], 0);
    let after_slippage_usdc: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    assert_eq!(after_slippage_usdc, "500000000000");
    let valid = buy(&f, "11000000", "1").await?;
    assert!(valid.is_success(), "valid buy should succeed");
    let state = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(
        state["milestones_completed"], 1,
        "first milestone missing; state={state}"
    );
    assert!(state["treasury_unlocked"].as_u64().unwrap_or_default() > 0);

    // The fixed recipient has no USDC storage registration yet, so the first
    // cross-contract payout fails. The callback must restore claim accounting.
    let unauthorized = f
        .buyer
        .call(f.launchpad.id(), "claim_treasury")
        .args_json(json!({ "token_id": f.token_id }))
        .max_gas()
        .transact()
        .await?;
    assert!(!unauthorized.is_success());
    let failed_claim = f
        .treasury
        .call(f.launchpad.id(), "claim_treasury")
        .args_json(json!({ "token_id": f.token_id }))
        .max_gas()
        .transact()
        .await?;
    assert!(
        failed_claim.is_success(),
        "callback should complete after restoring a failed payout"
    );
    let restored = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(restored["treasury_claimed"], 0);

    register(&f.treasury, f.usdc.id()).await?;
    let claim = f
        .treasury
        .call(f.launchpad.id(), "claim_treasury")
        .args_json(json!({ "token_id": f.token_id }))
        .max_gas()
        .transact()
        .await?;
    assert!(
        claim.is_success(),
        "registered recipient claim should succeed"
    );
    let claimed = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(claimed["treasury_claimed"], claimed["treasury_unlocked"]);

    // Sell some bought tokens through NEP-141 transfer_call and verify pricing.
    let balance: String = f
        .worker
        .view(&f.token_id, "ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    let sell_amount = (balance.parse::<u128>()? / 2).to_string();
    let sell_msg = json!({
        "action": "sell",
        "token_id": f.token_id,
        "min_usdc_out": "1",
    })
    .to_string();
    let sale = f
        .buyer
        .call(&f.token_id, "ft_transfer_call")
        .args_json(json!({
            "receiver_id": f.launchpad.id(),
            "amount": sell_amount,
            "memo": null,
            "msg": sell_msg,
        }))
        .max_gas()
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    for receipt in sale.receipt_failures() {
        eprintln!("sell failed receipt: {receipt:#?}");
    }
    assert!(sale.is_success(), "sell should succeed: {sale:#?}");
    assert!(quoted_tokens.parse::<u128>()? > 0);
    let final_state = token_state(&f.launchpad, &f.token_id).await?;
    assert!(final_state["tokens_sold"].as_f64().unwrap_or_default() > 0.0);
    let balance_before_sell_claim: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    let sell_claim = f
        .buyer
        .call(f.launchpad.id(), "claim_sell_proceeds")
        .max_gas()
        .transact()
        .await?;
    for receipt in sell_claim.receipt_failures() {
        eprintln!("sell proceeds claim failed receipt: {receipt:#?}");
    }
    assert!(
        sell_claim.is_success(),
        "sell proceeds claim should succeed"
    );
    let balance_after_sell_claim: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    assert!(balance_after_sell_claim.parse::<u128>()? > balance_before_sell_claim.parse::<u128>()?);
    Ok(())
}

#[tokio::test]
async fn high_volume_triggers_all_burns_and_locks_trading_after_graduation() -> Result<()> {
    let f = setup("spark").await?;
    let buy_result = buy(&f, "12000000000", "1").await?;
    assert!(buy_result.is_success(), "high volume buy should complete");

    let state = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(
        state["milestones_completed"], 3,
        "all milestones missing; state={state}"
    );
    assert_eq!(state["reserved_remaining"], 0);
    assert_eq!(state["graduated"], true);
    assert!(
        buy_result
            .logs()
            .iter()
            .any(|log| log.contains("\"event\":\"milestone\"")),
        "milestone transaction must emit NEP-297 event logs"
    );

    let supply: String = f
        .worker
        .view(&f.token_id, "ft_total_supply")
        .await?
        .json()?;
    assert_eq!(supply, "880000000000000000000000000");

    let buyer_usdc_before: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    let locked = buy(&f, "1000000", "1").await?;
    assert!(
        locked.is_success(),
        "NEP-141 resolver should complete the locked-trade refund"
    );
    let buyer_usdc_after: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    assert_eq!(buyer_usdc_before, buyer_usdc_after);

    let _ = f.worker.view_block().await?;
    Ok(())
}

#[tokio::test]
async fn buy_below_first_threshold_settles_delivery_callback() -> Result<()> {
    let f = setup("spark").await?;
    let outcome = buy(&f, "1000000", "1").await?;
    assert!(outcome.is_success());
    let state = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(
        state["pending"], false,
        "buy delivery did not settle: {state}"
    );
    assert_eq!(state["milestones_completed"], 0);
    Ok(())
}
