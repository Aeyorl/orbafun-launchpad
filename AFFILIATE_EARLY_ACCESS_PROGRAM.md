# Orba Affiliate + Early Access Program

Status: commercial draft for founder review. This is not a binding agreement and
must not be presented as live until the partner code, payout wallet, rate, and
production tracking test have been confirmed.

Every named Orba profile receives a readable referral link at the standard rate.
The affiliate program below adds negotiated economics and early-access support;
it is not required for a normal user to own a name-based referral link.

## Partner offer

- Private early access to Orba before a broader promotion.
- A readable link such as `https://orba.fun/?ref=spyzer`.
- First-valid-wallet attribution after the referred user signs in.
- A partner dashboard showing attributed wallets, eligible trading volume, and
  accrued rewards.
- Direct access to the Orba team for product feedback and launch coordination.
- No investment, token purchase, or minimum promotion commitment.

## Economics

- Standard affiliate rate: 10 basis points (0.10%) of eligible referred trading
  volume, equal to 10% of Orba's current 1% trading fee.
- Founding partner rate: up to 20 basis points (0.20%) when approved by Orba,
  equal to 20% of the current trading fee.
- The rate is recorded when a wallet is first attributed. Later rate changes
  apply only to newly attributed wallets unless both parties agree otherwise.
- Rewards are denominated and accounted for in micro-USDC.

Example: at a 20 bps founding rate, $100,000 of eligible referred volume accrues
$200 in partner rewards.

## Attribution and eligibility

- Attribution is first-valid-wallet-wins and remains attached to that wallet.
- The visitor must arrive through the partner link and later complete Orba's
  signed wallet authentication flow on the same browser profile.
- Eligible volume includes indexed bonding-curve buys and sells made by the
  attributed wallet.
- Self-referrals, wash trading, manipulated volume, reverted transactions,
  duplicated indexer events, and activity that violates Orba's terms are not
  eligible.
- Orba may pause a code prospectively for fraud, sanctions, security, or legal
  risk. Already verified earnings remain subject to reconciliation.

## Reporting and payouts

- The product currently provides off-chain accrual accounting; it does not yet
  execute automatic USDC payouts.
- Before any partner promotion, Orba and the partner must agree in writing on
  the payout wallet, rate, reporting period, minimum payout, and payment method.
- Recommended launch policy: monthly manual USDC settlement from the approved
  treasury after indexer reconciliation, with a $50 minimum. Amounts below the
  minimum roll forward.
- Every settlement should be recorded with the covered period, amount, receiving
  wallet, and transaction hash until an automated payout ledger is shipped.

## Required launch checklist

1. Obtain the partner's payout wallet directly from the partner.
2. Agree on the exact rate and settlement terms in writing.
3. Create the partner code through the admin-authenticated API.
4. Confirm the public partner-code lookup returns the expected wallet and rate.
5. Run a production test with a fresh wallet: click, authenticate, trade a small
   amount, confirm attribution, volume, and reward accrual.
6. Give the partner their link and a plain-language disclosure they can use.

## Suggested disclosure

"I may earn a referral reward from eligible activity if you use this link. This
does not change your trading fee. Crypto and memecoins are high risk; do your own
research."
