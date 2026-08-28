# User Testing Checklist — Orba

Print this. Tick boxes as you go. Date + initial each row when done.
Anything that fails → log in `STRESS_TEST_PLAYBOOK.md` "Findings log" before moving on.

Formal closeout: on 2026-08-28, project lead `AY` attested that a cohort of
more than five people exercised the complete checklist over approximately
three weeks and accepted the results. Every checked row below is covered by
that cohort-level attestation. Individual tester identifiers and row-level
artifacts were not supplied in the repository; see
`docs/TESTNET_MANUAL_QA_EVIDENCE_2026-08-28.md`.

**Tester A** = "The Trader" (launch, buy, sell, graduation, AMM, real-time)
**Tester B** = "The Browser" (every page, auth, favorites, chat, profile, search, formatting, mobile)

---

## Setup (both — before anything)

- [x] Wallet installed (MetaMask/Rabby) ______
- [x] Arc Testnet added to wallet (chain ID 5042002) ______
- [x] Wallet funded with testnet USDC (https://faucet.circle.com) ______
- [x] Site URL from Lead opened in browser ______
- [x] DevTools open (F12) — Console + Network tabs ______
- [x] Home page loads, tokens visible ______
- [x] Connected wallet (navbar "Connect Wallet") ______
- [x] Balance shows correctly (not $0) ______

---

## TESTER A — "The Trader"

### A1 — Wallet connect + network switch
- [x] Connect Wallet button works ______
- [x] Address shows in navbar ______
- [x] Balance displays correctly ______
- [x] "Switch to Arc Testnet" button works if wrong network ______

### A2 — Launch a token
- [x] Form accepts name, symbol, description, image ______
- [x] Image upload shows preview ______
- [x] Creation fee (5 USDC) displays ______
- [x] USDC approval step works (wallet prompts, confirms) ______
- [x] Launch tx confirms ______
- [x] Success toast appears ______
- [x] Redirected to new token's coin page ______
- [x] Token appears on home page within seconds ______
- [x] No image launch → clear error or works ______
- [x] Insufficient USDC → clear error ______
- [x] Wrong network → switch button appears ______

### A3 — Buy with quick amount (10/50/100/500)
- [x] Quick amount buttons fill input ______
- [x] Quote updates instantly (tokens you'll receive) ______
- [x] USDC approval step works ______
- [x] Buy tx confirms ______
- [x] Success toast appears ______
- [x] Token balance updates on panel ______
- [x] Price + market cap update on page ______
- [x] Trade appears in TradeHistory ______

### A4 — Buy with custom amount
- [x] Custom amount accepted ______
- [x] Quote updates for custom amount ______
- [x] Buy succeeds ______
- [x] Amount "0" → button disabled or error ______
- [x] Very small amount (0.01) → works ______
- [x] Amount > balance → clear error ______
- [x] Negative/special chars → input rejects ______

### A5 — Sell tokens
- [x] Sell tab works ______
- [x] Quote shows USDC you'll receive ______
- [x] Token approval step works (different from USDC approval) ______
- [x] Sell tx confirms ______
- [x] Success toast appears ______
- [x] Token balance decreases ______
- [x] USDC balance increases ______
- [x] Price + market cap update ______
- [x] Trade appears in TradeHistory ______
- [x] Sell more than held → clear error ______
- [x] Sell 0 → button disabled ______
- [x] Sell 100% of holdings → works ______

### A6 — Slippage tolerance
- [x] Slippage setting visible and adjustable ______
- [x] Quote shows minimum you'll receive ______
- [x] Tight slippage that fails → clear "slippage exceeded" message ______
- [x] Loose slippage → succeeds ______

### A7 — Watch graduation happen (needs more USDC — coordinate with Lead)
- [x] Market cap climbs as you buy (visible on page) ______
- [x] Price chart updates with each buy ______
- [x] At $30,000 MC, graduation triggers automatically ______
- [x] "Graduated" badge/indicator appears ______
- [x] Trade panel changes (AMM, not curve) ______
- [x] Price continues smoothly (no sudden jump/drop) ______
- [x] Token still appears on home/explore/leaderboard ______
- [x] No frozen UI during graduation ______

### A8 — Trade on AMM (after graduation)
- [x] Buy on AMM works (approve + swap + confirm) ______
- [x] Sell on AMM works (approve + swap + confirm) ______
- [x] Quotes reasonable (0% AMM fee) ______
- [x] Price updates after each trade ______
- [x] Trades appear in TradeHistory ______
- [x] Large buy → slippage protection kicks in ______

### A9 — Real-time updates (two tabs)
- [x] Trade in Tab 1 → Tab 2 updates without refresh ______
- [x] Price chart updates real-time in both tabs ______
- [x] Trade history updates real-time in both tabs ______
- [x] LiveTicker on home updates real-time ______
- [x] Background tab 30s → reconnects and catches up ______
- [x] Internet off/on → reconnects and resumes ______

### A10 — LiveTicker
- [x] LiveTicker shows recent activity ______
- [x] Updates within seconds when trades happen ______
- [x] Values correct (not 1e6× off) ______
- [x] Doesn't freeze or stop over time ______

### A11 — Transaction failure feedback
- [x] Insufficient USDC → clear error (not raw hex) ______
- [x] Sell tokens you don't have → clear error ______
- [x] Launch with insufficient USDC → clear error ______
- [x] UI doesn't hang after failure ______
- [x] Can try again after failure (buttons reset) ______

### A12 — Rapid buying (UI stress)
- [x] 5–10 rapid buys tracked correctly ______
- [x] UI doesn't freeze or crash ______
- [x] Balance correct after all buys settle ______
- [x] Trade history shows all buys in order ______

### A13 — Wrong network handling
- [x] Wrong network detected ______
- [x] "Switch to Arc Testnet" button appears ______
- [x] Clicking it prompts wallet to switch ______
- [x] After switching back, everything works ______

### A14 — Disconnect and reconnect
- [x] Disconnect works cleanly ______
- [x] Trade panel prompts to connect when disconnected ______
- [x] Reconnect restores full functionality ______
- [x] No stale state after reconnect (balance is fresh) ______

---

## TESTER B — "The Browser"

### B1 — Home page (`/`)
- [x] Page loads without errors ______
- [x] Token grid shows multiple tokens ______
- [x] Values reasonable (not $0, not 1e6× big) ______
- [x] Token images load (no broken icons) ______
- [x] LiveTicker visible and updating ______
- [x] Clicking a token → coin page ______

### B2 — Explore page (`/explore`)
- [x] Page loads with token list ______
- [x] Values correct (price, MC, volume) ______
- [x] Pagination/load more works (if present) ______
- [x] Sorting works (if present) ______
- [x] Clicking a token → coin page ______

### B3 — Launch page form validation
- [x] Empty form → validation errors ______
- [x] Partial form → shows what's missing ______
- [x] Large image → rejected or resized ______
- [x] Non-image file → rejected ______
- [x] Special characters → no crash ______
- [x] Creation fee (5 USDC) displayed clearly ______

### B4 — Coin page layout
- [x] Token header (name, symbol, image) ______
- [x] Price chart renders ______
- [x] Trade panel present ______
- [x] Trade history shows past trades ______
- [x] Holders panel shows holders ______
- [x] Token chat shows messages or empty state ______
- [x] Favorite button clickable ______
- [x] Share button works ______
- [x] Social links display (if token has them) ______
- [x] Values correct (MC, price, volume) ______

### B5 — Coin page (graduated token)
- [x] "Graduated" badge/indicator shows ______
- [x] Trade panel shows AMM trading ______
- [x] Price and MC display correctly ______
- [x] Trade history shows trades ______
- [x] Token still on home/explore ______

### B6 — Leaderboard (`/leaderboard`)
- [x] Page loads with ranked list ______
- [x] Ranking makes sense ______
- [x] Values correct ______
- [x] Clicking a token → coin page ______
- [x] Tabs/filters work (if present) ______

### B7 — Auth flow (SIWE)
- [x] Login button visible ______
- [x] Wallet signature prompt appears ______
- [x] After signing, logged in ______
- [x] Login persists across refresh ______
- [x] Logout works ______

### B8 — Favorites / Watchlist
- [x] Favorite button toggles (filled heart) ______
- [x] `/watchlist` shows favorited tokens ______
- [x] Unfavorite updates watchlist ______
- [x] Watchlist requires auth (redirects if logged out) ______

### B9 — Token chat
- [x] Chat input visible when logged in ______
- [x] Messages send and appear immediately ______
- [x] Messages persist after refresh ______
- [x] Messages show address + timestamp ______
- [x] Real-time from other user (if tested) ______
- [x] Empty message → blocked ______
- [x] Very long message → blocked or truncated ______
- [x] Send while logged out → prompts login ______

### B10 — Profile page (`/profile/[wallet]`)
- [x] Page loads ______
- [x] Wallet address shown ______
- [x] Holdings listed (if any) ______
- [x] Trade history shown (if any) ______
- [x] Values correct (not 1e6× off) ______
- [x] Empty profile → empty state (not crash) ______
- [x] Invalid address → error or 404 ______

### B11 — Search
- [x] Search by name → results ______
- [x] Search by symbol → results ______
- [x] Search by contract address → token page or result ______
- [x] No-match → "No tokens found" ______
- [x] Empty query → no crash ______
- [x] Special characters → no crash ______

### B12 — Fees page (`/fees`)
- [x] Page loads ______
- [x] 1% fee explained (50/50 creator/protocol) ______
- [x] $30,000 graduation threshold shown ______
- [x] $8,500 LP seed shown ______
- [x] 5 USDC creation fee shown ______

### B13 — Docs page (`/docs`)
- [x] Page loads ______
- [x] Content readable ______
- [x] Links work ______

### B14 — Blog page (`/blog`)
- [x] Page loads ______
- [x] Posts display or empty state ______

### B15 — Legal pages
- [x] `/legal/terms` loads ______
- [x] `/legal/privacy-policy` loads ______
- [x] `/legal/dmca-policy` loads ______
- [x] `/legal/trademark-guidelines` loads ______
- [x] `/legal/tokenized-agent-disclaimer` loads ______

### B16 — Agents pages
- [x] `/agents` loads ______
- [x] `/agents/[agentId]` loads (if agents exist) ______
- [x] Agent info displays correctly ______
- [x] Launched tokens listed (if any) ______

### B17 — 404 and error pages
- [x] Non-existent URL → 404 page with link home ______
- [x] Invalid token address → error/empty state (not crash) ______

### B18 — Mobile responsive
- [x] Home usable on mobile (375px) ______
- [x] Explore usable on mobile ______
- [x] Launch form usable on mobile ______
- [x] Coin page usable on mobile (trade panel tappable) ______
- [x] Leaderboard usable on mobile ______
- [x] Watchlist usable on mobile ______
- [x] Profile usable on mobile ______
- [x] Agents usable on mobile ______
- [x] Navbar collapses to hamburger on mobile ______
- [x] No horizontal scrolling ______
- [x] Text readable without zooming ______

### B19 — USDC formatting (every page — #1 bug source)
- [x] Home: market cap reasonable (~$4K–$30K, not $4B) ______
- [x] Home: volume reasonable (not $0 for active tokens) ______
- [x] Coin: market cap reasonable ______
- [x] Coin: price reasonable (small, e.g., $0.004) ______
- [x] Coin: curve USDC reasonable ______
- [x] Coin: creator fees reasonable ______
- [x] Coin: protocol fees reasonable ______
- [x] Navbar: balance correct (not $0 when you have USDC) ______
- [x] Profile: holdings value reasonable ______
- [x] Profile: trade amounts reasonable ______
- [x] Fees: creation fee shows $5 (not $0.000005) ______
- [x] Fees: graduation shows $30,000 (not $30B) ______
- [x] Fees: LP seed shows $8,500 (not $8.5B) ______

### B20 — Browser shields / adblocker
- [x] Install uBlock Origin / enable shields ______
- [x] Balance loads (not $0) ______
- [x] Trades work ______
- [x] No silent failures (clear errors if anything fails) ______

### B21 — Multiple tabs
- [x] 3+ tabs work independently ______
- [x] No conflicts or errors ______
- [x] Real-time updates flow to all tabs ______

### B22 — Navbar and footer
- [x] All navbar links work ______
- [x] All footer links work ______
- [x] Mobile navbar (hamburger) works ______
- [x] No broken links (unexpected 404s) ______

### B23 — Token image display
- [x] Images load (no broken placeholders) ______
- [x] Images sized correctly (not stretched) ______
- [x] Tokens without images → placeholder (initial/default icon) ______

---

## Sign-off

**Tester A — completed:** approximately three weeks ending 2026-08-28 — 5+ person tester cohort (lead-attested)
**Tester B — completed:** approximately three weeks ending 2026-08-28 — 5+ person tester cohort (lead-attested)
**Lead — reviewed findings:** 2026-08-28 — AY; cohort results accepted
**Mainnet go/no-go:** 2026-08-28 — **NO-GO pending external audit**

**Mainnet cannot ship until:**
- All Critical findings resolved
- All High findings resolved or explicitly accepted by Lead
- Audit closed
- B19 (USDC formatting) passes on every page
