use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::json_types::U128;
use near_sdk::store::LazyOption;
use near_sdk::{AccountId, NearToken, PanicOnDefault, PromiseOrValue, env, near};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TokenContract {
    launchpad_id: AccountId,
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
}

#[near]
impl TokenContract {
    #[init]
    pub fn new(name: String, symbol: String, total_supply: U128) -> Self {
        let launchpad_id = env::predecessor_account_id();
        let mut token = FungibleToken::new(b"t".to_vec());
        token.internal_register_account(&launchpad_id);
        token.internal_deposit(&launchpad_id, total_supply.into());
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name,
            symbol,
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 18,
        };
        metadata.assert_valid();
        Self {
            launchpad_id,
            token,
            metadata: LazyOption::new(b"m".to_vec(), Some(metadata)),
        }
    }

    /// Burn reserved tokens held by the launchpad after a configured milestone.
    pub fn burn_from_launchpad(&mut self, amount: U128) {
        assert_eq!(
            env::predecessor_account_id(),
            self.launchpad_id,
            "launchpad only"
        );
        self.token
            .internal_withdraw(&self.launchpad_id, amount.into());
    }

    pub fn launchpad_id(&self) -> AccountId {
        self.launchpad_id.clone()
    }
}

#[near]
impl FungibleTokenCore for TokenContract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for TokenContract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.token
            .ft_resolve_transfer(sender_id, receiver_id, amount)
    }
}

#[near]
impl StorageManagement for TokenContract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> near_contract_standards::storage_management::StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(
        &mut self,
        amount: Option<NearToken>,
    ) -> near_contract_standards::storage_management::StorageBalance {
        self.token.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }
    fn storage_balance_bounds(
        &self,
    ) -> near_contract_standards::storage_management::StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(
        &self,
        account_id: AccountId,
    ) -> Option<near_contract_standards::storage_management::StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for TokenContract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata
            .get()
            .as_ref()
            .expect("metadata missing")
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};

    fn context(predecessor: &str) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("token.orba.testnet".parse().unwrap())
                .predecessor_account_id(predecessor.parse().unwrap())
                .build()
        );
    }

    #[test]
    fn launchpad_holds_total_supply_and_reserved_burn_reduces_supply() {
        context("launchpad.testnet");
        let mut token = TokenContract::new("Demo".into(), "DEMO".into(), U128(1_000));
        let launchpad: AccountId = "launchpad.testnet".parse().unwrap();
        assert_eq!(token.ft_total_supply(), U128(1_000));
        assert_eq!(token.ft_balance_of(launchpad), U128(1_000));
        token.burn_from_launchpad(U128(120));
        assert_eq!(token.ft_total_supply(), U128(880));
    }

    #[test]
    #[should_panic(expected = "launchpad only")]
    fn unauthorized_account_cannot_burn() {
        context("launchpad.testnet");
        let mut token = TokenContract::new("Demo".into(), "DEMO".into(), U128(1_000));
        context("attacker.testnet");
        token.burn_from_launchpad(U128(1));
    }
}
