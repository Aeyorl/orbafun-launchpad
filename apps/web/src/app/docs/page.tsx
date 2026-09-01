import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PUBLIC_PROTOCOL_FACTS as facts,
  formatBps,
  shareOfTradePercent,
} from '@/content/public-protocol-facts';

export const metadata: Metadata = {
  title: 'Docs — Orba',
  description:
    'Mainnet draft documentation for Orba token launches, constant-product bonding curves, graduation, fees, referrals, and protocol safeguards.',
  alternates: { canonical: '/docs' },
};

const number = new Intl.NumberFormat('en-US');

export default function DocsPage() {
  const tradeFee = formatBps(facts.bondingCurveTradeFeeBps);
  const creatorFee = shareOfTradePercent(
    facts.bondingCurveTradeFeeBps,
    facts.creatorShareOfTradeFeeBps,
  );

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1 text-sm" aria-label="Documentation contents">
            <h2 className="font-semibold text-text-secondary mb-2 text-sm">Contents</h2>
            {[
              ['what-is-orba', 'What is Orba?'],
              ['bonding-curves', 'Bonding curves'],
              ['graduation', 'Graduation to AMM'],
              ['anti-rug', 'Safeguards & limits'],
              ['fees', 'Fees'],
              ['arc-blockchain', 'The Arc blockchain'],
              ['wallets', 'Wallets & USDC'],
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

        <div className="card p-8 space-y-12">
          <header>
            <h1 className="text-3xl font-bold mb-2">Orba Docs</h1>
            <p className="text-text-muted text-sm">
              How Orba&apos;s target mainnet release works, what users control,
              and which facts still require release verification.
            </p>
            <p className="mt-4 bg-bg-input rounded-lg p-4 text-sm text-text-secondary">
              <strong className="text-text-primary">{facts.publicationLabel}.</strong>{' '}
              Contract addresses, parameters, ownership, verified source, and external-audit
              status must be checked against the final deployment before publication.
            </p>
          </header>

          <section id="what-is-orba" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">What is Orba?</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba is a token launch and discovery application built for Arc, a
              USDC-native EVM network. A newly launched token begins on an Orba
              bonding curve priced in USDC. Users can buy from and sell to that
              curve until the token reaches its graduation condition. The
              graduation process then moves eligible liquidity into Orba&apos;s
              automated market maker (AMM), and curve trading ends.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              The target token model has a fixed supply of {number.format(facts.tokenSupply)},
              no team allocation, no later mint function, and no per-wallet holding cap.
              Orba is independent and is not affiliated with or endorsed by Circle.
            </p>
          </section>

          <section id="bonding-curves" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">How the bonding curve works</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba uses a constant-product curve with virtual reserves, not a linear
              price schedule. As USDC enters the curve, the remaining token reserve
              falls and the marginal price rises. A sell moves the state in the
              opposite direction. Quotes depend on the current reserve state and can
              change before a transaction confirms.
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-3">
              <p className="font-semibold text-text-primary mb-2">What that means in practice</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Larger trades move the price more than smaller trades.</li>
                <li>Displayed quotes are estimates until the transaction executes.</li>
                <li>Caller-supplied minimum output protects buys and sells from excess slippage.</li>
                <li>The target curve fee is {tradeFee} on both buys and sells.</li>
              </ul>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Selling remains subject to contract state, available curve liquidity,
              slippage protection, network conditions, and successful token approval.
              Orba does not guarantee a particular price or execution time.
            </p>
          </section>

          <section id="graduation" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Graduation to the AMM</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              The target release graduates a curve at a market capitalization of{' '}
              <strong>{number.format(facts.graduationMarketCapUsdc)} USDC</strong>.
              Graduation retires curve trading, creates or funds the token&apos;s AMM
              pair, and allocates the configured liquidity seed. The target seed is{' '}
              <strong>{number.format(facts.liquiditySeedUsdc)} USDC</strong>, but the
              final deployed contracts are authoritative.
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary space-y-2">
              <p>After a successful graduation:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>the bonding curve no longer accepts buys or sells;</li>
                <li>the token trades through the AMM at pool-determined prices;</li>
                <li>liquidity-provider tokens are intended to be burned to the configured dead address;</li>
                <li>token ownership is intended to be renounced; and</li>
                <li>the pre-graduation transfer cooldown is disabled.</li>
              </ul>
            </div>
          </section>

          <section id="anti-rug" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Protocol safeguards and limits</h2>
            <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
              <p><strong className="text-text-primary">Fixed supply.</strong> The target token has {number.format(facts.tokenSupply)} units, all created at launch, with no later mint function.</p>
              <p><strong className="text-text-primary">No creator allocation.</strong> Supply starts on the bonding curve rather than in a creator wallet. A creator can still buy like any other participant and can earn the disclosed creator-fee share.</p>
              <p><strong className="text-text-primary">Uncapped holdings.</strong> New tokens do not enforce the former 4% max-wallet rule. One person may also control multiple wallets, so wallet caps would not be reliable identity controls.</p>
              <p><strong className="text-text-primary">Transfer cooldown.</strong> Before graduation, ordinary wallet-to-wallet transfers are separated by approximately {facts.transferCooldownBlocks} Arc blocks. Curve buys and sells remain usable. This slows some automated transfer patterns but does not prevent bots or manipulation.</p>
              <p><strong className="text-text-primary">Slippage minimums and bounded approvals.</strong> Trades enforce a minimum output supplied by the user. The Orba interface targets exact or bounded token approvals, but users must still review every wallet request.</p>
              <p><strong className="text-text-primary">Graduation controls.</strong> The release candidate intends to burn LP tokens and renounce token ownership after migration. These protections must be verified from final mainnet transactions and bytecode.</p>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed mt-3">
              These controls reduce specific creator and execution risks; they do not
              prevent market loss, compromised wallets, contract defects, misleading
              content, MEV, or protocol-administration risk.
            </p>
          </section>

          <section id="fees" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Fees and costs</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Target parameters are summarized below. See the <Link href="/fees" className="text-accent-blue hover:underline">Fees page</Link> for calculations and important distinctions between fees, gas, approvals, slippage, and price impact.
            </p>
            <div className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary space-y-2 tabular-nums">
              <div className="flex justify-between gap-4"><span>Token creation</span><span className="font-semibold">{facts.creationFeeUsdc} USDC</span></div>
              <div className="flex justify-between gap-4"><span>Bonding-curve buy or sell</span><span className="font-semibold">{tradeFee}</span></div>
              <div className="flex justify-between gap-4"><span>Creator share</span><span className="font-semibold">{creatorFee} of trade</span></div>
              <div className="flex justify-between gap-4"><span>Post-graduation AMM swap</span><span className="font-semibold">{formatBps(facts.ammSwapFeeBps)} retained in pool reserves</span></div>
              <div className="flex justify-between gap-4"><span>Arc network gas</span><span className="font-semibold">variable, paid in native USDC</span></div>
            </div>
          </section>

          <section id="arc-blockchain" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">The Arc blockchain</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Arc is an EVM-compatible network that uses USDC as its native gas asset.
              Orba also interacts with Arc&apos;s six-decimal ERC-20 representation of
              USDC for contract accounting. They represent the same asset at different
              decimal precisions, so interface and contract amounts must not be mixed.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              The planned mainnet network identifier is chain ID 5042. The final RPC
              endpoints, explorer, USDC address, and Orba contract addresses will be
              published only after deployment verification.
            </p>
          </section>

          <section id="wallets" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Wallets and USDC</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-text-secondary leading-relaxed">
              <li>Use a supported self-custody EVM wallet and verify that it is connected to the official Arc mainnet configuration.</li>
              <li>Hold enough native USDC for network gas and enough ERC-20 USDC for the intended launch or trade.</li>
              <li>Verify the Orba domain, contract, amount, recipient, quote, slippage, and approval before signing.</li>
              <li>Keep your seed phrase and private key offline and never enter them into Orba.</li>
            </ol>
            <p className="text-sm text-text-secondary leading-relaxed mt-3">
              Wallet balances, quotes, and receipts depend on wallets and RPC providers.
              A delayed interface does not by itself mean a transaction failed; confirm
              the transaction with the official explorer before retrying.
            </p>
          </section>

          <section id="referrals" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Referral program</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              A referral link can attribute a wallet to a referrer on a first-valid-
              attribution basis. Orba records attributed trade count, volume, and a
              target reward accrual of {formatBps(facts.referralAccrualBps)} of eligible
              bonding-curve volume.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Referral amounts are off-chain accounting records. They are not an
              on-chain balance or guarantee of payment. No payout is available unless
              Orba separately launches a claim or distribution process with published
              eligibility and verification rules. Self-referrals and manipulated volume
              may be rejected.
            </p>
          </section>

          <section id="architecture" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Smart-contract architecture</h2>
            <div className="space-y-2 text-sm text-text-secondary leading-relaxed mb-3">
              <p><code className="text-xs bg-bg-base px-1 rounded">MemeToken</code> creates the fixed supply and applies the pre-graduation transfer cooldown.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">BondingCurve</code> holds token inventory, quotes constant-product trades, enforces slippage minimums, and accrues fees.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">TokenFactory</code> deploys token and curve pairs and charges the configurable creation fee.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">LiquidityMigration</code> moves eligible curve liquidity to the AMM and completes graduation safeguards.</p>
              <p><code className="text-xs bg-bg-base px-1 rounded">AMMFactory</code>, <code className="text-xs bg-bg-base px-1 rounded">AMMPair</code>, and <code className="text-xs bg-bg-base px-1 rounded">AMMRouter</code> support post-graduation liquidity and atomic swaps.</p>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Mainnet addresses, owner and guardian roles, compiler settings, source-
              verification links, and deployed-bytecode evidence must be added or checked
              after deployment. This draft does not claim that mainnet contracts are deployed.
            </p>
          </section>

          <section id="security" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">Security and audit status</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-3">
              Orba has performed internal pre-audit reviews and local or Arc-testnet
              testing across contracts, APIs, indexing, wallet flows, agent limits, and
              graduation mechanics. Those activities help find defects but are not an
              independent security audit and do not prove that the system is secure.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Mainnet publication remains blocked on an independent external audit,
              remediation and retesting, final deployed-bytecode verification, confirmed
              multisig or Safe ownership, production RPC and monitoring readiness, and a
              bounded launch canary. Security findings and final audit references should
              be published only when the underlying evidence exists.
            </p>
          </section>

          <section id="faq" className="scroll-mt-20">
            <h2 className="text-xl font-bold mb-3">FAQ</h2>
            <div className="space-y-4 text-sm text-text-secondary">
              <div><h3 className="font-semibold text-text-primary">Is Orba affiliated with Circle?</h3><p>No. Orba is an independent project. Arc, Circle, and USDC references identify third-party technology and assets; they do not imply sponsorship or endorsement.</p></div>
              <div><h3 className="font-semibold text-text-primary">Can one wallet hold more than 4%?</h3><p>Yes. The target uncapped token model has no per-wallet holding limit. Fixed supply, transfer cooldown, slippage minimums, bounded approvals, and agent-wallet limits address different risks and remain separate controls.</p></div>
              <div><h3 className="font-semibold text-text-primary">Can a creator remove graduation liquidity?</h3><p>The target migration burns LP tokens and renounces token ownership. Verify those actions on-chain for the specific token. These safeguards do not eliminate price, contract, wallet, content, or protocol-administration risk.</p></div>
              <div><h3 className="font-semibold text-text-primary">Are referral rewards withdrawable?</h3><p>Not by default. The displayed amount is an off-chain accrual until Orba announces and enables a separate payout process.</p></div>
              <div><h3 className="font-semibold text-text-primary">Has Orba passed an external audit?</h3><p>Not yet. Internal reviews and testnet evidence are pre-audit work. An independent external audit remains a mainnet release gate.</p></div>
            </div>
          </section>

          <div className="border-t border-bg-border pt-6 text-center text-xs text-text-muted space-y-2">
            <p>Questions? <a href="mailto:hello@orba.fun" className="text-accent-blue hover:underline">hello@orba.fun</a></p>
            <p>
              <Link href="/fees" className="text-accent-blue hover:underline">Fees</Link>{' · '}
              <Link href="/legal/terms" className="text-accent-blue hover:underline">Terms</Link>{' · '}
              <Link href="/legal/privacy-policy" className="text-accent-blue hover:underline">Privacy</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
