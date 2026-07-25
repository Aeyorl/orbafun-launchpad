# Phase 1 — Smart Contracts

**Gate to enter:** Phase 0 done, exact block time measured, USDC dual-decimal
model understood.
**Gate to exit:** full create → buy → sell → graduate flow works on testnet
(including own AMM), anti-rug mechanics verified by test, all 7 contracts
deployed and addresses logged.

---

## 0. Bonding curve economics modeling (prerequisite — do this before writing curve code)

Before implementing `BondingCurve.sol`, model the full token lifecycle in a
spreadsheet or script. The curve shape, graduation threshold, trading fee, and
LP migration amount are **mathematically coupled** — pick them in isolation and
either (a) tokens graduate too easily with thin LP and dump on graduation, or
(b) they never graduate and the platform looks dead.

Model these variables together:
- Curve formula: constant-product (`x*y=k`) is the default — `[CONFIRM]` only
  if there's a specific reason to deviate.
- Graduation threshold: doc suggests 50,000 USDC — `[CONFIRM]`.
- Trading fee: **1%, split 0.5% creator / 0.5% protocol** (resolved — see
  DECISION_LOG.md D19). Creator fees accrue during bonding curve phase only,
  claimable anytime. No creator fee in AMM post-graduation (v1).
- LP migration amount: what % of the reserve goes to the AMM pair on graduation.
- Post-graduation LP depth: is it deep enough to support trading without
  massive slippage? Too thin and the token dumps immediately on graduation.
- Time-to-graduation: at a realistic buy rate (e.g. 10-50 buys of 10-100 USDC
  each), how long does it take to cross threshold? Too fast = feels rigged;
  too slow = feels dead.

Log the model and the chosen values in the decision log before coding. This is
a product decision, not just a technical one.

---

## 1. TokenFactory.sol

```solidity
struct LaunchToken {
    address token;
    address creator;
    string name;
    string symbol;
    string image;      // IPFS URI, not raw string — decide pinning service in this phase
    uint256 createdAt;
    bool graduated;
}

function createToken(
    string calldata name,
    string calldata symbol,
    string calldata imageURI,
    string calldata description
) external returns (address tokenAddress);

function getToken(address tokenAddress) external view returns (LaunchToken memory);
function getCreatorTokens(address creator, uint256 offset, uint256 limit) external view returns (address[] memory);
function setCreationFee(uint256 newFee) external onlyOwner;
function pause() external onlyOwner;
```

Notes:
- `createToken` deploys a new `MemeToken` instance and registers it with a fresh
  `BondingCurve` instance in the same transaction — don't split this across
  multiple user-signed txs, that's where launch UX gets slow and where a
  partial-failure state (token exists but no curve) becomes possible.
- Creation fee: `[CONFIRM]` — doc suggested 5 USDC, verify this against what
  similar Arc-ecosystem launch fees look like before hardcoding.
- `getCreatorTokens` is now paginated (offset/limit) — an unbounded return
  array will gas-out for prolific creators.
- `graduated` flag lives here, set by `LiquidityMigration` on graduation.

---

## 2. MemeToken.sol

Standard ERC-20 plus:

```solidity
function burn(uint256 amount) external;
function renounceOwnership() external;   // called automatically by LiquidityMigration on graduation, not manually
```

Anti-bot cooldown:
```solidity
uint256 public constant COOLDOWN_BLOCKS = ???  // [CONFIRM] — size against Arc's ACTUAL block time (sub-second), not Ethereum's 12s. A "10 block cooldown" on a 0.5s block time chain = 5 seconds, not 120.
mapping(address => uint256) public lastTxBlock;
```

- No mint function exists anywhere in this contract, on purpose. Total supply
  is fixed at creation.
- No freeze function. Tokens are fully immutable post-launch by design — this
  is a deliberate trustlessness choice. A real security issue is handled at the
  factory level (pause new launches), not by freezing existing tokens.
- Ownership renounce is a one-way function — test that nothing in the
  graduation flow depends on ownership still existing afterward.

---

## 3. BondingCurve.sol

```solidity
uint256 public reserveUSDC;       // see USDC decimal handling below
uint256 public totalSupply;
// marketCap and volume24h are NOT stored — see notes below

// Fee accrual (resolved: 1% fee, 0.5% creator / 0.5% protocol — see DECISION_LOG D19)
address public creator;              // set at creation from TokenFactory
uint256 public creatorFeesAccrued;   // 6-dec, claimable by creator
uint256 public protocolFeesAccrued;  // 6-dec, claimable by treasury/owner

function buy(uint256 usdcAmount, uint256 minTokensOut) external;
function sell(uint256 tokenAmount, uint256 minUSDCOut) external;
function quoteBuy(uint256 usdcAmount) external view returns (uint256 tokensOut);
function quoteSell(uint256 tokenAmount) external view returns (uint256 usdcOut);
function price() external view returns (uint256);
function marketCap() external view returns (uint256);  // view, not storage — derivable from reserve + supply
function claimCreatorFees() external;   // only creator — pull-based, not auto-distribute
function claimProtocolFees() external;  // only owner/treasury
```

### USDC decimal handling (critical — read before implementing)

Arc's USDC has a dual-decimal model. Native USDC = 18 decimals (gas, `msg.value`,
`addr.balance`). ERC-20 USDC = 6 decimals (`transferFrom`, `approve`,
`balanceOf`). Both are the same asset.

Design decisions for this contract:
- **Internal accounting denomination:** 6 decimals (ERC-20 view) throughout
  the contract. This matches the `transferFrom` input and avoids all decimal
  conversions in the bonding curve logic. The only place 18-dec (native)
  appears is gas math, which doesn't affect curve accounting. (Updated from
  original 18-dec recommendation after consulting the Circle `use-arc` skill —
  see DECISION_LOG.md D2.)
- **`buy()` input method:** Use `transferFrom` (ERC-20, 6 dec) for explicit
  amount control, NOT `msg.value`. The quote→execute flow needs a known input
  amount, and `msg.value` requires the user to send exactly the right amount
  of native USDC which complicates the UX. Since internal accounting is 6-dec,
  no conversion needed — the input is used directly.
- **`sell()` output method:** Use ERC-20 `transfer` (6 dec) to pay the seller.
  No conversion needed since internal accounting is 6-dec. Note: this truncates
  sub-micro-USDC amounts, which is acceptable (the ERC-20 view is inherently
  6-dec).
- **Never mix 6-dec and 18-dec values** in any calculation. Since we're 6-dec
  throughout, the only 18-dec values are gas-related and don't enter curve math.

### Blocklist edge case

Arc's USDC has a runtime blocklist (Circle compliance). A `sell()` payout
transfer to a blocklisted address **reverts**. Defined behavior:
- `sell()` reverts cleanly if the payout transfer fails. The seller's tokens
  remain held in the curve — they are not stranded or swallowed, but they also
  can't be sold until the blocklist is resolved (which is Circle's process, not
  ours). This is unavoidable on Arc.
- The frontend must surface a clear error message when this happens, not a
  cryptic revert.

### Off-chain state (do NOT store on-chain)

- `volume24h`: A 24h rolling window requires a ring buffer of trades or
  off-chain computation — storing it as a single uint is wrong. This belongs
  in the indexer/DB, not on-chain.
- `marketCap`: Derivable from `reserveUSDC` + `totalSupply` + curve formula.
  Implemented as a `view` function, not storage. Storing it as mutable state
  invites desync bugs.

### Other notes

- `minTokensOut` / `minUSDCOut` are slippage protection — do not ship without
  them, an unprotected buy/sell is directly exploitable by front-running bots.
- Max wallet holding % (anti-rug requirement from master plan) enforced here:
  reject a `buy()` that would push any single wallet above the threshold
  pre-graduation. `[CONFIRM]` threshold — 2-4% of supply is a common range,
  pick one and log it. Note: on-chain max-wallet is bypassable via multiple
  wallets — document this limitation honestly, don't overclaim protection.

---

## 4. LiquidityMigration.sol

Triggered automatically when `marketCap() >= GRADUATION_THRESHOLD` (from
economics modeling in section 0 — `[CONFIRM]`).

```solidity
function checkAndMigrate(address token) external;   // called after every buy() that could push market cap over threshold
```

On trigger, atomically:
1. Create AMM pair via our `AMMFactory` (deployed in this phase, address logged).
2. Add remaining reserve as liquidity to the pair (USDC + token).
3. Burn LP tokens (call the AMM pair's `burn` function, which sends LP tokens
   to `address(0)` — verify this works on Arc testnet, since Arc's zero-address
   rules differ for native value transfers; ERC-20 transfers to `address(0)`
   are contract-level and should be fine, but confirm).
4. Call `MemeToken.renounceOwnership()`.
5. Mark token `graduated = true` in `TokenFactory`.

This whole sequence must be atomic — if any step fails, the whole migration
reverts, not partially completes. A token stuck half-graduated (LP created but
not burned, e.g.) is a worse state than not graduating at all.

---

## 5. Treasury.sol

```solidity
function withdraw(uint256 amount) external onlyOwner;
function distribute() external onlyOwner;   // if multiple recipients eventually, e.g. team split — single-owner in v1 is fine
```

Keep this contract minimal in v1 — it's just a fee collection point for launch
fees and trading fees. Don't build claim/distribution logic for features
(referrals, creator rewards) that don't exist yet. The `claim()` function from
the original spec is removed entirely — stubs become liabilities.

---

## 6. AMMFactory.sol + AMMPair.sol (Uniswap V2 fork — graduation target)

No on-chain DEX exists on Arc, so we deploy our own minimal AMM for graduation.
This is a fork of Uniswap V2's core contracts (`UniswapV2Factory` +
`UniswapV2Pair`), which are the most audited AMM code in existence (~800 lines
total).

```solidity
// AMMFactory.sol
function createPair(address tokenA, address tokenB) external returns (address pair);
function getPair(address tokenA, address tokenB) external view returns (address pair);
function allPairs(uint256) external view returns (address pair);
function allPairsLength() external view returns (uint256);

// AMMPair.sol (standard Uniswap V2 pair interface)
function mint(address to) external returns (uint256 liquidity);
function burn(address to) external returns (uint256 amount0, uint256 amount1);
function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
```

Modifications from upstream Uniswap V2:
- **Strip fee-on-switch and protocol-fee features** — not needed, reduces
  attack surface.
- **Keep core swap/liquidity/burn logic intact** — this is audited code, don't
  rewrite it.
- **Verify LP burn to `address(0)` works on Arc** — Uniswap V2's `burn()`
  sends LP tokens to `address(0)` via the pair's own `_burn`. This is an
  ERC-20 internal operation, not a native value transfer, so it should work
  on Arc. But confirm on testnet before relying on it.

Notes:
- This AMM holds real USDC reserves post-graduation. It is part of the audit
  scope in Phase 4 — do not treat it as "just infrastructure."
- Post-graduation, the frontend links to this AMM pair for trading (not an
  external DEX).
- Future option (not v1): capture AMM swap fees as additional revenue. Note
  this in the decision log but don't build it now.

---

## 7. Test suite requirements (exit gate)

### Tier 1: forge tests (pure EVM logic — bonding curve math, access control, slippage)

- [ ] Full lifecycle test: create → multiple buys from different wallets → sell → market cap crosses threshold → graduation fires → LP burned into our AMM → ownership renounced
- [ ] Slippage protection test: buy/sell revert correctly when `minTokensOut`/`minUSDCOut` not met
- [ ] Max wallet % test: buy that would exceed threshold reverts
- [ ] Cooldown test: rapid-fire buys within cooldown window revert
- [ ] No-mint test: confirm no code path can increase total supply post-deploy
- [ ] Failed migration test: force a migration step to fail, confirm full revert, no stuck state
- [ ] AMM pair test: add liquidity, swap, remove liquidity, verify constant-product invariant holds

### Tier 2: Arc-testnet integration tests (cannot run on anvil — Arc-specific behavior)

These must run against `https://rpc.testnet.arc.io` because `anvil` runs a
standard EVM, not Arc's. USDC native-coin behavior, EIP-7708 events, and
blocklist enforcement only surface on a real Arc endpoint.

- [ ] USDC decimal accounting test: buy with 6-dec ERC-20 input via `transferFrom`, verify 6-dec internal accounting is correct (no conversion needed), verify sell payout in 6-dec ERC-20 `transfer`
- [ ] EIP-7708 event emission test: verify USDC movements emit the expected `Transfer` logs from the system emitter (`0xffff...fe`, 18 dec)
- [ ] Blocklist sell test: if blocklist is active on testnet, simulate a blocklisted recipient and verify `sell()` reverts cleanly with no stranded funds. If blocklist is mainnet-only, document this and simulate via a mock.
- [ ] LP burn on Arc testnet: verify that burning LP tokens to `address(0)` via the AMM pair's `burn()` actually works on Arc (not just in forge)
- [ ] Graduation end-to-end on testnet: full lifecycle deployed to testnet, verify LP is burned and ownership is renounced by checking on `testnet.arcscan.app`

## Definition of done

- [ ] All 7 contracts deployed to Arc testnet, addresses logged in decision log
- [ ] All Tier 1 (forge) tests pass
- [ ] All Tier 2 (Arc-testnet integration) tests pass
- [ ] Bonding curve economics model completed and values logged
- [ ] All `[CONFIRM]` values in this file resolved to actual numbers, logged
- [ ] LP burn verified on `testnet.arcscan.app` (not just that the call succeeded)
