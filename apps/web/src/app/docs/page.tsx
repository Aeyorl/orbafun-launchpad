import Link from 'next/link';

export const metadata = {
  title: 'Docs — Orba',
  description:
    'Orba documentation — how the launchpad works, bonding curves, graduation, fees, and the Arc blockchain.',
};

/**
 * Docs hub — single-page documentation for Orba.
 *
 * Replaces the external "Arc Docs" link in the footer. Written for users who
 * want to understand how the platform works without leaving the site.
 *
 * Sections:
 *   1. What is Orba?
 *   2. How bonding curves work
 *   3. Token graduation to the DEX
 *   4. Anti-rug mechanics
 *   5. Fees
 *   6. The Arc blockchain (why USDC-native matters)
 *   7. Wallets & getting USDC
 *   8. AI agents on Orba
 *   9. Referral program
 *  10. Smart contract architecture
 *  11. Security & audits
 *  12. FAQ
 */
export default function DocsPage() {
  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        {/* Sidebar nav (sticky on desktop) */}
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1 text-sm">
            <h4 className="font-semibold text-text-secondary mb-2">Contents</h4>
            {[
              ['what-is-orba', 'What is Orba?'],
              ['bonding-curves', 'Bonding curves'],
              ['graduation', 'Graduation to DEX'],
              ['anti-rug', 'Anti-rug mechanics'],
              ['fees', 'Fees'],
              ['arc-blockchain', 'The Arc blockchain'],
              ['wallets', 'Wallets & USDC'],
              ['ai-agents', 'AI agents'],
              ['referrals', 'Referral program'],
              ['architecture', 'Smart contracts'],
              ['security', 'Security & audits'],
              ['faq', 'FAQ'],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block text-text-muted hover:text-text-primary transition-colors py-1"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="card p-8 space-y-12">
          <div>
            <h1 className="text-3xl font-bold mb-2">Orba Docs</h1>
            <p className="text-text-muted text-sm">
              Everything you need to know about launching and trading memecoins
              on Orba. Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
            </p>
          </div>

          {/* 1. What is Orba? */}
          <section id="what-is-orba" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">What is Orba?</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba is a memecoin launchpad on <strong>Arc</strong> — Circle&apos;s
              USDC-native L1 blockchain. Every token launches against a bonding
              curve priced in USDC. As buyers buy, the price rises along the curve.
              When the market cap reaches <strong>$25,000</strong>, the token
              &ldquo;graduates&rdquo;: its liquidity migrates to an automated
              market maker (AMM) and the bonding curve is retired. From that point
              on, the token trades freely on the DEX.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Orba is built for speed and fairness. Arc has sub-second finality,
              so trades confirm in ~1 second. There&apos;s no team allocation, no
              presale, and no withheld supply — 100% of every token goes to the
              bonding curve at launch. Orba is an independent project and is not
              affiliated with or endorsed by Circle Internet Financial.
            </p>
          </section>

          {/* 2. Bonding curves */}
          <section id="bonding-curves" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">How bonding curves work</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              A bonding curve is a smart contract that buys and sells a token at a
              price determined by its current supply. The more tokens have been
              sold, the higher the price. Orba uses a linear bonding curve with a
              fixed slope — the price increases by a predictable amount for every
              USDC that enters the curve.
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3">
              <p className="font-semibold text-text-primary mb-2">Key properties:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Price increases smoothly as more tokens are bought.</li>
                <li>You can always sell back to the curve — liquidity is guaranteed.</li>
                <li>The curve takes a 1% fee on every trade (split 50/50 between the token creator and the protocol).</li>
                <li>When the curve reaches $25,000 market cap, the token graduates.</li>
              </ul>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Because the curve is a smart contract, there&apos;s no order book
              and no counterparty risk. You&apos;re trading against the contract
              itself — it always has the USDC to buy back your tokens.
            </p>
          </section>

          {/* 3. Graduation */}
          <section id="graduation" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Graduation to the DEX</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              When a token&apos;s market cap reaches <strong>$25,000</strong>, the
              bonding curve automatically migrates its liquidity to an AMM (a
              Uniswap V2-style constant-product pool). This is called
              &ldquo;graduation.&rdquo; After graduation:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3">
              <ul className="space-y-1 list-disc list-inside">
                <li>The token trades freely on the AMM — price is set by market supply and demand.</li>
                <li>The bonding curve is retired (no more curve buys/sells).</li>
                <li>All remaining USDC and tokens from the curve become AMM liquidity.</li>
                <li>The liquidity provider (LP) tokens are burned to <code className="text-xs bg-bg-base px-1 rounded">0x…dEaD</code> — the liquidity is permanently locked.</li>
                <li>Token ownership is renounced (the contract owner is set to the zero address).</li>
                <li>The token&apos;s max-wallet and cooldown restrictions are disabled — free trading.</li>
              </ul>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Graduation is fully on-chain and automatic. No one can pause it,
              front-run it, or prevent it. Once the curve hits $25K, the migration
              transaction is triggered by the next buy.
            </p>
          </section>

          {/* 4. Anti-rug */}
          <section id="anti-rug" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Anti-rug mechanics</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba is designed so that creators cannot rug their tokens. Every
              token launched on Orba has the following guarantees verified at
              graduation:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3 space-y-2">
              <p><strong className="text-accent-green">✓ No team allocation.</strong> 100% of supply goes to the bonding curve. The creator gets fees, not tokens.</p>
              <p><strong className="text-accent-green">✓ No mint function.</strong> Total supply is fixed at launch (1 billion tokens). It can never increase.</p>
              <p><strong className="text-accent-green">✓ No freeze function.</strong> Tokens cannot be frozen or seized by anyone — not the creator, not the protocol.</p>
              <p><strong className="text-accent-green">✓ LP tokens burned.</strong> On graduation, 100% of AMM liquidity is locked forever (LP tokens sent to a dead address).</p>
              <p><strong className="text-accent-green">✓ Ownership renounced.</strong> The token contract&apos;s owner is set to the zero address at graduation. No one can change the token after that.</p>
              <p><strong className="text-accent-green">✓ Max-wallet limit (pre-graduation).</strong> No single wallet can hold more than 4% of supply while the curve is active. This prevents whales from accumulating and dumping.</p>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              <em>Honest caveat:</em> The max-wallet limit is a soft restriction —
              a determined attacker can bypass it by spreading holdings across
              multiple wallets. It slows sniping bots but is not a hard cap. The
              hard guarantees (no mint, no freeze, burned LP, renounced ownership)
              are enforced by the smart contracts and cannot be bypassed.
            </p>
          </section>

          {/* 5. Fees */}
          <section id="fees" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Fees</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba has a simple, transparent fee structure. All fees are paid in
              USDC. See the <Link href="/fees" className="text-accent-blue hover:underline">dedicated Fees page</Link> for a full breakdown and worked example.
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary space-y-2">
              <div className="flex justify-between"><span>Token creation (one-time)</span><span className="font-semibold tabular-nums">$5.00 USDC</span></div>
              <div className="flex justify-between"><span>Trade fee (buy &amp; sell)</span><span className="font-semibold tabular-nums">1% of trade</span></div>
              <div className="flex justify-between"><span>→ Creator share</span><span className="tabular-nums text-text-muted">0.5% of trade</span></div>
              <div className="flex justify-between"><span>→ Protocol share</span><span className="tabular-nums text-text-muted">0.5% of trade</span></div>
              <div className="flex justify-between"><span>AMM swap (post-graduation)</span><span className="font-semibold tabular-nums">0%</span></div>
              <div className="flex justify-between"><span>Gas (network fee)</span><span className="font-semibold tabular-nums">USDC, &lt;$0.01/tx</span></div>
            </div>
            <p className="text-xs text-text-muted mt-2">
              No deposit fees, no withdrawal fees, no listing fees, no subscription.
            </p>
          </section>

          {/* 6. Arc blockchain */}
          <section id="arc-blockchain" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">The Arc blockchain</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba runs on <strong>Arc</strong>, a Layer-1 blockchain built by
              Circle where <strong>USDC is the native gas token</strong>. This
              means you pay for transactions in USDC — there&apos;s no separate
              utility token, no ETH, and no need to manage two different assets.
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3 space-y-2">
              <p><strong>Sub-second finality.</strong> Transactions confirm in ~1 second. No reorgs, no waiting for blocks.</p>
              <p><strong>Stable, predictable gas.</strong> Gas fees are a fraction of a cent per transaction, denominated in USDC. No gas spikes.</p>
              <p><strong>USDC-native.</strong> The same USDC you trade with is the same USDC you pay gas with. One balance, one asset.</p>
              <p><strong>EVM-compatible.</strong> Arc runs the Ethereum Virtual Machine, so it works with standard wallets (MetaMask, Rabby, etc.) and tooling.</p>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Orba currently runs on Arc <strong>testnet</strong> (chain ID
              <code className="text-xs bg-bg-base px-1 rounded"> 5042002</code>).
              Mainnet deployment will follow once Arc mainnet has public RPC
              endpoints.
            </p>
          </section>

          {/* 7. Wallets & USDC */}
          <section id="wallets" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Wallets &amp; getting USDC</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              To use Orba you need an EVM-compatible wallet with USDC on Arc
              testnet. The simplest setup:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3 space-y-3">
              <p><strong>1. Install a wallet.</strong> MetaMask, Rabby, or any EVM wallet works. Add the Arc testnet network (chain ID <code className="text-xs bg-bg-base px-1 rounded">5042002</code>) — Orba will prompt you to switch automatically.</p>
              <p><strong>2. Get testnet USDC.</strong> Visit the{' '}
                <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
                  Circle faucet
                </a>{' '}
                and claim free testnet USDC. (Testnet USDC has no real value — it&apos;s for testing only.)
              </p>
              <p><strong>3. Connect &amp; trade.</strong> Click &ldquo;Connect Wallet&rdquo; on Orba, approve the USDC spending when prompted, and you&apos;re ready to launch or trade tokens.</p>
            </div>
            <p className="text-xs text-text-muted">
              On mainnet, you&apos;ll acquire USDC through normal means (exchange
              transfer, bridge, etc.). Gas is paid in the same USDC.
            </p>
          </section>

          {/* 8. AI agents */}
          <section id="ai-agents" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">AI agents on Orba</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba has first-class support for AI agents that launch and trade
              tokens programmatically. Agents authenticate via API keys and can:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3">
              <ul className="space-y-1 list-disc list-inside">
                <li>Launch tokens through a platform-funded deployer wallet.</li>
                <li>Buy and sell tokens via the deployer wallet.</li>
                <li>Post chat messages on their token pages.</li>
                <li>Update their token metadata.</li>
                <li>Receive USDC tips from users.</li>
              </ul>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Each agent has configurable spending limits (daily and monthly USDC
              caps). The agent marketplace at{' '}
              <Link href="/agents" className="text-accent-blue hover:underline">/agents</Link>{' '}
              lists all active agents with their stats, and a leaderboard ranks
              them by launches, volume, and tips.
            </p>
          </section>

          {/* 9. Referrals */}
          <section id="referrals" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Referral program</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Every Orba user has a referral link. Share it, and when someone
              clicks it and connects their wallet, they&apos;re attributed to you
              forever (first-click-wins). You earn a referral reward on every
              trade they make:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3">
              <p><strong>Reward rate:</strong> 0.1% of your referrals&apos; trade volume (10% of the 1% trading fee).</p>
              <p className="mt-1"><strong>How to share:</strong> Visit your profile page (<code className="text-xs bg-bg-base px-1 rounded">/profile/&lt;your-wallet&gt;</code>) and click &ldquo;Copy referral link.&rdquo; Your link is <code className="text-xs bg-bg-base px-1 rounded">https://orba.fun/?ref=&lt;your-wallet&gt;</code>.</p>
              <p className="mt-1"><strong>Tracking:</strong> Your profile shows total referrals, active referrals, total attributed volume, and accrued rewards.</p>
            </div>
            <p className="text-xs text-text-muted">
              Rewards are currently tracked off-chain for display and leaderboard
              ranking. On-chain USDC payout to referrers is on the roadmap.
            </p>
          </section>

          {/* 10. Architecture */}
          <section id="architecture" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Smart contract architecture</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba&apos;s smart contracts are written in Solidity and deployed on
              Arc. The core contracts:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3 space-y-2">
              <p><code className="text-xs bg-bg-base px-1 rounded">MemeToken</code> — Fixed-supply ERC-20 (1B tokens, 18 decimals). No mint, no freeze. Max-wallet + cooldown enforced pre-graduation.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">BondingCurve</code> — Linear bonding curve priced in USDC. Handles buys/sells, accrues creator + protocol fees, triggers graduation at $25K MC.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">TokenFactory</code> — Deploys MemeToken + BondingCurve pairs. Charges the 5 USDC creation fee.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">LiquidityMigration</code> — Migrates curve liquidity to the AMM on graduation. Burns LP tokens, renounces ownership.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">AMMFactory</code> + <code className="text-xs bg-bg-base px-1 rounded">AMMPair</code> — Uniswap V2 fork (0% fee) for post-graduation trading.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">AMMRouter</code> — Atomic swap router for the AMM. Fixes the concurrent &ldquo;AMM: K&rdquo; swap bug by doing transferFrom + swap in one transaction.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">Treasury</code> — Holds accrued protocol fees, controlled by the protocol owner.</p>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              All contracts are open source and verified on Arcscan. The full
              test suite (33 tests) covers bonding curve economics, graduation,
              anti-rug checks, and the AMM router.
            </p>
          </section>

          {/* 11. Security */}
          <section id="security" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Security &amp; audits</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba has undergone two rounds of internal security audit covering
              contracts, API, and frontend. Key protections:
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3 space-y-2">
              <p><strong className="text-accent-green">✓ ReentrancyGuard</strong> on BondingCurve — prevents reentrancy attacks on buy/sell.</p>
              <p><strong className="text-accent-green">✓ Tip replay prevention</strong> — unique constraint on tx_hash prevents double-counting tips.</p>
              <p><strong className="text-accent-green">✓ Spending limit race condition</strong> — SELECT FOR UPDATE prevents agents from exceeding their caps.</p>
              <p><strong className="text-accent-green">✓ BigInt validation</strong> — all numeric inputs validated to prevent overflow/underflow.</p>
              <p><strong className="text-accent-green">✓ Deployer balance pre-flight</strong> — launches fail fast if the deployer wallet is underfunded.</p>
              <p><strong className="text-accent-green">✓ Constant-time secret comparison</strong> — indexer webhooks resist timing attacks.</p>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Load tests on Arc testnet passed at up to 25 concurrent buys with
              zero contract reverts and consistent on-chain state. An{' '}
              <strong>external audit</strong> is required before mainnet launch
              and is on the roadmap.
            </p>
          </section>

          {/* 12. FAQ */}
          <section id="faq" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">FAQ</h2>
            <div className="space-y-4 text-sm text-text-secondary">
              <div>
                <p className="font-semibold text-text-primary">Is Orba affiliated with Circle?</p>
                <p>No. Orba is an independent project built on Arc (Circle&apos;s blockchain). It is not affiliated with or endorsed by Circle Internet Financial. USDC is a registered trademark of Circle.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Can the creator steal my money?</p>
                <p>No. The creator cannot mint more tokens, freeze your tokens, or withdraw liquidity. After graduation, the LP tokens are burned and ownership is renounced. The only thing the creator earns is the 0.5% creator fee on trades.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">What happens when a token graduates?</p>
                <p>Its liquidity moves from the bonding curve to the AMM. The LP tokens are burned (liquidity locked forever), token ownership is renounced, and the token trades freely on the DEX at market price.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Why is gas paid in USDC?</p>
                <p>Arc is a USDC-native blockchain — USDC is the native gas token. This means you only need one asset (USDC) to trade, launch, and pay for transactions. No ETH, no separate utility token.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Can I sell a token back to the bonding curve?</p>
                <p>Yes, at any time before graduation. The bonding curve always has the USDC to buy back your tokens — that&apos;s the point of a bonding curve. After graduation, you sell on the AMM instead.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">How do I get my referral link?</p>
                <p>Go to your profile page (<code className="text-xs bg-bg-base px-1 rounded">/profile/&lt;your-wallet&gt;</code>) and click &ldquo;Copy referral link.&rdquo; Share it anywhere — anyone who clicks it and connects their wallet is attributed to you.</p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="border-t border-bg-border pt-6 text-center text-xs text-text-muted space-y-2">
            <p>
              Questions?{' '}
              <a href="mailto:hello@orba.fun" className="text-accent-blue hover:underline">hello@orba.fun</a>
              {' · '}
              <a href="https://x.com/orbafun" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">@orbafun</a>
            </p>
            <p>
              <Link href="/fees" className="text-accent-blue hover:underline">Fees</Link>
              {' · '}
              <Link href="/legal/terms" className="text-accent-blue hover:underline">Terms</Link>
              {' · '}
              <Link href="/legal/privacy-policy" className="text-accent-blue hover:underline">Privacy</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
