use anyhow::{Context, Result};
use near_workspaces::types::NearToken;
use near_workspaces::{Account, AccountId, Contract, Worker, network::Sandbox};
use serde_json::{Value, json};

const TOKEN_WASM: &[u8] =
    include_bytes!("../../target/wasm32-unknown-unknown/release/orba_near_token.wasm");
const LAUNCHPAD_WASM: &[u8] =
    include_bytes!("../../target/wasm32-unknown-unknown/release/orba_near_launchpad.wasm");
const USDC_SUPPLY: &str = "30000000000000"; // 30,000,000 USDC (6 decimals)
const STORAGE_DEPOSIT: NearToken = NearToken::from_near(1);

struct Fixture {
    worker: Worker<Sandbox>,
    buyer: Account,
    creator: Account,
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
            "amount": "10000000000000",
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
            "description": "Optional signed launch profile",
            "image_url": "https://example.org/token.png",
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
        creator,
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
    assert_eq!(buyer_usdc_after_invalid, "10000000000000");

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
    assert_eq!(after_slippage_usdc, "10000000000000");
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
async fn settled_buys_unlock_new_treasury_fees_after_the_final_burn() -> Result<()> {
    let f = setup("spark").await?;
    let crossing = buy(&f, "160000000", "1").await?;
    assert!(crossing.is_success() && crossing.receipt_failures().is_empty());
    let before = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(before["milestones_completed"], 3);
    assert_eq!(before["reserved_remaining"], 0);
    assert_eq!(before["treasury_unlocked"], before["treasury_pool"]);

    let later = buy(&f, "11000000", "1").await?;
    assert!(later.is_success() && later.receipt_failures().is_empty());
    let after = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(after["milestones_completed"], 3);
    assert_eq!(after["reserved_remaining"], 0);
    assert_eq!(after["treasury_unlocked"], after["treasury_pool"]);
    assert_eq!(
        after["treasury_unlocked"].as_u64().unwrap(),
        before["treasury_unlocked"].as_u64().unwrap() + 27_500
    );
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

    let allocations: (String, String, String) = f
        .launchpad
        .view("get_supply_allocations")
        .args_json(json!({ "token_id": f.token_id }))
        .await?
        .json()?;
    assert_eq!(
        allocations,
        (
            "800000000000000000000000000".into(),
            "120000000000000000000000000".into(),
            "80000000000000000000000000".into(),
        )
    );
    let liquidity_inventory: String = f
        .worker
        .view(&f.token_id, "ft_balance_of")
        .args_json(json!({ "account_id": f.launchpad.id() }))
        .await?
        .json()?;
    assert_eq!(liquidity_inventory, allocations.2);

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

#[tokio::test]
async fn oversized_buy_refunds_input_beyond_curve_inventory() -> Result<()> {
    let f = setup("spark").await?;
    let before: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    let receipt = buy(&f, "10000000000000", "1").await?;
    assert!(
        receipt.is_success(),
        "capped buy should settle: {receipt:#?}"
    );
    let after: String = f
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    let spent = before.parse::<u128>()? - after.parse::<u128>()?;
    let buyer_tokens: String = f
        .worker
        .view(&f.token_id, "ft_balance_of")
        .args_json(json!({ "account_id": f.buyer.id() }))
        .await?
        .json()?;
    assert_eq!(buyer_tokens, "800000000000000000000000000");
    assert!(spent < 10_000_000_000_000);
    Ok(())
}

#[tokio::test]
async fn failed_token_delivery_restores_accounting_and_credits_refund() -> Result<()> {
    let f = setup("spark").await?;
    // The buyer has no token storage, so the token transfer fails after USDC was received.
    // Existing setup registered it; unregistering is intentionally unavailable. Use a new account.
    let unregistered = f.worker.dev_create_account().await?;
    register(&unregistered, f.usdc.id()).await?;
    f.launchpad
        .as_account()
        .call(f.usdc.id(), "ft_transfer")
        .args_json(json!({"receiver_id":unregistered.id(),"amount":"1000000","memo":null}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    let msg = json!({"action":"buy","token_id":f.token_id,"min_tokens_out":"1"}).to_string();
    let result = unregistered
        .call(f.usdc.id(), "ft_transfer_call")
        .args_json(json!({"receiver_id":f.launchpad.id(),"amount":"1000000","memo":null,"msg":msg}))
        .max_gas()
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(result.is_success());
    let claimable: String = f
        .launchpad
        .view("get_claimable_usdc")
        .args_json(json!({"account_id":unregistered.id()}))
        .await?
        .json()?;
    assert_eq!(claimable, "1000000");
    let state = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(state["real_usdc"], 0);
    assert_eq!(state["tokens_sold"], 0);
    Ok(())
}

#[tokio::test]
async fn creator_and_owner_can_claim_accrued_fees() -> Result<()> {
    let f = setup("spark").await?;
    assert!(buy(&f, "100000000", "1").await?.is_success());
    let state = token_state(&f.launchpad, &f.token_id).await?;
    assert!(state["creator_fees"].as_u64().unwrap_or_default() > 0);
    assert!(state["protocol_fees"].as_u64().unwrap_or_default() > 0);
    let unauthorized = f
        .buyer
        .call(f.launchpad.id(), "claim_protocol_fees")
        .args_json(json!({"token_id":f.token_id}))
        .max_gas()
        .transact()
        .await?;
    assert!(!unauthorized.is_success());
    let failed_claim = f
        .creator
        .call(f.launchpad.id(), "claim_creator_fees")
        .args_json(json!({"token_id":f.token_id}))
        .max_gas()
        .transact()
        .await?;
    assert!(failed_claim.is_success());
    let restored = token_state(&f.launchpad, &f.token_id).await?;
    assert!(restored["creator_fees"].as_u64().unwrap_or_default() > 0);
    register(&f.creator, f.usdc.id()).await?;
    let creator_claim = f
        .creator
        .call(f.launchpad.id(), "claim_creator_fees")
        .args_json(json!({"token_id":f.token_id}))
        .max_gas()
        .transact()
        .await?;
    assert!(creator_claim.is_success());
    let owner_claim = f
        .creator
        .call(f.launchpad.id(), "claim_protocol_fees")
        .args_json(json!({"token_id":f.token_id}))
        .max_gas()
        .transact()
        .await?;
    assert!(owner_claim.is_success());
    let state = token_state(&f.launchpad, &f.token_id).await?;
    assert_eq!(state["creator_fees"], 0);
    assert_eq!(state["protocol_fees"], 0);
    Ok(())
}

#[tokio::test]
#[ignore = "imports the RHEA exchange bytecode from NEAR testnet"]
async fn graduates_into_rhea_and_swaps() -> Result<()> {
    let f = setup("spark").await?;
    let exchange_id: AccountId = "ref-finance-101.testnet".parse()?;
    let testnet = near_workspaces::testnet()
        .rpc_addr("https://near-testnet.drpc.org")
        .await?;
    let exchange = f
        .worker
        .import_contract(&exchange_id, &testnet)
        .initial_balance(NearToken::from_near(500))
        .transact()
        .await?;
    exchange
        .call("new")
        .args_json(json!({
            "owner_id": f.creator.id(), "exchange_fee": 0, "referral_fee": 0,
            "boost_farm_id":f.creator.id(),"burrowland_id":f.creator.id(),"wnear_id":f.usdc.id()
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    buy(&f, "12000000000", "1").await?.into_result()?;
    for deposit in [
        20_000_000_000_000_000_000_000,
        1_250_000_000_000_000_000_000,
        1_250_000_000_000_000_000_000,
        1,
        100_000_000_000_000_000_000_000,
        1,
        1,
        10_000_000_000_000_000_000_000,
        0,
    ] {
        let result = f
            .creator
            .call(f.launchpad.id(), "advance_dex_migration")
            .args_json(json!({"token_id":f.token_id}))
            .deposit(NearToken::from_yoctonear(deposit))
            .max_gas()
            .transact()
            .await?;
        assert!(
            result.failures().is_empty(),
            "migration failed: {result:#?}"
        );
        assert!(result.json::<bool>()?);
    }
    let migration: Value = f
        .launchpad
        .view("get_dex_migration")
        .args_json(json!({"token_id":f.token_id}))
        .await?
        .json()?;
    assert_eq!(migration["step"], "complete");
    assert_eq!(migration["seed_usdc"], "1548800007");
    assert_eq!(migration["retained_usdc"], "5491200030");
    let pool_id = migration["pool_id"].as_u64().context("pool ID")?;
    let shares: String = exchange
        .view("get_pool_shares")
        .args_json(json!({"pool_id":pool_id,"account_id":f.launchpad.id()}))
        .await?
        .json()?;
    assert_eq!(migration["shares"], shares);
    assert!(shares.parse::<u128>()? > 0);
    let quoted: String = exchange
        .view("get_return")
        .args_json(json!({
            "pool_id":pool_id,"token_in":f.usdc.id(),"amount_in":"1000000","token_out":f.token_id
        }))
        .await?
        .json()?;
    assert!(quoted.parse::<u128>()? > 0);
    f.buyer
        .call(exchange.id(), "storage_deposit")
        .args_json(json!({"account_id":f.buyer.id(),"registration_only":false}))
        .deposit(NearToken::from_millinear(20))
        .transact()
        .await?
        .into_result()?;
    f.buyer
        .call(exchange.id(), "register_tokens")
        .args_json(json!({"token_ids":[f.usdc.id(),f.token_id]}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    let used: String = f
        .buyer
        .call(f.usdc.id(), "ft_transfer_call")
        .args_json(json!({"receiver_id":exchange.id(),"amount":"1000000","msg":""}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?
        .json()?;
    assert_eq!(used, "1000000");
    f.buyer
        .call(exchange.id(), "swap")
        .args_json(json!({"actions":[{
            "pool_id":pool_id,"token_in":f.usdc.id(),"amount_in":"1000000",
            "token_out":f.token_id,"min_amount_out":quoted
        }]}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let deposits: Value = exchange
        .view("get_deposits")
        .args_json(json!({"account_id":f.buyer.id()}))
        .await?
        .json()?;
    assert_eq!(deposits[f.token_id.as_str()], quoted);

    let balance = |account_id| json!({ "account_id": account_id });
    let before: String = f
        .worker
        .view(&f.token_id, "ft_balance_of")
        .args_json(balance(f.buyer.id()))
        .await?
        .json()?;
    let quoted: String = exchange
        .view("get_return")
        .args_json(json!({
            "pool_id":pool_id,"token_in":f.usdc.id(),"amount_in":"1000000","token_out":f.token_id
        }))
        .await?
        .json()?;
    let swap_message = json!({"force":0,"actions":[{
        "pool_id":pool_id,"token_in":f.usdc.id(),"amount_in":"1000000",
        "token_out":f.token_id,"min_amount_out":quoted
    }]});
    let used: String = f
        .buyer
        .call(f.usdc.id(), "ft_transfer_call")
        .args_json(
            json!({"receiver_id":exchange.id(),"amount":"1000000","msg":swap_message.to_string()}),
        )
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?
        .json()?;
    assert_eq!(used, "1000000");
    let after: String = f
        .worker
        .view(&f.token_id, "ft_balance_of")
        .args_json(balance(f.buyer.id()))
        .await?
        .json()?;
    assert_eq!(
        after.parse::<u128>()? - before.parse::<u128>()?,
        quoted.parse::<u128>()?
    );
    Ok(())
}
