import { formatUsdDirect } from '@/lib/utils';
import Link from 'next/link';

export const metadata = {
  title: 'Fees — Orba',
  description:
    'Orba fee structure — token creation, trading fees, gas, and referral rewards. All fees paid in USDC. No hidden fees.',
};

const CREATION_FEE = 5; // USDC
const TRADE_FEE_PCT = 1; // 1% of trade
const CREATOR_SHARE_PCT = 50; // 50% of trade fee
const PROTOCOL_SHARE_PCT = 50; // 50% of trade fee
const REFERRAL_REWARD_BPS = 10; // 0.1% of volume
const GRADUATION_MC = 30_000;

export default function FeesPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-2">Fees</h1>
        <p className="text-text-muted text-sm mb-6">
          Orba has a simple, transparent fee structure. All fees are paid in USDC
          — the native gas token on Arc. There are no hidden fees, no subscriptions,
          and no charges for graduation.
        </p>

        {/* Quick summary table */}
        <div className="bg-bg-input rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3 text-text-secondary">Quick summary</h2>
          <div className="text-sm space-y-2 tabular-nums">
            <div className="flex justify-between border-b border-bg-border pb-2">
              <span className="text-text-muted">Token creation (one-time)</span>
              <span className="font-semibold">{formatUsdDirect(CREATION_FEE)}</span>
            </div>
            <div className="flex justify-between border-b border-bg-border pb-2">
              <span className="text-text-muted">Trade fee (buy &amp; sell, bonding curve)</span>
              <span className="font-semibold">{TRADE_FEE_PCT}% of trade</span>
            </div>
            <div className="flex justify-between border-b border-bg-border pb-2">
              <span className="text-text-muted">AMM swap (post-graduation)</span>
              <span className="font-semibold">0%</span>
            </div>
            <div className="flex justify-between border-b border-bg-border pb-2">
              <span className="text-text-muted">Referral reward</span>
              <span className="font-semibold">0.1% of referral volume</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Gas (network fee)</span>
              <span className="font-semibold">&lt; $0.01 / tx (USDC)</span>
            </div>
          </div>
        </div>

        {/* Creation fee */}
        <div className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-lg">Token Creation Fee</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              {formatUsdDirect(CREATION_FEE)}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            A one-time fee charged when launching a new token. Covers deployment
            of the <code className="text-xs bg-bg-base px-1 rounded">MemeToken</code>{' '}
            and <code className="text-xs bg-bg-base px-1 rounded">BondingCurve</code>{' '}
            contracts on Arc.
          </p>
          <p className="text-sm text-text-secondary">
            Paid via USDC{' '}
            <code className="text-xs bg-bg-base px-1 rounded">transferFrom</code> —
            you&apos;ll be prompted to approve the 5 USDC spend before launch. The
            fee goes to the protocol treasury. The token creator does{' '}
            <strong>not</strong> pay for gas separately — gas is paid in the same
            USDC and is typically a fraction of a cent.
          </p>
        </div>

        {/* Trade fee */}
        <div className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-lg">Trade Fee</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              {TRADE_FEE_PCT}%
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            Applied to every buy and sell on the bonding curve. The fee is
            deducted from the trade amount before it hits the curve — so a 100
            USDC buy sends 99 USDC into the curve and 1 USDC to fees. Split
            equally between the token creator and the protocol:
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-bg-base rounded p-3">
              <div className="text-text-muted text-xs mb-1">Creator share</div>
              <div className="font-semibold tabular-nums">
                {CREATOR_SHARE_PCT}% of fee ({TRADE_FEE_PCT * CREATOR_SHARE_PCT / 100}% of trade)
              </div>
              <div className="text-xs text-text-muted mt-1">
                Accrued in the BondingCurve contract. Claimable by the token
                creator at any time via the curve&apos;s{' '}
                <code className="text-xs">claimCreatorFees</code> function.
              </div>
            </div>
            <div className="bg-bg-base rounded p-3">
              <div className="text-text-muted text-xs mb-1">Protocol share</div>
              <div className="font-semibold tabular-nums">
                {PROTOCOL_SHARE_PCT}% of fee ({TRADE_FEE_PCT * PROTOCOL_SHARE_PCT / 100}% of trade)
              </div>
              <div className="text-xs text-text-muted mt-1">
                Accrued in the BondingCurve contract. Claimable by the protocol
                owner. Funds ongoing development and operations.
              </div>
            </div>
          </div>
        </div>

        {/* AMM swap fee */}
        <div className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-lg">AMM Swap Fee (post-graduation)</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">0%</span>
          </div>
          <p className="text-sm text-text-secondary">
            After a token graduates to the AMM, swaps on the DEX are{' '}
            <strong>free</strong> — there is no swap fee. This is intentional:
            the bonding curve (not the AMM) is where fees are captured. The AMM
            exists to provide permanent, locked liquidity for graduated tokens.
            Note: you still pay Arc gas for the swap transaction, which is
            typically a fraction of a cent.
          </p>
        </div>

        {/* Referral reward */}
        <div className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-lg">Referral Reward</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              0.1%
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            When someone you referred trades on Orba, you earn{' '}
            <strong>0.1% of their trade volume</strong> (10 basis points). This
            is 10% of the 1% trading fee — the protocol shares its half of the
            fee with referrers.
          </p>
          <p className="text-sm text-text-secondary">
            Get your referral link from your{' '}
            <Link href="/profile" className="text-accent-blue hover:underline">profile page</Link>.
            Attribution is first-click-wins: the first referrer whose link a
            wallet clicks is permanently credited. See the{' '}
            <Link href="/docs#referrals" className="text-accent-blue hover:underline">docs</Link>{' '}
            for full details.
          </p>
          <p className="text-xs text-text-muted mt-2">
            Rewards are currently tracked off-chain for display and leaderboard
            ranking. On-chain USDC payout to referrers is on the roadmap.
          </p>
        </div>

        {/* Gas */}
        <div className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-lg">Gas (Network Fees)</h2>
            <span className="text-lg font-bold text-accent-green">USDC-native</span>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            On Arc, USDC is the native gas token — you pay for transactions in
            USDC, not a separate utility token. Gas fees are stable and
            predictable, typically a fraction of a cent per transaction. No ETH
            or other token required.
          </p>
          <div className="bg-bg-base rounded p-3 text-xs text-text-muted space-y-1 tabular-nums">
            <div className="flex justify-between"><span>Token launch (deploy 2 contracts)</span><span>~$0.01</span></div>
            <div className="flex justify-between"><span>Buy / sell on bonding curve</span><span>~$0.001</span></div>
            <div className="flex justify-between"><span>AMM swap</span><span>~$0.001</span></div>
            <div className="flex justify-between"><span>USDC approval (one-time per token)</span><span>~$0.001</span></div>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Gas estimates are approximate and based on Arc testnet. Actual costs
            may vary slightly with network conditions.
          </p>
        </div>

        {/* No hidden fees */}
        <div className="bg-accent-green/5 border border-accent-green/20 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-accent-green mb-2">
            No Hidden Fees
          </h3>
          <ul className="text-sm text-text-secondary space-y-1">
            <li>✓ No deposit or withdrawal fees</li>
            <li>✓ No platform listing fees</li>
            <li>✓ No subscription or membership fees</li>
            <li>✓ No fees for token graduation to the DEX</li>
            <li>✓ No fees for AMM swaps (post-graduation)</li>
            <li>✓ Slippage tolerance is user-controlled, not platform-imposed</li>
            <li>✓ No fees for claiming creator or protocol fees</li>
          </ul>
        </div>

        {/* Worked example */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Example: Buying 100 USDC of a token</h3>
          <div className="bg-bg-input rounded-lg p-4 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-text-muted">You spend</span>
              <span>$100.00 USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Trade fee (1%)</span>
              <span className="text-accent-red">−$1.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Net to bonding curve</span>
              <span>$99.00</span>
            </div>
            <div className="flex justify-between border-t border-bg-border pt-1 mt-1">
              <span className="text-text-muted">→ Creator fee (0.5%)</span>
              <span>$0.50</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">→ Protocol fee (0.5%)</span>
              <span>$0.50</span>
            </div>
          </div>
        </div>

        {/* Example: Sell */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Example: Selling tokens for 100 USDC</h3>
          <div className="bg-bg-input rounded-lg p-4 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-text-muted">Tokens sold (worth at current price)</span>
              <span>$100.00 USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Trade fee (1%)</span>
              <span className="text-accent-red">−$1.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">You receive</span>
              <span className="font-semibold">$99.00 USDC</span>
            </div>
            <div className="flex justify-between border-t border-bg-border pt-1 mt-1">
              <span className="text-text-muted">→ Creator fee (0.5%)</span>
              <span>$0.50</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">→ Protocol fee (0.5%)</span>
              <span>$0.50</span>
            </div>
          </div>
        </div>

        {/* Example: Launch */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Example: Launching a token</h3>
          <div className="bg-bg-input rounded-lg p-4 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-text-muted">Creation fee</span>
              <span className="text-accent-red">−$5.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Gas (deploy 2 contracts)</span>
              <span className="text-accent-red">−$0.01</span>
            </div>
            <div className="flex justify-between border-t border-bg-border pt-1 mt-1">
              <span className="text-text-muted">Total cost to launch</span>
              <span className="font-semibold">~$5.01 USDC</span>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-2">
            The 1 billion token supply is minted to the bonding curve for free —
            you don&apos;t buy your own tokens at launch. You earn the 0.5%
            creator fee on every trade made by other users.
          </p>
        </div>

        {/* Example: Referral */}
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Example: Referral earnings</h3>
          <div className="bg-bg-input rounded-lg p-4 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-text-muted">Your referral buys 1,000 USDC of a token</span>
              <span>$1,000.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Your reward (0.1%)</span>
              <span className="font-semibold text-accent-green">+$1.00 USDC</span>
            </div>
            <div className="flex justify-between border-t border-bg-border pt-1 mt-1">
              <span className="text-text-muted">If they trade $100K volume over time</span>
              <span className="font-semibold text-accent-green">+$100.00 USDC</span>
            </div>
          </div>
        </div>

        {/* Graduation note */}
        <div className="bg-bg-input rounded-lg p-4">
          <h3 className="font-semibold mb-2">What happens to fees at graduation?</h3>
          <p className="text-sm text-text-secondary">
            When a token graduates (market cap reaches{' '}
            <strong>{formatUsdDirect(GRADUATION_MC)}</strong>), the bonding curve
            is retired. Creator and protocol fees accrued up to that point remain
            claimable from the curve contract forever — they are not lost. After
            graduation, there are no more trade fees (AMM swaps are 0%). The
            creator&apos;s ongoing revenue stream ends at graduation by design —
            the creator fee is a reward for building a token that reaches
            graduation, not a perpetual tax on trading.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-text-muted">
          <p>
            Want to know more about how the platform works?{' '}
            <Link href="/docs" className="text-accent-blue hover:underline">Read the docs</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
