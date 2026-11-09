mod dex;
mod math;

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, env,
    ext_contract, near,
};
use std::collections::BTreeMap;

const TOTAL: u128 = math::TOTAL_SUPPLY;
const RESERVED: u128 = math::RESERVED_SUPPLY;

fn dex_allocation_key(token_id: &AccountId) -> Vec<u8> {
    [b"dex-allocation:".as_slice(), token_id.as_bytes()].concat()
}

fn curve_supply(token_id: &AccountId) -> u128 {
    if env::storage_has_key(&dex_allocation_key(token_id)) {
        math::NEW_CURVE_SUPPLY
    } else {
        math::CURVE_SUPPLY
    }
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Preset {
    pub thresholds: Vec<U128>,
    pub burn_bps: Vec<u16>,
    pub treasury_unlock_bps: Vec<u16>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct TokenState {
    pub token_id: AccountId,
    pub creator: AccountId,
    pub treasury_recipient: AccountId,
    pub name: String,
    pub symbol: String,
    pub real_usdc: u128,
    pub cumulative_volume_usdc: u128,
    pub tokens_sold: u128,
    pub creator_fees: u128,
    pub protocol_fees: u128,
    pub treasury_pool: u128,
    pub treasury_unlocked: u128,
    pub treasury_claimed: u128,
    pub reserved_remaining: u128,
    pub milestones_completed: u8,
    pub graduated: bool,
    pub pending: bool,
    pub preset: Preset,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", tag = "action", rename_all = "snake_case")]
pub enum TransferMessage {
    Buy {
        token_id: AccountId,
        min_tokens_out: U128,
    },
    Sell {
        token_id: AccountId,
        min_usdc_out: U128,
    },
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct PendingClaim {
    recipient: AccountId,
    amount: u128,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct PendingBurn {
    amount: u128,
    unlock: u128,
    milestone: u8,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct PendingBuy {
    previous_real_usdc: u128,
    previous_tokens_sold: u128,
    previous_creator_fees: u128,
    previous_treasury_pool: u128,
    previous_protocol_fees: u128,
    previous_milestones: u8,
    previous_reserved: u128,
    previous_unlocked: u128,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct LaunchDeposit {
    attached: u128,
    refund: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Launchpad {
    owner: AccountId,
    usdc_id: AccountId,
    token_wasm: Vec<u8>,
    next_token: u64,
    tokens: UnorderedMap<AccountId, TokenState>,
    token_ids: UnorderedSet<AccountId>,
    creator_token: LookupMap<AccountId, Vec<AccountId>>,
    pending_claims: LookupMap<u64, PendingClaim>,
    pending_burns: LookupMap<AccountId, PendingBurn>,
    seller_claimable: LookupMap<AccountId, u128>,
    pending_buy: LookupMap<AccountId, PendingBuy>,
    launch_deposits: LookupMap<AccountId, LaunchDeposit>,
    next_claim: u64,
}

#[ext_contract(ext_ft)]
trait ExternalFt {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
}
#[ext_contract(ext_token)]
trait ExternalToken {
    fn new(name: String, symbol: String, total_supply: U128);
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn burn_from_launchpad(&mut self, amount: U128);
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
}
#[ext_contract(ext_self)]
trait Callbacks {
    fn on_token_created(&mut self, token_id: AccountId, creator: AccountId) -> bool;
    fn on_sell_claim(&mut self, seller: AccountId, amount: U128, claim_id: u64) -> bool;
    fn on_treasury_claim(&mut self, token_id: AccountId, claim_id: u64, amount: U128) -> bool;
    fn on_fee_claim(
        &mut self,
        token_id: AccountId,
        amount: U128,
        creator_fee: bool,
        claim_id: u64,
    ) -> bool;
    fn on_buy_delivery(
        &mut self,
        token_id: AccountId,
        buyer: AccountId,
        usdc_amount: U128,
        tokens_out: U128,
    ) -> bool;
    fn on_milestone_burn(&mut self, token_id: AccountId, amount: U128) -> bool;
}

#[near]
impl Launchpad {
    #[init]
    pub fn new(owner: AccountId, usdc_id: AccountId, token_wasm: Vec<u8>) -> Self {
        assert!(!token_wasm.is_empty(), "token WASM required");
        Self {
            owner,
            usdc_id,
            token_wasm,
            next_token: 0,
            tokens: UnorderedMap::new(b"t"),
            token_ids: UnorderedSet::new(b"i"),
            creator_token: LookupMap::new(b"c"),
            pending_claims: LookupMap::new(b"p"),
            pending_burns: LookupMap::new(b"b"),
            seller_claimable: LookupMap::new(b"s"),
            pending_buy: LookupMap::new(b"u"),
            launch_deposits: LookupMap::new(b"d"),
            next_claim: 0,
        }
    }

    /// No USDC launch fee. Caller funds the NEAR storage and subaccount creation deposit.
    #[payable]
    pub fn create_token(
        &mut self,
        name: String,
        symbol: String,
        treasury_recipient: AccountId,
        preset_name: String,
    ) -> Promise {
        assert!(name.len() <= 64 && !name.is_empty(), "invalid name");
        assert!(symbol.len() <= 16 && !symbol.is_empty(), "invalid symbol");
        let preset = Self::preset(&preset_name);
        let creator = env::predecessor_account_id();
        let id_num = self.next_token;
        self.next_token += 1;
        let token_id: AccountId = format!("token-{id_num}.{}", env::current_account_id())
            .parse()
            .expect("valid token account");
        let storage_before = env::storage_usage();
        env::storage_write(&dex_allocation_key(&token_id), b"");
        self.token_ids.insert(&token_id);
        let mut created = self.creator_token.get(&creator).unwrap_or_default();
        created.push(token_id.clone());
        self.creator_token.insert(&creator, &created);
        let state = TokenState {
            token_id: token_id.clone(),
            creator: creator.clone(),
            treasury_recipient,
            name: name.clone(),
            symbol: symbol.clone(),
            real_usdc: 0,
            cumulative_volume_usdc: 0,
            tokens_sold: 0,
            creator_fees: 0,
            protocol_fees: 0,
            treasury_pool: 0,
            treasury_unlocked: 0,
            treasury_claimed: 0,
            reserved_remaining: RESERVED,
            milestones_completed: 0,
            graduated: false,
            pending: false,
            preset,
        };
        self.tokens.insert(&token_id, &state);
        let deposit = env::attached_deposit();
        self.launch_deposits.insert(
            &token_id,
            &LaunchDeposit {
                attached: deposit.as_yoctonear(),
                refund: 0,
            },
        );
        let state_cost = env::storage_byte_cost()
            .saturating_mul(env::storage_usage().saturating_sub(storage_before) as u128);
        let code_cost = env::storage_byte_cost().saturating_mul(self.token_wasm.len() as u128);
        let account_reserve = NearToken::from_millinear(500);
        let storage_cost = code_cost.saturating_add(state_cost);
        assert!(
            deposit >= storage_cost.saturating_add(account_reserve),
            "attach enough NEAR for token account, code and state storage"
        );
        self.launch_deposits.insert(
            &token_id,
            &LaunchDeposit {
                attached: deposit.as_yoctonear(),
                refund: deposit.as_yoctonear().saturating_sub(
                    storage_cost
                        .as_yoctonear()
                        .saturating_add(account_reserve.as_yoctonear()),
                ),
            },
        );
        Promise::new(token_id.clone())
            .create_account()
            .transfer(code_cost.saturating_add(account_reserve))
            .deploy_contract(self.token_wasm.clone())
            .function_call(
                "new".to_string(),
                near_sdk::serde_json::to_vec(&(name, symbol, U128(TOTAL))).unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(30),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_token_created(token_id.clone(), env::predecessor_account_id()),
            )
    }

    #[private]
    pub fn on_token_created(
        &mut self,
        token_id: AccountId,
        creator: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_err() {
            self.tokens.remove(&token_id);
            env::storage_remove(&dex_allocation_key(&token_id));
            self.token_ids.remove(&token_id);
            let mut created = self.creator_token.get(&creator).unwrap_or_default();
            created.retain(|id| id != &token_id);
            self.creator_token.insert(&creator, &created);
            let deposit = self
                .launch_deposits
                .remove(&token_id)
                .expect("launch deposit");
            if deposit.attached > 0 {
                let _promise =
                    Promise::new(creator).transfer(NearToken::from_yoctonear(deposit.attached));
            }
            return false;
        }
        let deposit = self
            .launch_deposits
            .remove(&token_id)
            .expect("launch deposit");
        if deposit.refund > 0 {
            let _promise =
                Promise::new(creator.clone()).transfer(NearToken::from_yoctonear(deposit.refund));
        }
        let state = self.tokens.get(&token_id).expect("token state exists");
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"orba","version":"1.0.0","event":"token_created","data":[{"token_id":token_id,"creator":creator,"treasury_recipient":state.treasury_recipient,"name":state.name,"symbol":state.symbol,"preset":state.preset}]})
        ));
        true
    }

    /// Called through USDC ft_transfer_call. Amount is total input including fee.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let predecessor = env::predecessor_account_id();
        let message: TransferMessage =
            near_sdk::serde_json::from_str(&msg).expect("invalid message");
        match message {
            TransferMessage::Buy {
                token_id,
                min_tokens_out,
            } => {
                assert_eq!(predecessor, self.usdc_id, "USDC only supports buy");
                let mut state = self.tokens.get(&token_id).expect("unknown token").clone();
                assert!(!state.pending && !state.graduated, "trading locked");
                let quote = math::quote_buy_with_cap(
                    state.real_usdc,
                    state.tokens_sold,
                    amount.0,
                    curve_supply(&token_id),
                );
                assert!(
                    quote.tokens_out >= min_tokens_out.0 && quote.tokens_out > 0,
                    "slippage"
                );
                state.real_usdc += quote.usdc_to_curve;
                state.cumulative_volume_usdc += quote.usdc_to_curve;
                state.tokens_sold += quote.tokens_out;
                state.creator_fees += quote.creator_fee;
                // One quarter of trade fee funds the rule-based treasury pool.
                state.treasury_pool += quote.protocol_fee / 2;
                state.protocol_fees += quote.protocol_fee - quote.protocol_fee / 2;
                state.pending = true;
                self.pending_buy.insert(
                    &token_id,
                    &PendingBuy {
                        previous_real_usdc: state.real_usdc - quote.usdc_to_curve,
                        previous_tokens_sold: state.tokens_sold - quote.tokens_out,
                        previous_creator_fees: state.creator_fees - quote.creator_fee,
                        previous_treasury_pool: state.treasury_pool - quote.protocol_fee / 2,
                        previous_protocol_fees: state.protocol_fees
                            - (quote.protocol_fee - quote.protocol_fee / 2),
                        previous_milestones: state.milestones_completed,
                        previous_reserved: state.reserved_remaining,
                        previous_unlocked: state.treasury_unlocked,
                    },
                );
                self.tokens.insert(&token_id, &state);
                let _promise = ext_token::ext(token_id.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(Gas::from_tgas(12))
                    .ft_transfer(
                        sender_id.clone(),
                        U128(quote.tokens_out),
                        Some("Orba curve buy".into()),
                    )
                    .then(
                        ext_self::ext(env::current_account_id())
                            .with_static_gas(Gas::from_tgas(90))
                            .on_buy_delivery(
                                token_id,
                                sender_id,
                                U128(quote.accepted_amount),
                                U128(quote.tokens_out),
                            ),
                    );
                PromiseOrValue::Value(U128(amount.0 - quote.accepted_amount))
            }
            TransferMessage::Sell {
                token_id,
                min_usdc_out,
            } => {
                assert_eq!(predecessor, token_id, "wrong token contract");
                self.process_sell(sender_id, amount, token_id, min_usdc_out);
                PromiseOrValue::Value(U128(0))
            }
        }
    }

    #[private]
    pub fn on_buy_delivery(
        &mut self,
        token_id: AccountId,
        buyer: AccountId,
        usdc_amount: U128,
        tokens_out: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let mut state = self.tokens.get(&token_id).expect("token exists").clone();
        state.pending = false;
        let snapshot = self
            .pending_buy
            .remove(&token_id)
            .expect("pending buy snapshot");
        if result.is_err() {
            state.real_usdc = snapshot.previous_real_usdc;
            state.cumulative_volume_usdc = state
                .cumulative_volume_usdc
                .saturating_sub(usdc_amount.0 - usdc_amount.0 * math::FEE_BPS / math::BPS);
            state.tokens_sold = snapshot.previous_tokens_sold;
            state.creator_fees = snapshot.previous_creator_fees;
            state.treasury_pool = snapshot.previous_treasury_pool;
            state.protocol_fees = snapshot.previous_protocol_fees;
            state.milestones_completed = snapshot.previous_milestones;
            state.reserved_remaining = snapshot.previous_reserved;
            state.treasury_unlocked = snapshot.previous_unlocked;
            let refund = self.seller_claimable.get(&buyer).unwrap_or(0) + usdc_amount.0;
            self.seller_claimable.insert(&buyer, &refund);
            self.tokens.insert(&token_id, &state);
            return false;
        }
        self.finish_delivered_buy(state, buyer, usdc_amount, tokens_out);
        true
    }

    /// The owner must verify finalized delivery before recovering a failed callback.
    pub fn recover_delivered_buy(
        &mut self,
        token_id: AccountId,
        buyer: AccountId,
        usdc_amount: U128,
        tokens_out: U128,
    ) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
        let mut state = self.tokens.get(&token_id).expect("unknown token").clone();
        assert!(
            state.pending && self.pending_burns.get(&token_id).is_none(),
            "no pending buy"
        );
        let snapshot = self.pending_buy.get(&token_id).expect("no pending buy");
        let quote = math::quote_buy_with_cap(
            snapshot.previous_real_usdc,
            snapshot.previous_tokens_sold,
            usdc_amount.0,
            curve_supply(&token_id),
        );
        assert_eq!(quote.accepted_amount, usdc_amount.0, "unexpected payment");
        assert_eq!(quote.tokens_out, tokens_out.0, "unexpected delivery");
        assert_eq!(
            state.tokens_sold - snapshot.previous_tokens_sold,
            tokens_out.0,
            "unexpected token delta"
        );
        assert_eq!(
            state.real_usdc - snapshot.previous_real_usdc,
            quote.usdc_to_curve,
            "unexpected reserve delta"
        );
        self.pending_buy.remove(&token_id);
        state.pending = false;
        self.finish_delivered_buy(state, buyer, usdc_amount, tokens_out);
    }

    fn finish_delivered_buy(
        &mut self,
        mut state: TokenState,
        buyer: AccountId,
        usdc_amount: U128,
        tokens_out: U128,
    ) {
        let token_id = state.token_id.clone();
        Self::unlock_post_milestone_fees(&mut state);
        state.graduated = state.tokens_sold >= curve_supply(&token_id)
            || math::market_cap(state.real_usdc, state.tokens_sold) >= math::GRADUATION_MARKET_CAP;
        self.tokens.insert(&token_id, &state);
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"orba","version":"1.0.0","event":"buy","data":[{"token_id":token_id,"trader":buyer,"usdc_amount":usdc_amount,"tokens_out":tokens_out,"market_cap":U128(math::market_cap(state.real_usdc,state.tokens_sold)),"real_usdc":U128(state.real_usdc),"tokens_sold":U128(state.tokens_sold),"cumulative_volume_usdc":U128(state.cumulative_volume_usdc),"reserved_remaining":U128(state.reserved_remaining),"treasury_pool":U128(state.treasury_pool),"treasury_unlocked":U128(state.treasury_unlocked),"treasury_claimed":U128(state.treasury_claimed),"milestones_completed":state.milestones_completed,"graduated":state.graduated}]})
        ));
        self.trigger_milestones(&token_id);
    }

    fn unlock_post_milestone_fees(state: &mut TokenState) {
        if state.milestones_completed as usize == state.preset.thresholds.len() {
            state.treasury_unlocked = state.treasury_pool;
        }
    }

    /// Token transfer_call proceeds are credited for a separate, recoverable claim.
    fn process_sell(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        token_id: AccountId,
        min_usdc_out: U128,
    ) {
        let mut state = self.tokens.get(&token_id).expect("unknown token").clone();
        assert!(!state.pending && !state.graduated, "trading locked");
        assert!(amount.0 <= state.tokens_sold, "amount exceeds sold tokens");
        let quote = math::quote_sell(state.real_usdc, state.tokens_sold, amount.0);
        assert!(quote.usdc_out >= min_usdc_out.0, "slippage");
        state.real_usdc -= quote.usdc_out + quote.fee;
        state.tokens_sold -= amount.0;
        state.creator_fees += quote.creator_fee;
        state.treasury_pool += quote.protocol_fee / 2;
        state.protocol_fees += quote.protocol_fee - quote.protocol_fee / 2;
        Self::unlock_post_milestone_fees(&mut state);
        self.tokens.insert(&token_id, &state);
        let owed = self.seller_claimable.get(&sender_id).unwrap_or(0) + quote.usdc_out;
        self.seller_claimable.insert(&sender_id, &owed);
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"orba","version":"1.0.0","event":"sell","data":[{"token_id":token_id,"trader":sender_id,"usdc_amount":U128(quote.usdc_out),"tokens_out":amount,"real_usdc":U128(state.real_usdc),"tokens_sold":U128(state.tokens_sold),"cumulative_volume_usdc":U128(state.cumulative_volume_usdc),"reserved_remaining":U128(state.reserved_remaining),"treasury_pool":U128(state.treasury_pool),"treasury_unlocked":U128(state.treasury_unlocked),"treasury_claimed":U128(state.treasury_claimed),"milestones_completed":state.milestones_completed,"graduated":state.graduated}]})
        ));
    }

    pub fn claim_sell_proceeds(&mut self) -> Promise {
        let seller = env::predecessor_account_id();
        let amount = self.seller_claimable.get(&seller).unwrap_or(0);
        assert!(amount > 0, "no sale proceeds");
        self.seller_claimable.remove(&seller);
        let claim_id = self.next_claim;
        self.next_claim += 1;
        self.pending_claims.insert(
            &claim_id,
            &PendingClaim {
                recipient: seller.clone(),
                amount,
            },
        );
        ext_ft::ext(self.usdc_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(10))
            .ft_transfer(
                seller.clone(),
                U128(amount),
                Some("Orba sell proceeds".into()),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_sell_claim(seller, U128(amount), claim_id),
            )
    }

    #[private]
    pub fn on_sell_claim(
        &mut self,
        seller: AccountId,
        amount: U128,
        claim_id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        self.pending_claims.remove(&claim_id);
        if result.is_err() {
            let prior = self.seller_claimable.get(&seller).unwrap_or(0);
            self.seller_claimable.insert(&seller, &(prior + amount.0));
            return false;
        }
        true
    }

    pub fn claim_treasury(&mut self, token_id: AccountId) -> Promise {
        let mut state = self.tokens.get(&token_id).expect("unknown token").clone();
        assert_eq!(
            env::predecessor_account_id(),
            state.treasury_recipient,
            "fixed treasury recipient only"
        );
        assert!(!state.pending, "mechanic transition pending");
        let amount = state
            .treasury_unlocked
            .saturating_sub(state.treasury_claimed);
        assert!(amount > 0, "nothing claimable");
        state.treasury_claimed += amount;
        self.tokens.insert(&token_id, &state);
        let claim_id = self.next_claim;
        self.next_claim += 1;
        self.pending_claims.insert(
            &claim_id,
            &PendingClaim {
                recipient: state.treasury_recipient.clone(),
                amount,
            },
        );
        ext_ft::ext(self.usdc_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(10))
            .ft_transfer(
                state.treasury_recipient,
                U128(amount),
                Some("Orba treasury tranche".into()),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_treasury_claim(token_id, claim_id, U128(amount)),
            )
    }

    #[private]
    pub fn on_treasury_claim(
        &mut self,
        token_id: AccountId,
        claim_id: u64,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        self.pending_claims.remove(&claim_id);
        if result.is_err() {
            if let Some(mut state) = self.tokens.get(&token_id) {
                state.treasury_claimed = state.treasury_claimed.saturating_sub(amount.0);
                self.tokens.insert(&token_id, &state);
            }
            return false;
        }
        if let Some(state) = self.tokens.get(&token_id) {
            env::log_str(&format!(
                "EVENT_JSON:{}",
                near_sdk::serde_json::json!({"standard":"orba","version":"1.0.0","event":"treasury_claim","data":[{"token_id":token_id,"recipient":state.treasury_recipient,"amount":amount,"treasury_claimed":U128(state.treasury_claimed)}]})
            ));
        }
        true
    }

    pub fn claim_creator_fees(&mut self, token_id: AccountId) -> Promise {
        let mut state = self.tokens.get(&token_id).expect("unknown token");
        let caller = env::predecessor_account_id();
        assert_eq!(caller, state.creator, "token creator only");
        let amount = state.creator_fees;
        assert!(amount > 0, "no creator fees");
        state.creator_fees = 0;
        let recipient = state.creator.clone();
        self.tokens.insert(&token_id, &state);
        self.begin_fee_claim(token_id, recipient, amount, true)
    }

    pub fn claim_protocol_fees(&mut self, token_id: AccountId) -> Promise {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
        let mut state = self.tokens.get(&token_id).expect("unknown token");
        let amount = state.protocol_fees;
        assert!(amount > 0, "no protocol fees");
        state.protocol_fees = 0;
        self.tokens.insert(&token_id, &state);
        self.begin_fee_claim(token_id, self.owner.clone(), amount, false)
    }

    fn begin_fee_claim(
        &mut self,
        token_id: AccountId,
        recipient: AccountId,
        amount: u128,
        creator_fee: bool,
    ) -> Promise {
        let claim_id = self.next_claim;
        self.next_claim += 1;
        self.pending_claims.insert(
            &claim_id,
            &PendingClaim {
                recipient: recipient.clone(),
                amount,
            },
        );
        ext_ft::ext(self.usdc_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(10))
            .ft_transfer(recipient, U128(amount), Some("Orba accrued fees".into()))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_fee_claim(token_id, U128(amount), creator_fee, claim_id),
            )
    }

    #[private]
    pub fn on_fee_claim(
        &mut self,
        token_id: AccountId,
        amount: U128,
        creator_fee: bool,
        claim_id: u64,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let claim = self
            .pending_claims
            .remove(&claim_id)
            .expect("pending fee claim");
        if result.is_err() {
            if let Some(mut state) = self.tokens.get(&token_id) {
                if creator_fee {
                    state.creator_fees += amount.0;
                } else {
                    state.protocol_fees += amount.0;
                }
                self.tokens.insert(&token_id, &state);
            }
            return false;
        }
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"orba","version":"1.0.0","event":"fee_claim","data":[{"token_id":token_id,"recipient":claim.recipient,"amount":amount,"creator_fee":creator_fee}]})
        ));
        true
    }

    fn trigger_milestones(&mut self, token_id: &AccountId) {
        let mut state = self.tokens.get(token_id).expect("token exists").clone();
        let volume = state.cumulative_volume_usdc;
        let i = state.milestones_completed as usize;
        if math::next_milestone(
            volume,
            i,
            &state
                .preset
                .thresholds
                .iter()
                .map(|v| v.0)
                .collect::<Vec<_>>(),
        )
        .is_none()
        {
            return;
        }
        let final_milestone = i + 1 == state.preset.thresholds.len();
        let burn = math::release_amount(
            state.reserved_remaining,
            state.preset.burn_bps[i],
            final_milestone,
        );
        let unlockable_pool = state.treasury_pool.saturating_sub(state.treasury_unlocked);
        let unlock = math::release_amount(
            unlockable_pool,
            state.preset.treasury_unlock_bps[i],
            final_milestone,
        );
        state.reserved_remaining -= burn;
        state.treasury_unlocked += unlock;
        state.milestones_completed += 1;
        state.pending = true;
        state.graduated = state.tokens_sold >= curve_supply(&token_id)
            || math::market_cap(state.real_usdc, state.tokens_sold) >= math::GRADUATION_MARKET_CAP;
        self.tokens.insert(token_id, &state);
        self.pending_burns.insert(
            token_id,
            &PendingBurn {
                amount: burn,
                unlock,
                milestone: i as u8,
            },
        );
        // Each callback must have enough prepaid gas for its own state update
        // plus the next burn and callback. Decrease the callback budget as the
        // finite three-step milestone sequence advances.
        let callback_gas = match i {
            0 => 55,
            1 => 35,
            _ => 15,
        };
        let _promise = ext_token::ext(token_id.clone())
            .with_static_gas(Gas::from_tgas(10))
            .burn_from_launchpad(U128(burn))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(callback_gas))
                    .on_milestone_burn(token_id.clone(), U128(burn)),
            );
    }

    #[private]
    pub fn on_milestone_burn(
        &mut self,
        token_id: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if let Some(mut state) = self.tokens.get(&token_id) {
            state.pending = false;
            let pending = self
                .pending_burns
                .remove(&token_id)
                .expect("pending burn exists");
            if result.is_err() {
                state.reserved_remaining += pending.amount;
                state.treasury_unlocked = state.treasury_unlocked.saturating_sub(pending.unlock);
                state.milestones_completed = state.milestones_completed.saturating_sub(1);
            }
            self.tokens.insert(&token_id, &state);
            if result.is_ok() {
                env::log_str(&format!(
                    "EVENT_JSON:{}",
                    near_sdk::serde_json::json!({"standard":"orba","version":"1.0.0","event":"milestone","data":[{"token_id":token_id,"index":pending.milestone,"volume":U128(state.cumulative_volume_usdc),"burn":U128(pending.amount),"treasury_unlocked":U128(pending.unlock),"real_usdc":U128(state.real_usdc),"tokens_sold":U128(state.tokens_sold),"cumulative_volume_usdc":U128(state.cumulative_volume_usdc),"reserved_remaining":U128(state.reserved_remaining),"treasury_pool":U128(state.treasury_pool),"treasury_claimed":U128(state.treasury_claimed),"milestones_completed":state.milestones_completed,"graduated":state.graduated}]})
                ));
            }
        }
        if result.is_ok() {
            self.trigger_milestones(&token_id);
        }
        let _ = amount;
        result.is_ok()
    }

    pub fn get_token(&self, token_id: AccountId) -> Option<TokenState> {
        self.tokens.get(&token_id)
    }
    pub fn get_seller_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.seller_claimable.get(&account_id).unwrap_or(0))
    }
    pub fn get_claimable_usdc(&self, account_id: AccountId) -> U128 {
        U128(self.seller_claimable.get(&account_id).unwrap_or(0))
    }
    pub fn quote_buy(&self, token_id: AccountId, usdc_amount: U128) -> U128 {
        let state = self.tokens.get(&token_id).expect("unknown token");
        U128(
            math::quote_buy_with_cap(
                state.real_usdc,
                state.tokens_sold,
                usdc_amount.0,
                curve_supply(&token_id),
            )
            .tokens_out,
        )
    }

    pub fn get_supply_allocations(&self, token_id: AccountId) -> (U128, U128, U128) {
        assert!(self.tokens.get(&token_id).is_some(), "unknown token");
        let curve = curve_supply(&token_id);
        (
            U128(curve),
            U128(RESERVED),
            U128(math::CURVE_SUPPLY - curve),
        )
    }
    pub fn quote_sell(&self, token_id: AccountId, token_amount: U128) -> U128 {
        let state = self.tokens.get(&token_id).expect("unknown token");
        U128(math::quote_sell(state.real_usdc, state.tokens_sold, token_amount.0).usdc_out)
    }
    pub fn get_tokens(&self, from_index: u64, limit: u64) -> Vec<TokenState> {
        self.token_ids
            .iter()
            .skip(from_index as usize)
            .take(limit.min(100) as usize)
            .filter_map(|id| self.tokens.get(&id))
            .collect()
    }
    pub fn get_balance(&self, token_id: AccountId, account_id: AccountId) -> Promise {
        ext_token::ext(token_id)
            .with_static_gas(Gas::from_tgas(5))
            .ft_balance_of(account_id)
    }
    pub fn presets(&self) -> BTreeMap<String, Preset> {
        ["spark", "momentum", "marathon"]
            .into_iter()
            .map(|n| (n.to_string(), Self::preset(n)))
            .collect()
    }

    fn preset(name: &str) -> Preset {
        let (thresholds, burns, unlocks) = match name {
            "spark" => (
                vec![10, 50, 150],
                vec![1000, 2500, 10000],
                vec![2000, 3000, 10000],
            ),
            "momentum" => (
                vec![25, 100, 500],
                vec![1000, 2500, 10000],
                vec![2000, 3000, 10000],
            ),
            "marathon" => (
                vec![100, 500, 2500],
                vec![1000, 2500, 10000],
                vec![2000, 3000, 10000],
            ),
            _ => env::panic_str("unknown preset"),
        };
        Preset {
            thresholds: thresholds
                .into_iter()
                .map(|v| U128(v * 1_000_000))
                .collect(),
            burn_bps: burns,
            treasury_unlock_bps: unlocks,
        }
    }
}
