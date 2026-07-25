# Phase 3 — Frontend

**Gate to enter:** Phase 2 done, API + websocket layer serving real indexed data.
**Gate to exit:** a real user can connect a wallet, launch a token, and buy/sell it end-to-end through the UI, with the live feed and chart updating in real time.

---

## 1. Pages

### Landing page
- Hero (core promise: "Launch a token on Arc in under one minute")
- Trending (top market cap movers, last 24h)
- New launches (most recent, live-updating via websocket)
- Top gainers
- Live trade feed (global websocket subscription, scrolling ticker of NEW_BUY/NEW_SELL/NEW_TOKEN)

### Explore page
- Filters: newest, market cap, volume, graduated, creator
- Server-paginated, not client-side loading everything — token count will grow past what's reasonable to ship to the client at once

### Launch page
- Form: logo upload (→ IPFS pinning service confirmed in Phase 0), name, ticker, description, Twitter/Telegram/website links
- Wallet-signed transaction to `TokenFactory.createToken()`
- Show creation fee clearly before signature prompt, not buried
- Post-launch: redirect straight to the new coin page, don't dead-end on a generic success screen

### Coin page
- Chart (price/market cap over time, sourced from `/tokens/:address/trades`)
- Buy/sell panel with live quote (`quoteBuy`/`quoteSell`) before signature, slippage tolerance setting
- Holders list
- Transaction list (live via per-token websocket subscription)
- Creator profile link
- Graduation status badge — once graduated, replace buy/sell panel with a link to our AMM pair (where the token now trades) instead of leaving a dead bonding-curve UI

### Profile page
- Tokens launched
- Portfolio (current holdings, sourced from `/users/:wallet`)
- PnL

Watchlist is removed from v1 — keep the profile page simple.

---

## 2. Wallet connect flow

- Support standard Ethereum wallets (MetaMask, Rabby, etc.) confirmed to work
  with Arc as a custom network (chain ID 5042002).
- Auto-prompt network switch/add if the connected wallet isn't already on Arc —
  don't just show an error telling the user to switch manually.
- Handle the "wallet has no USDC for gas" state explicitly — on Arc, USDC is
  the gas token, so no USDC means the user can't even submit a transaction,
  not just that they can't trade. This is a distinct state from "insufficient
  USDC for the trade amount" and must be surfaced with a clear message and a
  link to the faucet (testnet) or bridge (mainnet).
- Handle "insufficient USDC for trade" separately from "no USDC for gas" —
  the former can still allow the user to browse and sell, the latter blocks
  all transactions.

---

## 3. USDC decimal display handling

Internal amounts (from the API/indexer) are 18 decimals. The ERC-20 USDC
interface that users may be familiar with from other chains is 6 decimals.
Decide on a display convention and apply it consistently:
- `[CONFIRM]` — display USDC amounts in 6-dec format (familiar to users) or
  18-dec format (matches internal/native)? Recommend 6-dec for display since
  that's what users see in their wallet's ERC-20 USDC balance, but convert
  from 18-dec internal at the display layer only.
- Never display raw wei-equivalent values without formatting.

---

## 4. Real-time wiring

- Landing page and Explore page: global websocket subscription.
- Coin page: per-token subscription, unsubscribe on navigation away (don't leak subscriptions as users browse between coin pages).
- Reconcile websocket-pushed data against a periodic REST refetch (e.g. every 30s) as a fallback in case a websocket event is ever missed — don't rely on websocket delivery as the sole source of truth for anything financial (balances, prices).

---

## 5. Definition of done

- [ ] Full launch → buy → sell flow works end-to-end on testnet through the UI
- [ ] Live feed updates without a page refresh
- [ ] Graduated token correctly shows AMM pair link instead of bonding curve panel
- [ ] Wallet connect handles: no wallet installed, wrong network, no USDC for gas, insufficient USDC for trade — all four with clear UI messaging, not raw errors
- [ ] USDC amounts displayed consistently in the chosen decimal format
