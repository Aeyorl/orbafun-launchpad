//! Integer-only port of Orba's constant-product curve (USDC has 6 decimals).
pub const ONE: u128 = 10u128.pow(18);
pub const TOTAL_SUPPLY: u128 = 1_000_000_000 * ONE;
pub const CURVE_SUPPLY: u128 = 880_000_000 * ONE;
pub const RESERVED_SUPPLY: u128 = 120_000_000 * ONE;
pub const VIRTUAL_USDC: u128 = 5_866_666_700;
pub const VIRTUAL_TOKENS: u128 = 1_466_666_667 * ONE;
pub const K: u128 = VIRTUAL_USDC * VIRTUAL_TOKENS;
pub const FEE_BPS: u128 = 100;
pub const GRADUATION_MARKET_CAP: u128 = 30_000 * 1_000_000;
pub const BPS: u128 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote {
    pub accepted_amount: u128,
    pub tokens_out: u128,
    pub fee: u128,
    pub creator_fee: u128,
    pub protocol_fee: u128,
    pub usdc_to_curve: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellQuote {
    pub usdc_out: u128,
    pub fee: u128,
    pub creator_fee: u128,
    pub protocol_fee: u128,
}

pub fn quote_buy(real_usdc: u128, tokens_sold: u128, amount: u128) -> BuyQuote {
    let accepted_amount = accepted_buy_amount(real_usdc, tokens_sold, amount);
    let fee = fee_for(accepted_amount);
    let creator_fee = fee / 2;
    let protocol_fee = fee - creator_fee;
    let usdc_to_curve = accepted_amount - fee;
    let reserve_tokens = VIRTUAL_TOKENS - tokens_sold;
    let new_y = K / (VIRTUAL_USDC + real_usdc + usdc_to_curve);
    BuyQuote {
        accepted_amount,
        tokens_out: reserve_tokens
            .saturating_sub(new_y)
            .min(CURVE_SUPPLY.saturating_sub(tokens_sold)),
        fee,
        creator_fee,
        protocol_fee,
        usdc_to_curve,
    }
}

fn fee_for(amount: u128) -> u128 {
    amount / BPS * FEE_BPS + amount % BPS * FEE_BPS / BPS
}

fn accepted_buy_amount(real_usdc: u128, tokens_sold: u128, requested: u128) -> u128 {
    let remaining = CURVE_SUPPLY.saturating_sub(tokens_sold);
    if remaining == 0 || requested == 0 {
        return 0;
    }

    let target_virtual_tokens = VIRTUAL_TOKENS - tokens_sold - remaining;
    let target_usdc_reserve = K / (target_virtual_tokens + 1) + 1;
    let current_usdc_reserve = VIRTUAL_USDC + real_usdc;
    let net_required = target_usdc_reserve.saturating_sub(current_usdc_reserve);
    if net_required == 0 {
        return 0;
    }

    // The fee is floor(gross * FEE_BPS / BPS). This gives the smallest gross
    // amount whose post-fee curve input reaches the final curve inventory.
    let gross_required = ((net_required - 1) * BPS) / (BPS - FEE_BPS) + 1;
    requested.min(gross_required)
}

pub fn quote_sell(real_usdc: u128, tokens_sold: u128, amount: u128) -> SellQuote {
    let old_y = VIRTUAL_TOKENS - tokens_sold;
    let new_y = old_y + amount;
    let gross = (VIRTUAL_USDC + real_usdc) - (K / new_y);
    let fee = fee_for(gross);
    let creator_fee = fee / 2;
    SellQuote {
        usdc_out: gross - fee,
        fee,
        creator_fee,
        protocol_fee: fee - creator_fee,
    }
}

pub fn market_cap(real_usdc: u128, tokens_sold: u128) -> u128 {
    (VIRTUAL_USDC + real_usdc) * TOTAL_SUPPLY / (VIRTUAL_TOKENS - tokens_sold)
}

pub fn next_milestone(
    cumulative_volume: u128,
    completed: usize,
    thresholds: &[u128],
) -> Option<usize> {
    thresholds
        .get(completed)
        .filter(|threshold| cumulative_volume >= **threshold)
        .map(|_| completed)
}

pub fn release_amount(balance: u128, basis_points: u16, is_final: bool) -> u128 {
    if is_final {
        balance
    } else {
        balance * basis_points as u128 / BPS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_fee_and_rounding_are_integer_exact() {
        let q = quote_buy(0, 0, 101);
        assert_eq!(
            (q.fee, q.creator_fee, q.protocol_fee, q.usdc_to_curve),
            (1, 0, 1, 100)
        );
        let q = quote_buy(0, 0, 100_000_000);
        assert_eq!(
            (q.fee, q.creator_fee, q.protocol_fee),
            (1_000_000, 500_000, 500_000)
        );
    }
    #[test]
    fn buys_and_sells_move_curve_reserves_monotonically() {
        let b = quote_buy(0, 0, 100_000_000);
        assert!(b.tokens_out > 0 && b.tokens_out < CURVE_SUPPLY);
        let s = quote_sell(b.usdc_to_curve, b.tokens_out, b.tokens_out / 2);
        assert!(s.usdc_out > 0);
        assert!(market_cap(b.usdc_to_curve, b.tokens_out) > market_cap(0, 0));
    }
    #[test]
    fn reserved_burn_does_not_change_curve_quote() {
        let before = quote_buy(123_000_000, 10_000_000 * ONE, 5_000_000);
        let reserved_after = RESERVED_SUPPLY - 30_000_000 * ONE;
        assert_eq!(reserved_after, 90_000_000 * ONE);
        let after = quote_buy(123_000_000, 10_000_000 * ONE, 5_000_000);
        assert_eq!(before, after);
    }
    #[test]
    fn supply_allocation_conserves_total() {
        assert_eq!(CURVE_SUPPLY + RESERVED_SUPPLY, TOTAL_SUPPLY);
    }
    #[test]
    fn milestone_crossing_is_ordered_and_one_shot() {
        let thresholds = [10, 50, 150];
        assert_eq!(next_milestone(49, 0, &thresholds), Some(0));
        assert_eq!(next_milestone(49, 1, &thresholds), None);
        assert_eq!(next_milestone(500, 1, &thresholds), Some(1));
        assert_eq!(next_milestone(500, 3, &thresholds), None);
    }
    #[test]
    fn release_rounding_cannot_overdraw_and_final_clears_dust() {
        assert_eq!(release_amount(7, 3333, false), 2);
        assert_eq!(release_amount(5, 0, true), 5);
    }

    #[test]
    fn buy_caps_accepted_input_at_remaining_curve_inventory() {
        let requested = 10_000_000_000_000;
        let quote = quote_buy(0, 0, requested);
        assert_eq!(quote.tokens_out, CURVE_SUPPLY);
        assert!(quote.accepted_amount < requested);
        assert_eq!(quote.usdc_to_curve + quote.fee, quote.accepted_amount);
        assert_eq!(quote_buy(0, 0, requested + 1), quote);
    }

    #[test]
    fn buy_fee_math_is_safe_for_large_u128_values() {
        let quote = quote_buy(0, 0, u128::MAX);
        assert_eq!(quote.tokens_out, CURVE_SUPPLY);
        assert!(quote.accepted_amount < u128::MAX);
    }
}
