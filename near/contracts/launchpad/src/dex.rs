use super::{Launchpad, LaunchpadExt, curve_supply, math};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::serde_json::{self, json};
use near_sdk::{AccountId, Gas, NearToken, Promise, PromiseError, env, near};

const EXCHANGE: &str = "ref-finance-101.testnet";

#[derive(BorshDeserialize, BorshSerialize, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde", rename_all = "snake_case")]
enum Step {
    ExchangeStorage,
    TokenStorage,
    UsdcStorage,
    RegisterTokens,
    CreatePool,
    DepositToken,
    DepositUsdc,
    AddLiquidity,
    VerifyShares,
    Complete,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct DexMigration {
    step: Step,
    pending: bool,
    pool_id: Option<u64>,
    token_deposited: U128,
    usdc_deposited: U128,
    seed_usdc: U128,
    retained_usdc: U128,
    shares: U128,
}

impl DexMigration {
    fn key(token: &AccountId) -> Vec<u8> {
        [b"dex-migration:".as_slice(), token.as_bytes()].concat()
    }

    fn load(token: &AccountId) -> Option<Self> {
        env::storage_read(&Self::key(token))
            .map(|bytes| near_sdk::borsh::from_slice(&bytes).expect("invalid migration state"))
    }

    fn save(&self, token: &AccountId) {
        env::storage_write(
            &Self::key(token),
            &near_sdk::borsh::to_vec(self).expect("serialize migration state"),
        );
    }
}

#[near]
impl Launchpad {
    pub fn get_dex_migration(&self, token_id: AccountId) -> Option<DexMigration> {
        DexMigration::load(&token_id)
    }

    /// Advance one receipt at a time. The caller funds the external storage deposits.
    #[payable]
    pub fn advance_dex_migration(&mut self, token_id: AccountId) -> Promise {
        let token = self.tokens.get(&token_id).expect("unknown token");
        assert!(
            token.graduated && !token.pending,
            "graduation has not settled"
        );
        assert_eq!(
            curve_supply(&token_id),
            math::NEW_CURVE_SUPPLY,
            "no DEX allocation"
        );
        let mut migration = DexMigration::load(&token_id).unwrap_or_else(|| {
            let seed = (math::VIRTUAL_USDC + token.real_usdc) * math::DEX_SUPPLY
                / (math::VIRTUAL_TOKENS - token.tokens_sold);
            assert!(seed > 0 && seed <= token.real_usdc, "invalid seed reserves");
            DexMigration {
                step: Step::ExchangeStorage,
                pending: false,
                pool_id: None,
                token_deposited: U128(0),
                usdc_deposited: U128(0),
                seed_usdc: U128(seed),
                retained_usdc: U128(token.real_usdc - seed),
                shares: U128(0),
            }
        });
        assert!(!migration.pending, "migration receipt pending");
        let exchange: AccountId = EXCHANGE.parse().expect("exchange account");
        let account = env::current_account_id();
        let one = NearToken::from_yoctonear(1);
        let zero = NearToken::from_yoctonear(0);
        let (receiver, method, args, deposit, gas) = match migration.step {
            Step::ExchangeStorage => (
                exchange,
                "storage_deposit",
                json!({"account_id":account,"registration_only":false}),
                NearToken::from_millinear(20),
                35,
            ),
            Step::TokenStorage | Step::UsdcStorage => (
                if migration.step == Step::TokenStorage {
                    token_id.clone()
                } else {
                    self.usdc_id.clone()
                },
                "storage_deposit",
                json!({"account_id":exchange,"registration_only":true}),
                NearToken::from_yoctonear(1_250_000_000_000_000_000_000),
                35,
            ),
            Step::RegisterTokens => (
                exchange,
                "register_tokens",
                json!({"token_ids":[token_id,self.usdc_id]}),
                one,
                35,
            ),
            Step::CreatePool => (
                exchange,
                "add_simple_pool",
                json!({"tokens":[token_id,self.usdc_id],"fee":30}),
                NearToken::from_millinear(100),
                50,
            ),
            Step::DepositToken | Step::DepositUsdc => {
                let (asset, remaining) = if migration.step == Step::DepositToken {
                    (
                        token_id.clone(),
                        math::DEX_SUPPLY - migration.token_deposited.0,
                    )
                } else {
                    (
                        self.usdc_id.clone(),
                        migration.seed_usdc.0 - migration.usdc_deposited.0,
                    )
                };
                (
                    asset,
                    "ft_transfer_call",
                    json!({"receiver_id":exchange,"amount":U128(remaining),"memo":null,"msg":""}),
                    one,
                    100,
                )
            }
            Step::AddLiquidity => {
                let amounts = [U128(math::DEX_SUPPLY), migration.seed_usdc];
                (
                    exchange,
                    "add_liquidity",
                    json!({"pool_id":migration.pool_id.expect("pool ID"),"amounts":amounts,"min_amounts":amounts}),
                    NearToken::from_millinear(10),
                    65,
                )
            }
            Step::VerifyShares => (
                exchange,
                "get_pool_shares",
                json!({"pool_id":migration.pool_id.expect("pool ID"),"account_id":account}),
                zero,
                25,
            ),
            Step::Complete => env::panic_str("migration complete"),
        };
        assert_eq!(
            env::attached_deposit(),
            deposit,
            "attach the exact step deposit"
        );
        migration.pending = true;
        migration.save(&token_id);
        Promise::new(receiver)
            .function_call(
                method,
                serde_json::to_vec(&args).expect("serialize arguments"),
                deposit,
                Gas::from_tgas(gas),
            )
            .then(
                Self::ext(account)
                    .with_static_gas(Gas::from_tgas(25))
                    .on_dex_step(
                        token_id,
                        env::predecessor_account_id(),
                        U128(deposit.as_yoctonear()),
                    ),
            )
    }

    #[private]
    pub fn on_dex_step(&mut self, token_id: AccountId, payer: AccountId, deposit: U128) -> bool {
        let mut migration = DexMigration::load(&token_id).expect("unknown migration");
        assert!(migration.pending, "no pending migration step");
        let result = env::promise_result_checked(0, 1024);
        if matches!(result, Err(PromiseError::TooLong(_))) {
            return false;
        }
        let Ok(result) = result else {
            // A failed token resolver can leave the receiver credited. Keep the
            // receipt locked until reconciled so a retry cannot transfer twice.
            if matches!(migration.step, Step::DepositToken | Step::DepositUsdc) {
                return false;
            }
            migration.pending = false;
            migration.save(&token_id);
            if deposit.0 > 0 {
                let _refund = Promise::new(payer).transfer(NearToken::from_yoctonear(deposit.0));
            }
            return false;
        };
        migration.step = match migration.step {
            Step::ExchangeStorage => Step::TokenStorage,
            Step::TokenStorage => Step::UsdcStorage,
            Step::UsdcStorage => Step::RegisterTokens,
            Step::RegisterTokens => Step::CreatePool,
            Step::CreatePool => {
                migration.pool_id = Some(serde_json::from_slice(&result).expect("invalid pool ID"));
                Step::DepositToken
            }
            Step::DepositToken | Step::DepositUsdc => {
                let used: U128 = serde_json::from_slice(&result).expect("invalid transfer result");
                let (credited, target, next) = if migration.step == Step::DepositToken {
                    (
                        &mut migration.token_deposited,
                        math::DEX_SUPPLY,
                        Step::DepositUsdc,
                    )
                } else {
                    (
                        &mut migration.usdc_deposited,
                        migration.seed_usdc.0,
                        Step::AddLiquidity,
                    )
                };
                assert!(used.0 <= target - credited.0, "unexpected deposit amount");
                credited.0 += used.0;
                if credited.0 == target {
                    next
                } else {
                    migration.step
                }
            }
            Step::AddLiquidity => Step::VerifyShares,
            Step::VerifyShares => {
                let shares: U128 = serde_json::from_slice(&result).expect("invalid share balance");
                assert!(shares.0 > 0, "liquidity shares missing");
                migration.shares = shares;
                let mut token = self.tokens.get(&token_id).expect("unknown token");
                token.real_usdc = migration.retained_usdc.0;
                self.tokens.insert(&token_id, &token);
                env::log_str(&format!(
                    "EVENT_JSON:{}",
                    json!({
                        "standard":"orba","version":"1.0.0","event":"dex_graduated","data":[{
                            "token_id":token_id,"exchange_id":EXCHANGE,"pool_id":migration.pool_id,
                            "token_liquidity":U128(math::DEX_SUPPLY),"usdc_liquidity":migration.seed_usdc,
                            "retained_usdc":migration.retained_usdc,"shares":shares
                        }]
                    })
                ));
                Step::Complete
            }
            Step::Complete => env::panic_str("migration complete"),
        };
        migration.pending = false;
        migration.save(&token_id);
        true
    }
}
