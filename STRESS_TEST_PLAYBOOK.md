# User Testing Playbook — Orba

**You are a regular user. Open the site in your browser, connect your wallet, and click through everything.**
**Testnet only. Never test against mainnet.**
**Every finding goes in the "Findings log" at the bottom — don't DM findings, write them down.**

This is user-acceptance testing from the frontend. You're not probing contracts, databases, or backend infrastructure. You're clicking buttons, filling forms, watching screens, and reporting what you see as a user.

## The two testers

| Tester | Role | Focus |
|---|---|---|
| **Tester A** | "The Trader" | Core trading flow: wallet connect, launch, buy, sell, graduation, AMM, real-time updates |
| **Tester B** | "The Browser" | Navigation, every page, auth, favorites, chat, profile, search, formatting, mobile, errors |

Both testers read sections 1–3 before starting. Then each takes their own section.

---

## 1. Before you start (both testers)

### Get a wallet with testnet USDC
1. Install a wallet browser extension (MetaMask, Rabby, or any EVM wallet)
2. Get testnet USDC at https://faucet.circle.com (you'll need a small amount — $50–100 is plenty for most tests; Tester A's graduation test needs more, coordinate with the Lead)
3. Add Arc Testnet to your wallet:
   - Chain ID: `5042002`
   - RPC URL: ask the Lead for the current URL (or use the site — it should prompt you to add the network)
   - Currency symbol: `USDC`
   - Block explorer: ask the Lead

### Get the site URL
Ask the Lead for the frontend URL (local: `http://localhost:3000`, or a deployed URL). Open it in your browser.

### What "pass" means
- The action completed without errors
- The screen showed what a user would expect
- No error toasts, no console errors (open DevTools → Console), no frozen/hung UI
- Values displayed look reasonable (not $0 for a token with volume, not $4,000,000,000 for a $4K token)

### What "fail" means
- Button doesn't work or hangs forever
- Error message that doesn't make sense to a user
- Value displayed is obviously wrong (e.g., market cap shows $30,000,000,000 instead of $30,000)
- Page crashes, blank screen, or console errors
- Transaction fails on-chain with no feedback to the user
- Real-time updates stop flowing

### How to report a finding
Append to "Findings log" at the bottom of this file:
```
### F<n> — <short title>
- Severity: Critical / High / Medium / Low
- Found by: A or B
- Date: YYYY-MM-DD
- Scenario: <which one, e.g. "A4-buy-quick-amount">
- Repro:
  1. <step>
  2. <step>
- Expected: <what should happen>
- Actual: <what happened>
- Evidence: <screenshot path, tx hash, console error text>
- Status: Open / Fixed / Wontfix
```

**Severity guide (from a user's perspective):**
- **Critical**: user loses funds, transaction succeeds but user gets nothing, can't use core features at all
- **High**: core feature broken (can't buy, can't sell, can't launch), wrong values displayed that could mislead a user into a bad trade
- **Medium**: feature partially broken, confusing error, real-time updates lag but recover
- **Low**: cosmetic, typo, minor layout issue, edge case most users won't hit

### Open DevTools
Keep your browser's Developer Tools open (F12) on every test. Watch:
- **Console tab** — red errors, React warnings, failed fetches
- **Network tab** — failed requests (red), hanging requests, CORS errors
- No need to read the code — just note if you see red errors in the console when you do something

---

## 2. The numbers you need to know (to spot wrong values)

| What | Correct value | If you see this, it's wrong |
|---|---|---|
| Initial market cap (new token) | ~$4,000 | $4,000,000,000 (off by 1e6×) or $0 |
| Graduation threshold | $30,000 | $30,000,000,000 (off by 1e6×) |
| Creation fee | 5 USDC ($5) | 0.000005 (off by 1e6×) |
| Trading fee | 1% (50/50 creator/protocol) | — |
| Max wallet holding | 4% of supply (40M tokens) | — |
| Token total supply | 1 billion | — |
| LP seed on graduation | $8,500 | — |
| Wallet balance (native USDC) | your actual balance | $0 when you have USDC (browser shields blocking RPC) |
| Token price | small number (e.g., $0.004) | $4,000,000 (off by 1e12×) |

**The #1 bug to watch for**: USDC values showing as 1,000,000× or 1,000,000,000,000× too big, or showing $0 when they shouldn't. This happens when the frontend uses the wrong number formatter. If you see a token with a $4 billion market cap, that's a bug — log it.

---

## 3. Setup checklist (both testers — do this first)

- [ ] Wallet installed and Arc Testnet added
- [ ] Wallet funded with testnet USDC (https://faucet.circle.com)
- [ ] Site URL received from Lead and opened in browser
- [ ] DevTools open (F12) — Console + Network tabs
- [ ] Site loads without errors (home page shows tokens)
- [ ] Connected wallet (click "Connect Wallet" in navbar)
- [ ] Wallet balance shows correctly (not $0 — if $0, try disabling browser shields/adblocker for the site)

---

# TESTER A — "The Trader"

**Your job: test the core trading flow end-to-end as a user. Launch, buy, sell, watch graduation, trade on AMM, and verify real-time updates.**

## A1 — Connect wallet + network switching
**Steps**:
1. Click "Connect Wallet" in the navbar
2. Approve the connection in your wallet
3. If your wallet is on a different network, the site should show a "Switch to Arc Testnet" button — click it
4. Approve the network switch in your wallet

**Verify**:
- Wallet connects successfully
- Your address shows in the navbar (or a "Connected" indicator)
- Your USDC balance displays correctly (not $0 if you have USDC)
- If you were on the wrong network, the switch button worked
- No console errors

**Pass criteria**: wallet connected, balance correct, network switching works

---

## A2 — Launch a token (full form)
**Steps**:
1. Go to `/launch` (click "Launch" in navbar)
2. Fill in the form:
   - Token name: "Test Token A2"
   - Symbol: "TTA2"
   - Description: "Testing the launch flow"
   - Upload an image (any small PNG or JPG)
3. The form should show the creation fee (5 USDC) and your balance
4. Click "Launch Token" (or equivalent button)
5. Your wallet prompts for USDC approval (approving the 5 USDC fee) — approve it
6. Wait for the approval to confirm
7. Your wallet prompts again for the actual launch transaction — approve it
8. Wait for confirmation

**Verify**:
- Form accepts all inputs without errors
- Image upload shows a preview
- Creation fee (5 USDC) displays correctly
- Approval step works (wallet prompts, confirms, UI advances to launch step)
- Launch transaction confirms
- Success toast/notification appears ("Token launched" or similar)
- You're redirected to the new token's coin page (`/coin/<address>`)
- The token appears on the home page token grid within a few seconds
- No console errors

**Edge cases to try**:
- Try launching without an image — does it work or show a clear error?
- Try launching with a very long name/symbol — does it reject or accept?
- Try launching with insufficient USDC balance (use a separate wallet with < 5 USDC) — does it show a clear error before or during the tx?
- Try launching while on the wrong network — does the "Switch to Arc Testnet" button appear?

**Pass criteria**: full launch flow works end-to-end, token appears on site, edge cases handled

---

## A3 — Buy with quick amount buttons
**Steps**:
1. Go to any token's coin page (one from A2, or any existing token)
2. Find the TradePanel (buy/sell interface)
3. Make sure you're on the "Buy" tab
4. Click a quick amount button (10, 50, 100, or 500)
5. The panel should show a quote (how many tokens you'll receive)
6. Click "Approve USDC" (first time only — approves the curve to spend your USDC)
7. Approve in your wallet, wait for confirmation
8. Click "Buy"
9. Approve in your wallet, wait for confirmation

**Verify**:
- Quick amount buttons fill the input correctly
- Quote updates instantly when you select an amount (shows token amount you'll receive)
- Quote looks reasonable (not 0, not 1e18× too big)
- Approval step works (wallet prompts, confirms, UI advances to Buy button)
- Buy transaction confirms
- Success toast appears ("Bought TTA2 for 100 USDC" or similar)
- Your token balance updates on the panel
- The token's price and market cap update on the page
- The trade appears in the TradeHistory section
- Holder count increases (if shown)
- No console errors

**Pass criteria**: quick buy works end-to-end, balance/price/history update, toast shows

---

## A4 — Buy with custom amount
**Steps**:
1. On the same token, clear the amount input
2. Type a custom amount (e.g., "23.45")
3. Verify the quote updates
4. Click Buy (approval should already be done from A3)
5. Confirm in wallet

**Verify**:
- Custom amount accepted
- Quote updates for the custom amount
- Buy succeeds
- All updates flow (balance, price, history)

**Edge cases**:
- Type "0" — does the Buy button disable or show an error?
- Type a very small amount (0.01) — does it work?
- Type a very large amount (more than your balance) — does it show an error before submitting, or does the tx fail on-chain with a clear message?
- Type a negative number or special characters — does the input reject them?

**Pass criteria**: custom buy works, edge cases handled with clear errors

---

## A5 — Sell tokens
**Steps**:
1. On a token where you hold tokens (from A3/A4), switch to the "Sell" tab in the TradePanel
2. Enter an amount to sell (or click a quick amount if available)
3. The panel should show a quote (how much USDC you'll receive)
4. Click "Approve Token" (first time only — approves the curve to transfer your tokens)
5. Approve in your wallet, wait for confirmation
6. Click "Sell"
7. Approve in your wallet, wait for confirmation

**Verify**:
- Sell tab works
- Quote shows USDC you'll receive (reasonable amount, not 0 or 1e6× off)
- Token approval step works (different from USDC approval — this approves the token, not USDC)
- Sell transaction confirms
- Success toast appears ("Sold TTA2 for X USDC" or similar)
- Your token balance decreases
- Your USDC balance increases
- Token price and market cap update
- Trade appears in TradeHistory
- No console errors

**Edge cases**:
- Try to sell more tokens than you hold — does it show an error or let you submit a failing tx?
- Try to sell 0 — does the button disable?
- Try to sell all your tokens (100% of holdings) — does it work?

**Pass criteria**: sell works end-to-end, balance/price/history update, edge cases handled

---

## A6 — Slippage tolerance
**Steps**:
1. On the TradePanel, find the slippage setting (should be a slider or input, default 5%)
2. Change it to 1% (tight)
3. Enter a buy amount and get a quote
4. Submit the buy — should succeed (no one else is trading, so slippage is minimal)
5. Now change slippage to 0% (if allowed) or 0.1%
6. Try another buy — may fail if there's any price movement, but the failure should show a clear "slippage exceeded" message, not a confusing error

**Verify**:
- Slippage setting is visible and adjustable
- The quote accounts for slippage (shows minimum you'll receive)
- Tight slippage that fails shows a clear, user-friendly error
- Loose slippage always succeeds
- No console errors

**Pass criteria**: slippage control works, failures are user-friendly

---

## A7 — Watch graduation happen (the big test)
**This test needs more USDC — coordinate with the Lead for funding.**

**Steps**:
1. Launch a fresh token (or use one with very little USDC in the curve)
2. Buy tokens in increments, watching the market cap climb toward $30,000
3. As you buy, watch the price chart update in real-time
4. When your buy pushes the market cap to $30,000, graduation should trigger automatically
5. Watch the page change — the token should now show as "Graduated"
6. The trade panel should change (trading now happens on the AMM, not the curve)

**Verify**:
- Market cap climbs as you buy (visible on the coin page)
- Price chart updates with each buy
- At $30,000 MC, graduation triggers (you may see a notification or the page state change)
- After graduation:
  - The token shows a "Graduated" badge or indicator
  - The trade panel changes (you're now trading on the AMM, not the bonding curve)
  - The price continues from where the curve left off (no sudden jump or drop)
  - The token still appears on the site (home, explore, leaderboard)
- No console errors
- No frozen UI during graduation

**Pass criteria**: graduation triggers at $30K, page updates to graduated state, trading continues on AMM

---

## A8 — Trade on the AMM (after graduation)
**Steps**:
1. On a graduated token (from A7), try buying via the trade panel
2. The flow should be similar (approve USDC → buy), but now it's an AMM swap
3. Try selling tokens you hold

**Verify**:
- Buy on AMM works (approval + swap + confirmation)
- Sell on AMM works (approval + swap + confirmation)
- Quotes are reasonable (the AMM uses a 0% fee; the bonding curve charges 1%)
- Price updates after each trade
- Trades appear in TradeHistory
- No console errors

**Edge cases**:
- Try a very large buy that would move the price significantly — does slippage protection kick in?
- Try selling more than you hold — clear error?

**Pass criteria**: AMM trading works after graduation, quotes and updates correct

---

## A9 — Real-time updates (two tabs)
**Steps**:
1. Open the site in two browser tabs (same token's coin page in both)
2. In Tab 1, buy some tokens
3. Watch Tab 2 — it should update automatically (no refresh needed):
   - Price chart updates
   - Trade history shows the new trade
   - Market cap updates
4. In Tab 2, sell some tokens
5. Watch Tab 1 — it should update automatically

**Verify**:
- Trades in one tab appear in the other tab within a few seconds (no refresh)
- Price chart updates in real-time
- Trade history updates in real-time
- LiveTicker on the home page updates in real-time
- No need to refresh the page to see new trades

**Edge cases**:
- Close your laptop / background the tab for 30 seconds, then come back — does it reconnect and catch up?
- Disconnect your internet briefly (toggle wifi off/on) — does the tab reconnect and resume updates?

**Pass criteria**: real-time updates flow between tabs, reconnect works after interruption

---

## A10 — LiveTicker on home page
**Steps**:
1. Go to the home page (`/`)
2. Watch the LiveTicker (scrolling/animated list of recent trades or tokens)
3. In another tab, buy or sell a token
4. Watch the LiveTicker update

**Verify**:
- LiveTicker shows recent activity
- It updates within a few seconds when trades happen
- The values displayed are correct (not 1e6× off)
- It doesn't freeze or stop updating over time

**Pass criteria**: LiveTicker updates in real-time with correct values

---

## A11 — Transaction failure feedback
**Steps**:
1. Try to buy with insufficient USDC (use a wallet with very little USDC, or try a huge amount)
2. If the tx fails on-chain, verify you get a clear error message (toast or notification)
3. Try to sell tokens you don't have (somehow — maybe switch accounts)
4. Try to launch a token with insufficient USDC for the fee

**Verify**:
- Failed transactions show a clear, user-friendly error (not a raw hex error code)
- The UI doesn't hang or freeze after a failure
- You can try again after a failure (buttons reset)
- No console errors that prevent recovery

**Pass criteria**: failures show clear errors, UI recovers, no hangs

---

## A12 — Rapid buying (stress the UI, not the backend)
**Steps**:
1. On a token, buy 5–10 times in quick succession (as fast as you can click)
2. Watch how the UI handles rapid transactions

**Verify**:
- Each buy is tracked correctly (not lost or duplicated)
- The UI doesn't freeze or crash
- Balance updates correctly after all buys settle
- Trade history shows all buys in the right order
- No console errors

**Pass criteria**: UI handles rapid buys without freezing or losing track

---

## A13 — Wrong network handling
**Steps**:
1. While connected, switch your wallet to a different network (e.g., Ethereum mainnet)
2. Go back to the site
3. The site should detect you're on the wrong network and show a "Switch to Arc Testnet" button
4. Click it — your wallet should prompt to switch back
5. Approve the switch

**Verify**:
- Wrong network is detected
- "Switch to Arc Testnet" button appears
- Clicking it prompts the wallet to switch
- After switching back, everything works again (balance loads, trades work)
- No console errors

**Pass criteria**: wrong network detected, switch button works, recovery is smooth

---

## A14 — Disconnect and reconnect wallet
**Steps**:
1. Disconnect your wallet (via the navbar button or wallet extension)
2. Verify the site shows a "Connect Wallet" button again
3. Try to buy a token while disconnected — should prompt to connect first
4. Reconnect
5. Verify everything works again

**Verify**:
- Disconnect works cleanly
- Trade panel prompts to connect when disconnected
- Reconnect restores full functionality
- No stale state after reconnect (balance is fresh, not cached)

**Pass criteria**: disconnect/reconnect cycle works cleanly

---

# TESTER B — "The Browser"

**Your job: test every page, every navigation path, and every supporting feature as a user. If a page doesn't load, a value looks wrong, or a feature is broken, log it.**

## B1 — Home page (`/`)
**Steps**:
1. Go to the home page
2. Look at the token grid (list of tokens)
3. Click on a token — should go to its coin page
4. Go back, click another token

**Verify**:
- Page loads without errors
- Token grid shows multiple tokens with names, symbols, prices, market caps
- All values look reasonable (not $0, not 1e6× too big)
- Token images load (no broken image icons)
- LiveTicker is visible and updating
- Clicking a token navigates to its coin page
- No console errors

**Pass criteria**: home page loads, tokens display correctly, navigation works

---

## B2 — Explore page (`/explore`)
**Steps**:
1. Go to `/explore`
2. Browse the list of all tokens
3. If there's pagination or "load more", use it
4. Click on tokens to verify navigation

**Verify**:
- Page loads with a list of tokens
- Values (price, market cap, volume) are correct
- Pagination/load more works (if present)
- Sorting works (if there are sort options — by volume, market cap, newest, etc.)
- Clicking a token goes to its coin page
- No console errors

**Pass criteria**: explore page works, sorting/pagination functional

---

## B3 — Launch page (`/launch`) — form validation only
*(Tester A covers the full launch flow in A2. You cover form validation and edge cases.)*

**Steps**:
1. Go to `/launch`
2. Try submitting an empty form — should show validation errors
3. Try submitting with only a name (no symbol, no image) — should show what's missing
4. Try uploading a very large image — should be rejected or resized
5. Try uploading a non-image file (e.g., a .txt or .pdf) — should be rejected
6. Try entering special characters in the name/symbol

**Verify**:
- Form validation is clear (tells you what's missing or wrong)
- Image upload rejects non-images and oversized files
- Special characters handled (no crash)
- The creation fee (5 USDC) is displayed clearly
- No console errors

**Pass criteria**: form validation works, edge cases handled with clear messages

---

## B4 — Coin page (`/coin/[address]`) — layout and sections
*(Tester A covers trading on this page. You cover the page layout and all sections.)*

**Steps**:
1. Go to any token's coin page
2. Check each section is present and working:
   - Token header (name, symbol, image)
   - Price chart
   - Trade panel (buy/sell)
   - Trade history
   - Holders panel
   - Token chat
   - Favorite button (heart icon)
   - Share button
   - Social links (if the token has them)
3. Scroll through the whole page

**Verify**:
- All sections load
- Price chart renders (not blank, not frozen)
- Trade history shows past trades
- Holders panel shows list of holders with amounts
- Token chat shows messages (or empty state if none)
- Favorite button is clickable
- Share button works (copies link or shows share options)
- Values are correct (market cap, price, volume — not 1e6× off)
- No console errors
- Page is scrollable without issues

**Pass criteria**: all sections present and functional, values correct

---

## B5 — Coin page — graduated token
**Steps**:
1. Find a graduated token (ask the Lead for one, or use one from Tester A's A7 test)
2. Go to its coin page

**Verify**:
- The page shows a "Graduated" badge or indicator
- The trade panel shows AMM trading (not bonding curve)
- Price and market cap display correctly
- Trade history shows trades (may include both curve and AMM trades)
- The token still appears on the home/explore pages
- No console errors

**Pass criteria**: graduated token page displays correctly with AMM trading

---

## B6 — Leaderboard (`/leaderboard`)
**Steps**:
1. Go to `/leaderboard`
2. Look at the list of top tokens

**Verify**:
- Page loads with a ranked list
- Ranking makes sense (by volume, market cap, or whatever the sort criteria is)
- Values are correct (not 1e6× off)
- Clicking a token goes to its coin page
- If there are tabs/filters (e.g., "Top Gainers", "Most Volume"), they work
- No console errors

**Pass criteria**: leaderboard loads, ranking correct, navigation works

---

## B7 — Auth flow (SIWE login)
**Steps**:
1. Find the login button in the navbar
2. Click it — should prompt a wallet signature (Sign-In with Ethereum)
3. Sign the message in your wallet
4. Verify you're now logged in (navbar shows your address or a profile indicator)
5. Refresh the page — verify you stay logged in
6. Log out (find the logout button)
7. Verify you're logged out

**Verify**:
- Login button is visible
- Wallet signature prompt appears
- After signing, you're logged in
- Login persists across page refresh
- Logout works
- No console errors

**Pass criteria**: full auth cycle works (login, persist, logout)

---

## B8 — Favorites / Watchlist
**Steps**:
1. Log in (see B7)
2. Go to any token's coin page
3. Click the Favorite button (heart icon)
4. Go to `/watchlist`
5. Verify the token you favorited appears there
6. Go back to the token, unfavorite it
7. Go back to `/watchlist` — verify it's removed
8. Try going to `/watchlist` while logged out — should redirect to login or show a prompt

**Verify**:
- Favorite button toggles (filled heart when favorited)
- Watchlist page shows favorited tokens
- Removing a favorite updates the watchlist
- Watchlist requires auth (redirects or prompts if logged out)
- No console errors

**Pass criteria**: favorites CRUD works, watchlist reflects changes, auth required

---

## B9 — Token chat
**Steps**:
1. Log in
2. Go to any token's coin page
3. Find the chat section
4. Type a message and send it
5. Verify your message appears in the chat
6. Send a few more messages
7. Refresh the page — verify messages persist

**Verify**:
- Chat input is visible (when logged in)
- Messages send and appear immediately
- Messages persist after refresh
- Messages show your address/username and timestamp
- If someone else sends a message (coordinate with Tester A), it appears in real-time

**Edge cases**:
- Try sending an empty message — should be blocked
- Try sending a very long message — should be blocked or truncated (with a clear limit)
- Try sending while logged out — should prompt to log in

**Pass criteria**: chat works, messages persist, real-time, edge cases handled

---

## B10 — Profile page (`/profile/[wallet]`)
**Steps**:
1. Log in
2. Go to your profile (click your address in the navbar, or navigate to `/profile/<your-wallet-address>`)
3. Check what's displayed

**Verify**:
- Page loads
- Your wallet address is shown
- Your token holdings are listed (if any)
- Your trade history is shown (if any)
- Values are correct (holdings amounts, trade values — not 1e6× off)
- If you have no holdings/trades, an appropriate empty state is shown
- No console errors

**Edge cases**:
- Go to a profile with no activity (e.g., `/profile/0x0000...0001`) — should show empty state, not crash
- Go to an invalid wallet address (e.g., `/profile/notanaddress`) — should show error or 404

**Pass criteria**: profile shows correct data, empty/invalid states handled

---

## B11 — Search
**Steps**:
1. Find the search bar (in the navbar or on the explore page)
2. Search for a token by name (e.g., "Test")
3. Search by symbol (e.g., "TTA")
4. Search by full contract address (copy one from a coin page)
5. Search for something that doesn't exist (e.g., "zzznomatch")
6. Search with an empty query
7. Search with special characters (e.g., "!!!")

**Verify**:
- Search by name returns matching tokens
- Search by symbol works
- Search by contract address goes directly to that token's page (or shows it in results)
- No-match search shows an empty state ("No tokens found")
- Empty query doesn't crash
- Special characters don't crash
- No console errors

**Pass criteria**: search works for all input types, edge cases handled

---

## B12 — Fees page (`/fees`)
**Steps**:
1. Go to `/fees`

**Verify**:
- Page loads
- Fee structure is explained clearly:
  - 1% trading fee
  - 50% to creator, 50% to protocol
  - $30,000 graduation threshold
  - $8,500 LP seed on graduation
  - 5 USDC creation fee
- Values match what's in section 2 of this doc
- No console errors

**Pass criteria**: fees page loads with correct values

---

## B13 — Docs page (`/docs`)
**Steps**:
1. Go to `/docs`

**Verify**:
- Page loads
- Content is readable
- Any links on the page work
- No console errors

**Pass criteria**: docs page loads and is readable

---

## B14 — Blog page (`/blog`)
**Steps**:
1. Go to `/blog`

**Verify**:
- Page loads
- If there are blog posts, they display correctly
- If empty, an appropriate empty state shows
- No console errors

**Pass criteria**: blog page loads

---

## B15 — Legal pages
**Steps**:
1. Go to each legal page:
   - `/legal/terms`
   - `/legal/privacy-policy`
   - `/legal/dmca-policy`
   - `/legal/trademark-guidelines`
   - `/legal/tokenized-agent-disclaimer`

**Verify**:
- Each page loads
- Content is readable (legalese, but formatted properly)
- Links between legal pages work (if any)
- No console errors

**Pass criteria**: all legal pages load and are readable

---

## B16 — Agents pages
**Steps**:
1. Go to `/agents`
2. Click on an agent (if any exist) to go to `/agents/<agentId>`

**Verify**:
- Agents list page loads
- Agent detail page loads (if agents exist)
- Agent info displays correctly
- If the agent has launched tokens, they're listed
- Values are correct
- No console errors

**Pass criteria**: agents pages load and display correctly

---

## B17 — 404 and error pages
**Steps**:
1. Go to a non-existent URL (e.g., `/this-page-does-not-exist`)
2. Verify a 404 page shows (not a blank screen or crash)
3. Go to a non-existent token address (e.g., `/coin/0x0000000000000000000000000000000000000000`)
4. Verify a sensible error or empty state shows

**Verify**:
- 404 page renders with a "page not found" message and a link back home
- Invalid token address doesn't crash the app
- No unhandled console errors

**Pass criteria**: 404 and error states handled gracefully

---

## B18 — Mobile responsive
**Steps**:
1. Open the site on your phone (or resize your browser window to mobile width — ~375px)
2. Go through every page:
   - Home
   - Explore
   - Launch
   - Coin page
   - Leaderboard
   - Watchlist
   - Profile
   - Agents

**Verify**:
- Every page is usable on mobile (no horizontal scrolling, no overlapping elements)
- Navbar collapses to a mobile menu (hamburger icon) if needed
- Trade panel is usable on mobile (buttons are tappable, inputs are usable)
- Token grid stacks vertically on mobile
- Text is readable without zooming
- No console errors

**Pass criteria**: all pages usable on mobile, no layout breakage

---

## B19 — USDC formatting check (every page)
**This is the #1 bug source. Check every USDC value on every page.**

**Steps**:
1. Go through every page and look at every USDC value displayed
2. For each value, ask: "Does this number make sense?"

**What to look for**:
| Page | Value | Should be | Bug if it shows |
|---|---|---|---|
| Home | Token market cap | ~$4,000–$30,000 | $4,000,000,000 or $0 |
| Home | Token volume | reasonable $ amount | $0 for an active token |
| Coin | Market cap | reasonable | 1e6× too big |
| Coin | Price | small (e.g., $0.004) | $4,000,000 |
| Coin | Curve USDC | reasonable | 1e6× off |
| Coin | Creator fees | small $ amount | 1e6× off |
| Coin | Protocol fees | small $ amount | 1e6× off |
| Navbar | Your balance | your actual balance | $0 when you have USDC |
| Profile | Holdings value | reasonable | 1e6× off |
| Profile | Trade history amounts | reasonable | 1e6× off |
| Fees page | Creation fee | $5 | $0.000005 |
| Fees page | Graduation threshold | $30,000 | $30,000,000,000 |
| Fees page | LP seed | $8,500 | $8,500,000,000 |

**If any value is 1,000,000× or 1,000,000,000,000× too big, or shows $0 when it shouldn't, log it.**

**Pass criteria**: every USDC value on every page is correct

---

## B20 — Browser shields / adblocker
**Many users run adblockers. Test with one enabled.**

**Steps**:
1. Install uBlock Origin or enable your browser's built-in shields (Brave Shields, Chrome's adblocker)
2. Reload the site
3. Check if your wallet balance still loads (not $0)
4. Try to buy a token — does it work?
5. Check the console for failed requests

**Verify**:
- Balance loads correctly even with adblocker (the same-origin RPC proxy should handle this)
- Trades work
- If something fails, the error is clear (not a silent hang)
- No silent failures (balance $0, quotes not loading, receipts not confirming)

**Pass criteria**: site works with adblocker, no silent failures

---

## B21 — Multiple tabs / windows
**Steps**:
1. Open the site in 3+ tabs simultaneously
2. In each tab, navigate to a different token
3. Perform a trade in one tab
4. Check if the other tabs update

**Verify**:
- Multiple tabs work independently
- No conflicts or errors from multiple tabs
- Real-time updates flow to all tabs (see A9)

**Pass criteria**: multiple tabs work without conflicts

---

## B22 — Navbar and footer
**Steps**:
1. Click every link in the navbar — verify each goes to the right page
2. Click every link in the footer — verify each goes to the right page
3. Check the navbar on mobile (hamburger menu if present)

**Verify**:
- All navbar links work
- All footer links work
- Mobile navbar works
- No broken links (404s where there shouldn't be)
- No console errors

**Pass criteria**: all navigation links work on desktop and mobile

---

## B23 — Token image display
**Steps**:
1. Go through tokens on the home page, explore page, and coin pages
2. Check that token images load correctly

**Verify**:
- Images load (no broken image placeholders)
- Images are appropriately sized (not stretched or squished)
- Tokens without images show a placeholder (initial letter, default icon)
- No console errors for failed image loads

**Pass criteria**: all token images display correctly with fallbacks

---

## 4. Findings log

Append findings here as you find them. Number sequentially (F1, F2, ...). Don't delete — even fixed ones stay for the record.

<!-- Example:
### F1 — Market cap shows $4,000,000,000 instead of $4,000 on home page
- Severity: High
- Found by: B
- Date: 2026-07-25
- Scenario: B19-formatting
- Repro:
  1. Go to home page
  2. Look at any token's market cap
- Expected: ~$4,000
- Actual: $4,000,000,000
- Evidence: screenshot home-page-mc-bug.png
- Status: Open
-->

(no findings yet)
