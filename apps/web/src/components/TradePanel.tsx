'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { parseUnits, formatUnits, erc20Abi, maxUint256 } from 'viem';
import toast from 'react-hot-toast';
import { CONTRACTS, USDC_DECIMALS, TOKEN_DECIMALS } from '@/lib/config';
import { formatUsdc, formatNativeUsdc, formatTokens } from '@/lib/utils';
import { Token } from '@/lib/api';
import { useArcReceiptFallback } from '@/lib/use-arc-receipt';

// BondingCurve ABI (minimal — just the functions we need)
const BONDING_CURVE_ABI = [
  {
    name: 'buy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'sell',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenAmount', type: 'uint256' },
      { name: 'minUsdcOut', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'quoteBuy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'usdcAmount', type: 'uint256' }],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    name: 'quoteSell',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenAmount', type: 'uint256' }],
    outputs: [{ name: 'usdcOut', type: 'uint256' }],
  },
] as const;

const QUICK_AMOUNTS = [10, 50, 100, 500];

/**
 * TradePanel — buy/sell interface for a token on the bonding curve.
 * Shows live quote before signature, slippage tolerance setting.
 */
export function TradePanel({ token }: { token: Token }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(5); // 5% default
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  // If the wallet is connected to a different network (or has Arc Testnet
  // configured with a wrong chain ID, e.g. legacy 1516), every wagmi hook
  // silently fails — balance shows $0, quotes never load, and receipt
  // polling never resolves. Detect it and prompt the user to switch.
  const wrongNetwork = isConnected && chainId !== arcTestnet.id;
  // Track active tx hash locally to cleanly separate approval vs trade confirmation states
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [txAction, setTxAction] = useState<'approve' | 'trade' | null>(null);

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();

  // Sync writeContract txHash to local state
  useEffect(() => {
    if (txHash) setCurrentTxHash(txHash);
  }, [txHash]);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: currentTxHash,
    chainId: arcTestnet.id,
  });
  const fallback = useArcReceiptFallback(currentTxHash);
  const txConfirmed = isSuccess || fallback.confirmed;

  // Pin chainId on all reads for the same reason — reads must go through the
  // Arc transports regardless of what network the wallet reports.
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: { refetchInterval: 5_000, enabled: !!address },
  });
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: token.contract_address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, token.curve_address as `0x${string}`],
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: token.contract_address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, token.curve_address as `0x${string}`],
    chainId: arcTestnet.id,
    query: { enabled: !!address && mode === 'sell' },
  });

  // Fire toast notifications & instant balance refetches on transaction success / failure.
  useEffect(() => {
    if (!txConfirmed || !txAction) return;

    if (txAction === 'approve') {
      const asset = mode === 'buy' ? 'USDC' : token.symbol;
      toast.success(`${asset} approved! Prompts for ${mode === 'buy' ? 'Buy' : 'Sell'} in wallet…`, {
        id: `approve-${currentTxHash}`,
      });
      // Refetch allowances, reset approval state, and automatically trigger the trade transaction.
      refetchAllowance();
      refetchTokenAllowance();
      setCurrentTxHash(undefined);
      setTxAction(null);
      reset();

      // Auto-trigger trade transaction after a short delay for state update
      const timer = setTimeout(() => {
        handleTrade();
      }, 500);
      return () => clearTimeout(timer);
    } else if (txAction === 'trade') {
      const verb = mode === 'buy' ? 'Bought' : 'Sold';
      const amt = amount || '';
      toast.success(`${verb} ${token.symbol}${amt ? ` for ${amt} USDC` : ''}`, {
        id: `trade-${currentTxHash}`,
      });

      // Instantly refetch all balances, allowances, and query caches without reloading the page
      refetchUsdcBalance();
      refetchTokenBalance();
      refetchAllowance();
      refetchTokenAllowance();
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['readContract'] });
      queryClient.invalidateQueries({ queryKey: ['user-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['tokenHolders', token.contract_address] });
      queryClient.invalidateQueries({ queryKey: ['tokenTrades', token.contract_address] });
      queryClient.invalidateQueries({ queryKey: ['token', token.contract_address] });

      setAmount('');

      // Auto-reset trade success state after 3s so user can make another trade
      const timer = setTimeout(() => {
        setCurrentTxHash(undefined);
        setTxAction(null);
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [txConfirmed, txAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quote
  const parsedAmount = amount
    ? mode === 'buy'
      ? parseUnits(amount, USDC_DECIMALS)
      : parseUnits(amount, TOKEN_DECIMALS)
    : 0n;

  const { data: quote } = useReadContract({
    address: token.curve_address as `0x${string}`,
    abi: BONDING_CURVE_ABI,
    functionName: mode === 'buy' ? 'quoteBuy' : 'quoteSell',
    args: [parsedAmount],
    chainId: arcTestnet.id,
    query: { enabled: parsedAmount > 0n },
  });

  // Approval logic:
  //   - BUY: BondingCurve pulls USDC via transferFrom → approve USDC for curve.
  //   - SELL: BondingCurve pulls tokens via transferFrom → approve token for curve.
  // If the relevant allowance is undefined (RPC read failed/loading), default
  // to needing approval — safer than letting the tx revert on-chain.
  const usdcAllowanceLoaded = usdcAllowance !== undefined;
  const tokenAllowanceLoaded = tokenAllowance !== undefined;
  const needsApproval =
    parsedAmount > 0n &&
    (mode === 'buy'
      ? (!usdcAllowanceLoaded || usdcAllowance < parsedAmount)
      : (!tokenAllowanceLoaded || tokenAllowance < parsedAmount));

  const handleTrade = async () => {
    if (!address || !amount) return;
    setTxAction('trade');

    if (mode === 'buy') {
      const minOut = quote
        ? (quote * BigInt(100 - slippage)) / 100n
        : 0n;
      writeContract({
        address: token.curve_address as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'buy',
        args: [parsedAmount, minOut],
        chainId: arcTestnet.id,
      });
    } else {
      const minOut = quote
        ? (quote * BigInt(100 - slippage)) / 100n
        : 0n;
      writeContract({
        address: token.curve_address as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'sell',
        args: [parsedAmount, minOut],
        chainId: arcTestnet.id,
      });
    }
  };

  const handleApprove = async () => {
    if (!address || !amount) return;
    setTxAction('approve');
    if (mode === 'buy') {
      // Increase USDC allowance for the bonding curve (used by buy() via transferFrom).
      // Uses increaseAllowance (selector 0x39509351) instead of approve so wallet extensions
      // like MetaMask/Rabby strictly classify it as ERC-20 (no NFT warnings).
      writeContract({
        address: CONTRACTS.USDC,
        abi: [
          {
            name: 'increaseAllowance',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'addedValue', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'increaseAllowance',
        args: [token.curve_address as `0x${string}`, parseUnits(amount, USDC_DECIMALS)],
        chainId: arcTestnet.id,
      });
    } else {
      // Approve the MemeToken for the bonding curve (used by sell() via transferFrom).
      writeContract({
        address: token.contract_address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [token.curve_address as `0x${string}`, maxUint256],
        chainId: arcTestnet.id,
      });
    }
  };

  if (token.status === 'graduated') {
    return (
      <div className="card">
        <div className="text-center py-6">
          <div className="text-accent-purple text-3xl mb-2">🎓</div>
          <h3 className="font-semibold mb-1">Token Graduated</h3>
          <p className="text-sm text-text-secondary mb-4">
            This token has migrated to the DEX and now trades on the open market.
          </p>
          {token.amm_pair_address && (
            <a
              href={`https://testnet.arcscan.app/address/${token.amm_pair_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-block"
              aria-label="View AMM Pair on ArcScan (opens in new tab)"
            >
              View AMM Pair → <span className="sr-only">(opens in new tab)</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Buy/Sell toggle */}
      <div className="flex gap-1 bg-bg-input rounded-lg p-1 mb-4" role="tablist" aria-label="Trade direction">
        <button
          role="tab"
          aria-selected={mode === 'buy'}
          onClick={() => setMode('buy')}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
            mode === 'buy' ? 'bg-accent-green text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Buy
        </button>
        <button
          role="tab"
          aria-selected={mode === 'sell'}
          onClick={() => setMode('sell')}
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
            mode === 'sell' ? 'bg-accent-red text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Current User Holdings Card (if connected and balance > 0) */}
      {isConnected && tokenBalance && tokenBalance > 0n && (
        <div className="bg-bg-input rounded-xl p-3 mb-4 flex items-center justify-between text-xs border border-bg-border/60">
          <div>
            <div className="text-text-muted">Your Holdings</div>
            <div className="font-bold text-sm text-text-primary tabular-nums">
              {formatTokens(tokenBalance)} {token.symbol}
            </div>
          </div>
          <div className="text-right">
            <div className="text-text-muted">Est. Value</div>
            <div className="font-bold text-sm text-accent-green tabular-nums">
              {formatUsdc(Math.round((Number(tokenBalance) / 1e18) * parseFloat(token.price || '0') * 1e6).toString())}
            </div>
          </div>
        </div>
      )}

      {/* Amount input */}
      <div className="mb-3">
        <label htmlFor="trade-amount" className="text-xs text-text-muted mb-1 block flex justify-between">
          <span>{mode === 'buy' ? 'USDC amount' : 'Token amount'}</span>
          {mode === 'sell' && tokenBalance && tokenBalance > 0n && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(tokenBalance, TOKEN_DECIMALS))}
              className="text-accent-red font-semibold hover:underline text-xs"
            >
              MAX
            </button>
          )}
        </label>
        <div className="relative">
          <input
            id="trade-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input pr-16 text-lg font-semibold"
            aria-label={`${mode === 'buy' ? 'USDC' : token.symbol} amount to ${mode}`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted font-medium">
            {mode === 'buy' ? 'USDC' : token.symbol}
          </span>
        </div>
        {/* Quick amount presets */}
        <div className="flex gap-1 mt-2" role="group" aria-label="Quick amount presets">
          {mode === 'buy' ? (
            QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String(amt))}
                aria-label={`Set amount to $${amt} USDC`}
                className="flex-1 py-1 text-xs rounded-md bg-bg-input hover:bg-bg-border text-text-secondary transition-colors"
              >
                ${amt}
              </button>
            ))
          ) : (
            [25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  if (tokenBalance && tokenBalance > 0n) {
                    const pctAmount = (tokenBalance * BigInt(pct)) / 100n;
                    setAmount(formatUnits(pctAmount, TOKEN_DECIMALS));
                  }
                }}
                disabled={!tokenBalance || tokenBalance === 0n}
                aria-label={`Set sell amount to ${pct}%`}
                className="flex-1 py-1 text-xs rounded-md bg-bg-input hover:bg-bg-border text-text-secondary transition-colors disabled:opacity-50"
              >
                {pct === 100 ? '100% (MAX)' : `${pct}%`}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Balance display */}
      {isConnected && (
        <div className="text-xs text-text-muted mb-3 flex justify-between">
          <span>
            Balance: {mode === 'buy'
              ? `${usdcBalance ? formatNativeUsdc(usdcBalance.value) : '$0'} USDC`
              : `${tokenBalance ? formatTokens(tokenBalance) : '0'} ${token.symbol}`}
          </span>
          {mode === 'buy' && usdcBalance && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(usdcBalance.value, USDC_DECIMALS))}
              className="text-accent-green font-semibold hover:underline"
              aria-label="Use maximum USDC balance"
            >
              MAX
            </button>
          )}
          {mode === 'sell' && tokenBalance && tokenBalance > 0n && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(tokenBalance, TOKEN_DECIMALS))}
              className="text-accent-red font-semibold hover:underline"
              aria-label="Use maximum token balance"
            >
              MAX
            </button>
          )}
        </div>
      )}

      {/* Quote */}
      {quote && parsedAmount > 0n && (
        <div className="bg-bg-input rounded-lg p-3 mb-3 text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-text-muted">You receive</span>
            <span className="font-semibold tabular-nums">
              {mode === 'buy'
                ? `${formatTokens(quote)} ${token.symbol}`
                : `${formatUsdc(quote)} USDC`}
            </span>
          </div>
          <div className="flex justify-between text-xs text-text-muted">
            <span>Price</span>
            <span className="tabular-nums">
              {mode === 'buy'
                ? `${formatUsdc((parsedAmount * 10n ** 12n) / quote)} / ${token.symbol}`
                : `${formatUsdc((quote * 10n ** 12n) / parsedAmount)} / ${token.symbol}`}
            </span>
          </div>
        </div>
      )}

      {/* Slippage */}
      <div className="flex items-center gap-2 mb-3 text-xs" role="group" aria-label="Slippage tolerance">
        <span className="text-text-muted">Slippage:</span>
        {[1, 5, 15].map((s) => (
          <button
            key={s}
            onClick={() => setSlippage(s)}
            aria-label={`Set slippage to ${s}%`}
            aria-pressed={slippage === s}
            className={`px-2 py-0.5 rounded ${
              slippage === s
                ? 'bg-accent-green/20 text-accent-green'
                : 'bg-bg-input text-text-muted hover:text-text-primary'
            }`}
          >
            {s}%
          </button>
        ))}
      </div>

      {/* Action button */}
      {!isConnected ? (
        <button disabled className="btn-secondary w-full">
          Connect wallet to trade
        </button>
      ) : wrongNetwork ? (
        <button
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          disabled={isSwitching}
          className="btn-primary w-full"
        >
          {isSwitching ? 'Switching…' : `Switch to Arc Testnet (${arcTestnet.id})`}
        </button>
      ) : isConfirming && !txConfirmed ? (
        <button disabled className="btn-secondary w-full">
          {txAction === 'approve' ? 'Confirming approval...' : 'Confirming transaction...'}
        </button>
      ) : txConfirmed ? (
        <button disabled className="btn-primary w-full">
          ✓ Transaction successful
        </button>
      ) : needsApproval ? (
        <>
          <button
            onClick={handleApprove}
            disabled={isPending || !amount}
            className="btn-secondary w-full"
          >
            {isPending
              ? mode === 'buy'
                ? 'Step 1/2: Approving USDC…'
                : `Step 1/2: Approving ${token.symbol}…`
              : mode === 'buy'
              ? `Step 1/2: Approve USDC`
              : `Step 1/2: Approve ${token.symbol}`}
          </button>
          <p className="text-[11px] text-text-muted text-center mt-1.5">
            First time trading this token? Step 1 approves spending, then Step 2 prompts your {mode === 'buy' ? 'Buy' : 'Sell'} trade.
          </p>
        </>
      ) : (
        <button
          onClick={handleTrade}
          disabled={isPending || !amount || !quote}
          className={mode === 'buy' ? 'btn-buy w-full' : 'btn-sell w-full'}
        >
          {isPending
            ? 'Sending transaction...'
            : mode === 'buy'
            ? `Buy ${token.symbol}`
            : `Sell ${token.symbol}`}
        </button>
      )}

      {/* Fallback note shown while waiting for on-chain confirmation.
          We rotate between 4 Arc RPC providers, so this usually resolves
          in a few seconds; the message is just a UX safety net. */}
      {isConfirming && !txConfirmed && (
        <p className="text-xs text-text-muted text-center mt-2">
          Confirming on Arc… usually a few seconds.
        </p>
      )}
      {fallback.failed && (
        <p role="alert" className="text-xs text-accent-red text-center mt-2">
          Transaction failed on-chain. Please try again.
        </p>
      )}
    </div>
  );
}
