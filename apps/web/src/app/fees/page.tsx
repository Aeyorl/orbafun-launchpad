import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUsdDirect } from '@/lib/utils';
import {
  PUBLIC_PROTOCOL_FACTS as facts,
  formatBps,
  shareOfTradePercent,
} from '@/content/public-protocol-facts';

export const metadata: Metadata = {
  title: 'Fees — Orba',
  description:
    'Mainnet draft of Orba creation and bonding-curve fees, network gas, approvals, price impact, referral accruals, and post-graduation AMM costs.',
  alternates: { canonical: '/fees' },
};

const TRADE_FEE_PCT = facts.bondingCurveTradeFeeBps / 100;
const CREATOR_FEE_PCT = Number(
  shareOfTradePercent(
    facts.bondingCurveTradeFeeBps,
    facts.creatorShareOfTradeFeeBps,
  ).replace('%', ''),
);
const PROTOCOL_FEE_PCT = Number(
  shareOfTradePercent(
    facts.bondingCurveTradeFeeBps,
    facts.protocolShareOfTradeFeeBps,
  ).replace('%', ''),
);
const REFERRAL_ACCRUAL_PCT = facts.referralAccrualBps / 100;

export default function FeesPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="card p-8">
        <h1 className="text-2xl font-bold mb-2">Fees</h1>
        <p className="text-text-muted text-sm mb-4">
          Target mainnet parameters for creating and trading tokens on Orba.
          Network gas, approvals, slippage, and price impact are shown separately
          because they are not Orba platform fees.
        </p>
        <p className="bg-bg-input rounded-lg p-4 text-sm text-text-secondary mb-6">
          <strong className="text-text-primary">{facts.publicationLabel}.</strong>{' '}
          These values must be checked against the final deployed contracts and
          production interface before publication. The transaction presented by
          your wallet is authoritative for a specific action.
        </p>

        <div className="bg-bg-input rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3 text-text-secondary">Target summary</h2>
          <div className="text-sm space-y-2 tabular-nums">
            <div className="flex justify-between gap-4 border-b border-bg-border pb-2">
              <span className="text-text-muted">Token creation</span>
              <span className="font-semibold text-right">{formatUsdDirect(facts.creationFeeUsdc)}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-bg-border pb-2">
              <span className="text-text-muted">Bonding-curve buy or sell</span>
              <span className="font-semibold text-right">{formatBps(facts.bondingCurveTradeFeeBps)}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-bg-border pb-2">
              <span className="text-text-muted">Post-graduation AMM LP fee</span>
              <span className="font-semibold text-right">{formatBps(facts.ammSwapFeeBps)}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-bg-border pb-2">
              <span className="text-text-muted">Referral accounting accrual</span>
              <span className="font-semibold text-right">{formatBps(facts.referralAccrualBps)} of eligible volume</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">Arc network gas</span>
              <span className="font-semibold text-right">Variable, paid in native USDC</span>
            </div>
          </div>
        </div>

        <section className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <h2 className="font-semibold text-lg">Token creation fee</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              {formatUsdDirect(facts.creationFeeUsdc)}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            The target one-time fee for deploying a token and its bonding curve.
            The fee is paid in Arc&apos;s ERC-20 representation of USDC and sent to
            the protocol treasury.
          </p>
          <p className="text-sm text-text-secondary">
            A launch can require an approval transaction before the creation
            transaction. Both transactions consume network gas in native USDC.
            Gas is additional to the creation fee. The factory owner can change
            the creation fee within the contract&apos;s on-chain cap, so review the
            current wallet request before approving.
          </p>
        </section>

        <section className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <h2 className="font-semibold text-lg">Bonding-curve trading fee</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              {TRADE_FEE_PCT}%
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            The target fee applies to each buy and sell while a token is on its
            bonding curve. On a 100 USDC buy, 1 USDC is allocated to fees and 99
            USDC enters the curve. On a sell with a 100 USDC gross curve amount,
            1 USDC is allocated to fees and the user receives 99 USDC before gas.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-bg-base rounded p-3">
              <div className="text-text-muted text-xs mb-1">Creator share</div>
              <div className="font-semibold tabular-nums">
                {formatBps(facts.creatorShareOfTradeFeeBps)} of the fee ({CREATOR_FEE_PCT}% of the trade)
              </div>
              <p className="text-xs text-text-muted mt-1">
                Accrues in the curve contract and is claimable by the recorded token creator.
              </p>
            </div>
            <div className="bg-bg-base rounded p-3">
              <div className="text-text-muted text-xs mb-1">Protocol share</div>
              <div className="font-semibold tabular-nums">
                {formatBps(facts.protocolShareOfTradeFeeBps)} of the fee ({PROTOCOL_FEE_PCT}% of the trade)
              </div>
              <p className="text-xs text-text-muted mt-1">
                Accrues in the curve contract and is claimable by the protocol owner.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <h2 className="font-semibold text-lg">AMM swaps after graduation</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              {formatBps(facts.ammSwapFeeBps)}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            The AMM retains 0.3% of swap input in the pair reserves for liquidity
            providers. Orba and token creators have no protocol-fee switch or
            special withdrawal path. Graduation sends its LP tokens to the burn
            address; later third-party liquidity providers may still mint their own
            LP tokens and participate in fees earned while they provide liquidity.
          </p>
          <p className="text-sm text-text-secondary">
            The final router, pair bytecode, reserves, and transaction preview must
            be verified for the specific graduated token.
          </p>
        </section>

        <section className="bg-bg-input rounded-lg p-4 mb-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <h2 className="font-semibold text-lg">Referral accounting</h2>
            <span className="text-2xl font-bold text-accent-green tabular-nums">
              {REFERRAL_ACCRUAL_PCT}%
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-2">
            Orba&apos;s target referral rate records {REFERRAL_ACCRUAL_PCT}% of
            eligible attributed bonding-curve volume. For 1,000 USDC of eligible
            volume, the off-chain record would increase by 1 USDC.
          </p>
          <p className="text-sm text-text-secondary">
            This is an accounting accrual, not an on-chain balance or automatic
            payment. It is intended to be funded from the protocol economics if a
            payout program is enabled. A future claim process would require separate
            eligibility, verification, minimum, timing, and legal terms. See the{' '}
            <Link href="/docs#referrals" className="text-accent-blue hover:underline">
              referral documentation
            </Link>.
          </p>
        </section>

        <section className="bg-bg-input rounded-lg p-4 mb-4">
          <h2 className="font-semibold text-lg mb-2">Network gas and approvals</h2>
          <p className="text-sm text-text-secondary mb-2">
            Arc uses native USDC for gas. Gas changes with network conditions and
            transaction complexity, so Orba does not promise a fixed cost. Wallets
            may display native USDC separately from the six-decimal ERC-20 USDC used
            by contracts even though they represent the same asset.
          </p>
          <p className="text-sm text-text-secondary">
            An ERC-20 approval is not a platform fee, but the approval transaction
            consumes gas and grants spending authority. Review the spender and amount;
            prefer the exact or smallest sufficient approval and revoke unused approvals.
          </p>
        </section>

        <section className="border border-accent-green/30 bg-accent-green/5 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-accent-green mb-2">Costs that are not Orba fees</h2>
          <ul className="text-sm text-text-secondary space-y-1">
            <li>• Network gas paid to Arc&apos;s validator mechanism</li>
            <li>• Slippage caused by state changes before execution</li>
            <li>• Price impact caused by trade size relative to liquidity</li>
            <li>• Wallet, exchange, bridge, or third-party provider charges</li>
            <li>• Taxes or reporting obligations in your jurisdiction</li>
          </ul>
        </section>

        <div className="space-y-4">
          <h2 className="text-xl font-bold">Worked examples</h2>

          <div className="bg-bg-input rounded-lg p-4 text-sm">
            <h3 className="font-semibold mb-3">Buying with 100 USDC</h3>
            <div className="space-y-2 tabular-nums">
              <div className="flex justify-between gap-4"><span className="text-text-muted">Amount submitted</span><span>100.00 USDC</span></div>
              <div className="flex justify-between gap-4"><span className="text-text-muted">Curve fee ({TRADE_FEE_PCT}%)</span><span>1.00 USDC</span></div>
              <div className="flex justify-between gap-4"><span className="text-text-muted">Amount entering curve</span><span>99.00 USDC</span></div>
              <div className="flex justify-between gap-4 text-xs"><span className="text-text-muted">Creator / protocol allocation</span><span>0.50 / 0.50 USDC</span></div>
            </div>
            <p className="text-xs text-text-muted mt-3">Token output depends on current curve state and the transaction&apos;s minimum output. Gas is additional.</p>
          </div>

          <div className="bg-bg-input rounded-lg p-4 text-sm">
            <h3 className="font-semibold mb-3">Launching a token</h3>
            <div className="space-y-2 tabular-nums">
              <div className="flex justify-between gap-4"><span className="text-text-muted">Target creation fee</span><span>{facts.creationFeeUsdc}.00 USDC</span></div>
              <div className="flex justify-between gap-4"><span className="text-text-muted">Approval gas</span><span>Variable</span></div>
              <div className="flex justify-between gap-4"><span className="text-text-muted">Creation gas</span><span>Variable</span></div>
            </div>
            <p className="text-xs text-text-muted mt-3">The creator receives no initial token allocation. Any later creator purchase is a separate trade with its own fee, gas, and price impact.</p>
          </div>
        </div>

        <section className="mt-6 border-t border-bg-border pt-6">
          <h2 className="font-semibold mb-2">What changes at graduation?</h2>
          <p className="text-sm text-text-secondary">
            Curve trading and its {TRADE_FEE_PCT}% fee stop after successful
            graduation. Previously accrued creator and protocol amounts remain
            subject to their contract claim rules. Trading moves to the AMM, where
            the LP swap fee is {formatBps(facts.ammSwapFeeBps)} and gas,
            slippage, and price impact still apply. Graduation has no separate target
            platform charge.
          </p>
        </section>

        <div className="border-t border-bg-border mt-8 pt-6 text-center text-xs text-text-muted">
          Parameters shown here are draft targets. Read the <Link href="/docs" className="text-accent-blue hover:underline">Docs</Link>{' '}
          and <Link href="/legal/terms" className="text-accent-blue hover:underline">Terms</Link>, then verify the final wallet transaction.
        </div>
      </div>
    </div>
  );
}
