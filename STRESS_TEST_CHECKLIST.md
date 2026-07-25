# User Testing Checklist — Orba

Print this. Tick boxes as you go. Date + initial each row when done.
Anything that fails → log in `STRESS_TEST_PLAYBOOK.md` "Findings log" before moving on.

**Tester A** = "The Trader" (launch, buy, sell, graduation, AMM, real-time)
**Tester B** = "The Browser" (every page, auth, favorites, chat, profile, search, formatting, mobile)

---

## Setup (both — before anything)

- [ ] Wallet installed (MetaMask/Rabby) ______
- [ ] Arc Testnet added to wallet (chain ID 5042002) ______
- [ ] Wallet funded with testnet USDC (https://faucet.circle.com) ______
- [ ] Site URL from Lead opened in browser ______
- [ ] DevTools open (F12) — Console + Network tabs ______
- [ ] Home page loads, tokens visible ______
- [ ] Connected wallet (navbar "Connect Wallet") ______
- [ ] Balance shows correctly (not $0) ______

---

## TESTER A — "The Trader"

### A1 — Wallet connect + network switch
- [ ] Connect Wallet button works ______
- [ ] Address shows in navbar ______
- [ ] Balance displays correctly ______
- [ ] "Switch to Arc Testnet" button works if wrong network ______

### A2 — Launch a token
- [ ] Form accepts name, symbol, description, image ______
- [ ] Image upload shows preview ______
- [ ] Creation fee (5 USDC) displays ______
- [ ] USDC approval step works (wallet prompts, confirms) ______
- [ ] Launch tx confirms ______
- [ ] Success toast appears ______
- [ ] Redirected to new token's coin page ______
- [ ] Token appears on home page within seconds ______
- [ ] No image launch → clear error or works ______
- [ ] Insufficient USDC → clear error ______
- [ ] Wrong network → switch button appears ______

### A3 — Buy with quick amount (10/50/100/500)
- [ ] Quick amount buttons fill input ______
- [ ] Quote updates instantly (tokens you'll receive) ______
- [ ] USDC approval step works ______
- [ ] Buy tx confirms ______
- [ ] Success toast appears ______
- [ ] Token balance updates on panel ______
- [ ] Price + market cap update on page ______
- [ ] Trade appears in TradeHistory ______

### A4 — Buy with custom amount
- [ ] Custom amount accepted ______
- [ ] Quote updates for custom amount ______
- [ ] Buy succeeds ______
- [ ] Amount "0" → button disabled or error ______
- [ ] Very small amount (0.01) → works ______
- [ ] Amount > balance → clear error ______
- [ ] Negative/special chars → input rejects ______

### A5 — Sell tokens
- [ ] Sell tab works ______
- [ ] Quote shows USDC you'll receive ______
- [ ] Token approval step works (different from USDC approval) ______
- [ ] Sell tx confirms ______
- [ ] Success toast appears ______
- [ ] Token balance decreases ______
- [ ] USDC balance increases ______
- [ ] Price + market cap update ______
- [ ] Trade appears in TradeHistory ______
- [ ] Sell more than held → clear error ______
- [ ] Sell 0 → button disabled ______
- [ ] Sell 100% of holdings → works ______

### A6 — Slippage tolerance
- [ ] Slippage setting visible and adjustable ______
- [ ] Quote shows minimum you'll receive ______
- [ ] Tight slippage that fails → clear "slippage exceeded" message ______
- [ ] Loose slippage → succeeds ______

### A7 — Watch graduation happen (needs more USDC — coordinate with Lead)
- [ ] Market cap climbs as you buy (visible on page) ______
- [ ] Price chart updates with each buy ______
- [ ] At $25,000 MC, graduation triggers automatically ______
- [ ] "Graduated" badge/indicator appears ______
- [ ] Trade panel changes (AMM, not curve) ______
- [ ] Price continues smoothly (no sudden jump/drop) ______
- [ ] Token still appears on home/explore/leaderboard ______
- [ ] No frozen UI during graduation ______

### A8 — Trade on AMM (after graduation)
- [ ] Buy on AMM works (approve + swap + confirm) ______
- [ ] Sell on AMM works (approve + swap + confirm) ______
- [ ] Quotes reasonable (0.3% AMM fee) ______
- [ ] Price updates after each trade ______
- [ ] Trades appear in TradeHistory ______
- [ ] Large buy → slippage protection kicks in ______

### A9 — Real-time updates (two tabs)
- [ ] Trade in Tab 1 → Tab 2 updates without refresh ______
- [ ] Price chart updates real-time in both tabs ______
- [ ] Trade history updates real-time in both tabs ______
- [ ] LiveTicker on home updates real-time ______
- [ ] Background tab 30s → reconnects and catches up ______
- [ ] Internet off/on → reconnects and resumes ______

### A10 — LiveTicker
- [ ] LiveTicker shows recent activity ______
- [ ] Updates within seconds when trades happen ______
- [ ] Values correct (not 1e6× off) ______
- [ ] Doesn't freeze or stop over time ______

### A11 — Transaction failure feedback
- [ ] Insufficient USDC → clear error (not raw hex) ______
- [ ] Sell tokens you don't have → clear error ______
- [ ] Launch with insufficient USDC → clear error ______
- [ ] UI doesn't hang after failure ______
- [ ] Can try again after failure (buttons reset) ______

### A12 — Rapid buying (UI stress)
- [ ] 5–10 rapid buys tracked correctly ______
- [ ] UI doesn't freeze or crash ______
- [ ] Balance correct after all buys settle ______
- [ ] Trade history shows all buys in order ______

### A13 — Wrong network handling
- [ ] Wrong network detected ______
- [ ] "Switch to Arc Testnet" button appears ______
- [ ] Clicking it prompts wallet to switch ______
- [ ] After switching back, everything works ______

### A14 — Disconnect and reconnect
- [ ] Disconnect works cleanly ______
- [ ] Trade panel prompts to connect when disconnected ______
- [ ] Reconnect restores full functionality ______
- [ ] No stale state after reconnect (balance is fresh) ______

---

## TESTER B — "The Browser"

### B1 — Home page (`/`)
- [ ] Page loads without errors ______
- [ ] Token grid shows multiple tokens ______
- [ ] Values reasonable (not $0, not 1e6× big) ______
- [ ] Token images load (no broken icons) ______
- [ ] LiveTicker visible and updating ______
- [ ] Clicking a token → coin page ______

### B2 — Explore page (`/explore`)
- [ ] Page loads with token list ______
- [ ] Values correct (price, MC, volume) ______
- [ ] Pagination/load more works (if present) ______
- [ ] Sorting works (if present) ______
- [ ] Clicking a token → coin page ______

### B3 — Launch page form validation
- [ ] Empty form → validation errors ______
- [ ] Partial form → shows what's missing ______
- [ ] Large image → rejected or resized ______
- [ ] Non-image file → rejected ______
- [ ] Special characters → no crash ______
- [ ] Creation fee (5 USDC) displayed clearly ______

### B4 — Coin page layout
- [ ] Token header (name, symbol, image) ______
- [ ] Price chart renders ______
- [ ] Trade panel present ______
- [ ] Trade history shows past trades ______
- [ ] Holders panel shows holders ______
- [ ] Token chat shows messages or empty state ______
- [ ] Favorite button clickable ______
- [ ] Share button works ______
- [ ] Social links display (if token has them) ______
- [ ] Values correct (MC, price, volume) ______

### B5 — Coin page (graduated token)
- [ ] "Graduated" badge/indicator shows ______
- [ ] Trade panel shows AMM trading ______
- [ ] Price and MC display correctly ______
- [ ] Trade history shows trades ______
- [ ] Token still on home/explore ______

### B6 — Leaderboard (`/leaderboard`)
- [ ] Page loads with ranked list ______
- [ ] Ranking makes sense ______
- [ ] Values correct ______
- [ ] Clicking a token → coin page ______
- [ ] Tabs/filters work (if present) ______

### B7 — Auth flow (SIWE)
- [ ] Login button visible ______
- [ ] Wallet signature prompt appears ______
- [ ] After signing, logged in ______
- [ ] Login persists across refresh ______
- [ ] Logout works ______

### B8 — Favorites / Watchlist
- [ ] Favorite button toggles (filled heart) ______
- [ ] `/watchlist` shows favorited tokens ______
- [ ] Unfavorite updates watchlist ______
- [ ] Watchlist requires auth (redirects if logged out) ______

### B9 — Token chat
- [ ] Chat input visible when logged in ______
- [ ] Messages send and appear immediately ______
- [ ] Messages persist after refresh ______
- [ ] Messages show address + timestamp ______
- [ ] Real-time from other user (if tested) ______
- [ ] Empty message → blocked ______
- [ ] Very long message → blocked or truncated ______
- [ ] Send while logged out → prompts login ______

### B10 — Profile page (`/profile/[wallet]`)
- [ ] Page loads ______
- [ ] Wallet address shown ______
- [ ] Holdings listed (if any) ______
- [ ] Trade history shown (if any) ______
- [ ] Values correct (not 1e6× off) ______
- [ ] Empty profile → empty state (not crash) ______
- [ ] Invalid address → error or 404 ______

### B11 — Search
- [ ] Search by name → results ______
- [ ] Search by symbol → results ______
- [ ] Search by contract address → token page or result ______
- [ ] No-match → "No tokens found" ______
- [ ] Empty query → no crash ______
- [ ] Special characters → no crash ______

### B12 — Fees page (`/fees`)
- [ ] Page loads ______
- [ ] 1% fee explained (50/50 creator/protocol) ______
- [ ] $25,000 graduation threshold shown ______
- [ ] $8,500 LP seed shown ______
- [ ] 5 USDC creation fee shown ______

### B13 — Docs page (`/docs`)
- [ ] Page loads ______
- [ ] Content readable ______
- [ ] Links work ______

### B14 — Blog page (`/blog`)
- [ ] Page loads ______
- [ ] Posts display or empty state ______

### B15 — Legal pages
- [ ] `/legal/terms` loads ______
- [ ] `/legal/privacy-policy` loads ______
- [ ] `/legal/dmca-policy` loads ______
- [ ] `/legal/trademark-guidelines` loads ______
- [ ] `/legal/tokenized-agent-disclaimer` loads ______

### B16 — Agents pages
- [ ] `/agents` loads ______
- [ ] `/agents/[agentId]` loads (if agents exist) ______
- [ ] Agent info displays correctly ______
- [ ] Launched tokens listed (if any) ______

### B17 — 404 and error pages
- [ ] Non-existent URL → 404 page with link home ______
- [ ] Invalid token address → error/empty state (not crash) ______

### B18 — Mobile responsive
- [ ] Home usable on mobile (375px) ______
- [ ] Explore usable on mobile ______
- [ ] Launch form usable on mobile ______
- [ ] Coin page usable on mobile (trade panel tappable) ______
- [ ] Leaderboard usable on mobile ______
- [ ] Watchlist usable on mobile ______
- [ ] Profile usable on mobile ______
- [ ] Agents usable on mobile ______
- [ ] Navbar collapses to hamburger on mobile ______
- [ ] No horizontal scrolling ______
- [ ] Text readable without zooming ______

### B19 — USDC formatting (every page — #1 bug source)
- [ ] Home: market cap reasonable (~$4K–$25K, not $4B) ______
- [ ] Home: volume reasonable (not $0 for active tokens) ______
- [ ] Coin: market cap reasonable ______
- [ ] Coin: price reasonable (small, e.g., $0.004) ______
- [ ] Coin: curve USDC reasonable ______
- [ ] Coin: creator fees reasonable ______
- [ ] Coin: protocol fees reasonable ______
- [ ] Navbar: balance correct (not $0 when you have USDC) ______
- [ ] Profile: holdings value reasonable ______
- [ ] Profile: trade amounts reasonable ______
- [ ] Fees: creation fee shows $5 (not $0.000005) ______
- [ ] Fees: graduation shows $25,000 (not $25B) ______
- [ ] Fees: LP seed shows $8,500 (not $8.5B) ______

### B20 — Browser shields / adblocker
- [ ] Install uBlock Origin / enable shields ______
- [ ] Balance loads (not $0) ______
- [ ] Trades work ______
- [ ] No silent failures (clear errors if anything fails) ______

### B21 — Multiple tabs
- [ ] 3+ tabs work independently ______
- [ ] No conflicts or errors ______
- [ ] Real-time updates flow to all tabs ______

### B22 — Navbar and footer
- [ ] All navbar links work ______
- [ ] All footer links work ______
- [ ] Mobile navbar (hamburger) works ______
- [ ] No broken links (unexpected 404s) ______

### B23 — Token image display
- [ ] Images load (no broken placeholders) ______
- [ ] Images sized correctly (not stretched) ______
- [ ] Tokens without images → placeholder (initial/default icon) ______

---

## Sign-off

**Tester A — completed:** ______ (date) ______ (initials)
**Tester B — completed:** ______ (date) ______ (initials)
**Lead — reviewed findings:** ______ (date) ______ (initials)
**Mainnet go/no-go:** ______ (date) ______ (decision)

**Mainnet cannot ship until:**
- All Critical findings resolved
- All High findings resolved or explicitly accepted by Lead
- Audit closed
- B19 (USDC formatting) passes on every page
