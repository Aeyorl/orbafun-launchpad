'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useConnect,
  useConnectors,
} from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { parseUnits, formatUnits, erc20Abi } from 'viem';
import toast from 'react-hot-toast';
import { CONTRACTS, USDC_DECIMALS, TOKEN_DECIMALS } from '@/lib/config';
import {
  formatUsdc,
  formatNativeUsdc,
  formatTokens,
  formatPrice,
  bondingCurveProgress,
} from '@/lib/utils';
import { Token } from '@/lib/api';
import { useArcReceiptFallback } from '@/lib/use-arc-receipt';

// BondingCurve ABI (minimal view & trade functions)
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

/**
 * TradePanel — professional, high-density terminal trading form for Orba.
 */
export function TradePanel({ token }: { token: Token }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1); // 1% default
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const connectors = useConnectors();
  const { connect } = useConnect();

  const wrongNetwork = isConnected && chainId !== arcTestnet.id;

  // Track active tx hash locally to separate approval vs trade states cleanly
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [txAction, setTxAction] = useState<'approve' | 'trade' | null>(null);

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();

  useEffect(() => {
    if (txHash) setCurrentTxHash(txHash);
  }, [txHash]);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: currentTxHash,
    chainId: arcTestnet.id,
  });
  const fallback = useArcReceiptFallback(currentTxHash);
  const txConfirmed = isSuccess || fallback.confirmed;

  // Wallet balances
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

  // Allowances
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

  // Notifications & refetches on tx resolution
  useEffect(() => {
    if (!txConfirmed || !txAction) return;

    if (txAction === 'approve') {
      const asset = mode === 'buy' ? 'USDC' : token.symbol;
      toast.success(`${asset} approved! Prompting ${mode === 'buy' ? 'Buy' : 'Sell'} in wallet…`, {
        id: `approve-${currentTxHash}`,
      });
      refetchAllowance();
      refetchTokenAllowance();
      setCurrentTxHash(undefined);
      setTxAction(null);
      reset();

      const timer = setTimeout(() => {
        handleTrade();
      }, 500);
      return () => clearTimeout(timer);
    } else if (txAction === 'trade') {
      const verb = mode === 'buy' ? 'Bought' : 'Sold';
      const amt = amount || '';
      toast.success(`${verb} ${token.symbol}${amt ? ` (${amt} ${mode === 'buy' ? 'USDC' : token.symbol})` : ''}`, {
        id: `trade-${currentTxHash}`,
      });

      refetchUsdcBalance();
      refetchTokenBalance();
      refetchAllowance();
      refetchTokenAllowance();
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['readContract'] });
      queryClient.invalidateQueries({ queryKey: ['user-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['user-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['user-pnl'] });
      queryClient.invalidateQueries({ queryKey: ['tokenHolders', token.contract_address] });
      queryClient.invalidateQueries({ queryKey: ['tokenTrades', token.contract_address] });
      queryClient.invalidateQueries({ queryKey: ['token', token.contract_address] });
      queryClient.invalidateQueries({ queryKey: ['candles', token.contract_address] });
      queryClient.invalidateQueries({ queryKey: ['explore'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

      setAmount('');

      const timer = setTimeout(() => {
        setCurrentTxHash(undefined);
        setTxAction(null);
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [txConfirmed, txAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse input amount
  const parsedAmount = useMemo(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return 0n;
    try {
      return mode === 'buy'
        ? parseUnits(amount, USDC_DECIMALS)
        : parseUnits(amount, TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount, mode]);

  // Quote lookup
  const { data: quote } = useReadContract({
    address: token.curve_address as `0x${string}`,
    abi: BONDING_CURVE_ABI,
    functionName: mode === 'buy' ? 'quoteBuy' : 'quoteSell',
    args: [parsedAmount],
    chainId: arcTestnet.id,
    query: { enabled: parsedAmount > 0n },
  });

  // Calculate Price Impact & Minimum Out
  const { priceImpactPct, minOut, formattedQuote } = useMemo(() => {
    if (!quote || parsedAmount === 0n) {
      return { priceImpactPct: 0, minOut: 0n, formattedQuote: '0.00' };
    }

    const slippageBps = BigInt(Math.max(1, Math.floor((100 - slippage) * 100)));
    const minOutVal = (quote * slippageBps) / 10000n;
    const spotPrice = parseFloat(token.price || '0');
    let impact = 0;

    if (mode === 'buy') {
      const usdcPaid = Number(parsedAmount) / 1e6;
      const tokensRecv = Number(quote) / 1e18;
      if (tokensRecv > 0 && spotPrice > 0) {
        const execPrice = usdcPaid / tokensRecv;
        impact = Math.max(0, ((execPrice - spotPrice) / spotPrice) * 100);
      }
    } else {
      const tokensSold = Number(parsedAmount) / 1e18;
      const usdcRecv = Number(quote) / 1e6;
      if (tokensSold > 0 && spotPrice > 0) {
        const execPrice = usdcRecv / tokensSold;
        impact = Math.max(0, ((spotPrice - execPrice) / spotPrice) * 100);
      }
    }

    const formatted = mode === 'buy' ? formatTokens(quote) : formatUsdc(quote);
    return { priceImpactPct: impact, minOut: minOutVal, formattedQuote: formatted };
  }, [quote, parsedAmount, mode, slippage, token.price]);

  // Approval checks
  const usdcAllowanceLoaded = usdcAllowance !== undefined;
  const tokenAllowanceLoaded = tokenAllowance !== undefined;
  const needsApproval =
    parsedAmount > 0n &&
    (mode === 'buy'
      ? (!usdcAllowanceLoaded || usdcAllowance !== parsedAmount)
      : (!tokenAllowanceLoaded || tokenAllowance !== parsedAmount));

  // Balance validations
  const hasInsufficientBalance = useMemo(() => {
    if (!isConnected || parsedAmount === 0n) return false;
    if (mode === 'buy') {
      const bal = usdcBalance?.value ?? 0n;
      return parsedAmount > bal;
    } else {
      const bal = tokenBalance ?? 0n;
      return parsedAmount > bal;
    }
  }, [isConnected, parsedAmount, mode, usdcBalance, tokenBalance]);

  // Execute trade
  const handleTrade = async () => {
    if (!address || parsedAmount === 0n) return;
    setTxAction('trade');

    if (mode === 'buy') {
      writeContract({
        address: token.curve_address as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'buy',
        args: [parsedAmount, minOut],
        chainId: arcTestnet.id,
      });
    } else {
      writeContract({
        address: token.curve_address as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'sell',
        args: [parsedAmount, minOut],
        chainId: arcTestnet.id,
      });
    }
  };

  // Approve only the amount used by this trade.
  const handleApprove = async () => {
    if (!address || parsedAmount === 0n) return;
    setTxAction('approve');
    if (mode === 'buy') {
      writeContract({
        address: CONTRACTS.USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [token.curve_address as `0x${string}`, parsedAmount],
        chainId: arcTestnet.id,
      });
    } else {
      writeContract({
        address: token.contract_address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [token.curve_address as `0x${string}`, parsedAmount],
        chainId: arcTestnet.id,
      });
    }
  };

  // Set preset percentages (25%, 50%, 75%, 100%)
  const setPercentageAmount = (pct: number) => {
    if (mode === 'buy') {
      const bal = usdcBalance?.value ?? 0n;
      if (bal === 0n) return;
      const target = (bal * BigInt(pct)) / 100n;
      // usdcBalance.value is 18-decimal Arc native USDC
      setAmount(formatUnits(target, usdcBalance?.decimals ?? 18));
    } else {
      const bal = tokenBalance ?? 0n;
      if (bal === 0n) return;
      const target = (bal * BigInt(pct)) / 100n;
      setAmount(formatUnits(target, TOKEN_DECIMALS));
    }
  };

  // Graduated state
  if (token.status === 'graduated') {
    return (
      <div className="card text-center py-6 space-y-3">
        <div className="text-3xl">🎓</div>
        <h3 className="font-bold text-base text-text-primary">Token Graduated to DEX</h3>
        <p className="text-xs text-text-muted max-w-xs mx-auto">
          This token reached the $30,000 graduation threshold and now trades freely on the Orba AMM pair with liquidity permanently burned.
        </p>
        {token.amm_pair_address && (
          <a
            href={`https://testnet.arcscan.app/address/${token.amm_pair_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-full font-bold"
          >
            <span>View AMM Pair on ArcScan</span>
            <span>↗</span>
          </a>
        )}
      </div>
    );
  }

  const progress = bondingCurveProgress(token.market_cap);

  return (
    <div className="card space-y-3.5 bg-bg-card border border-bg-border shadow-subtle-1">
      {/* 1. SEGMENTED BUY / SELL CONTROL */}
      <div className="bg-bg-input p-1 rounded-xl flex gap-1 border border-bg-border/60" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'buy'}
          onClick={() => {
            setMode('buy');
            setAmount('');
          }}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            mode === 'buy'
              ? 'bg-accent-blue text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          BUY
        </button>
        <button
          role="tab"
          aria-selected={mode === 'sell'}
          onClick={() => {
            setMode('sell');
            setAmount('');
          }}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            mode === 'sell'
              ? 'bg-accent-blue text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          SELL
        </button>
      </div>

      {/* 2. YOU PAY / YOU SELL INPUT CONTAINER */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs text-text-muted">
          <span className="font-semibold">{mode === 'buy' ? 'You pay' : 'You sell'}</span>
          {isConnected && (
            <div className="flex items-center gap-1">
              <span>
                Balance:{' '}
                <span className="font-mono text-text-primary font-medium">
                  {mode === 'buy'
                    ? `${usdcBalance ? formatNativeUsdc(usdcBalance.value) : '0.00'} USDC`
                    : `${tokenBalance ? formatTokens(tokenBalance) : '0'} ${token.symbol}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPercentageAmount(100)}
                className="text-[11px] font-bold text-accent-blue hover:underline uppercase ml-1"
              >
                MAX
              </button>
            </div>
          )}
        </div>

        <div className="relative flex items-center bg-bg-input rounded-xl border border-bg-border focus-within:border-accent-blue transition-colors">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="any"
            className="w-full bg-transparent px-3.5 py-2.5 text-lg font-bold font-mono text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <span className="pr-3.5 text-xs font-bold text-text-secondary font-mono flex-shrink-0">
            {mode === 'buy' ? 'USDC' : token.symbol}
          </span>
        </div>

        {/* Percentage Preset Shortcuts */}
        <div className="grid grid-cols-4 gap-1.5 pt-0.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setPercentageAmount(pct)}
              className="py-1 px-2 text-[11px] font-semibold font-mono rounded-lg bg-bg-input hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-bg-border/60 transition-colors"
            >
              {pct === 100 ? 'MAX' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* ARROW DIVIDER */}
      <div className="flex justify-center -my-1">
        <div className="w-6 h-6 rounded-full bg-bg-input border border-bg-border flex items-center justify-center text-text-muted text-xs shadow-xs">
          ↓
        </div>
      </div>

      {/* 3. YOU RECEIVE READ-ONLY OUTPUT CONTAINER */}
      <div className="space-y-1.5">
        <div className="text-xs text-text-muted font-semibold">You receive</div>
        <div className="flex items-center bg-bg-input/60 rounded-xl border border-bg-border/60 px-3.5 py-2.5">
          <span className="w-full text-lg font-bold font-mono text-text-primary truncate">
            {quote && parsedAmount > 0n ? `≈ ${formattedQuote}` : '≈ 0.00'}
          </span>
          <span className="text-xs font-bold text-text-secondary font-mono flex-shrink-0">
            {mode === 'buy' ? token.symbol : 'USDC'}
          </span>
        </div>
      </div>

      {/* 4. MARKET INFORMATION BREAKDOWN */}
      <div className="bg-bg-input/40 rounded-xl p-3 border border-bg-border/60 space-y-2 text-xs">
        <div className="flex justify-between items-center text-text-muted">
          <span>Estimated price</span>
          <span className="font-mono font-medium text-text-primary">
            {formatPrice(token.price)}
          </span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <span>Price impact</span>
          <span
            className={`font-mono font-semibold ${
              priceImpactPct > 8
                ? 'text-rose-500 font-bold'
                : priceImpactPct > 3
                ? 'text-amber-500'
                : 'text-text-primary'
            }`}
          >
            {priceImpactPct > 3 ? `⚠ ${priceImpactPct.toFixed(2)}%` : `${priceImpactPct.toFixed(2)}%`}
          </span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <span>Trading fee</span>
          <span className="font-mono text-text-primary">1.0%</span>
        </div>

        <div className="flex justify-between items-center text-text-muted">
          <span>Network fee</span>
          <span className="font-mono text-text-primary">~$0.001 Arc USDC</span>
        </div>

        {/* Bonding Curve Context */}
        <div className="pt-2 border-t border-bg-border/60 flex justify-between items-center text-[11px]">
          <span className="text-text-muted">Bonding curve</span>
          <span className="font-medium text-accent-blue font-mono">
            {progress.toFixed(0)}% → $30.0K MC graduation
          </span>
        </div>
      </div>

      {/* 5. ADVANCED SETTINGS DRAWER */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs font-semibold text-text-muted hover:text-text-primary flex items-center justify-between w-full py-1"
        >
          <span>Advanced Settings</span>
          <span className="text-[10px] font-mono">{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-2 p-3 bg-bg-input rounded-xl border border-bg-border space-y-3 text-xs animate-fade-in">
            {/* Slippage Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-text-muted text-[11px]">
                <span>Slippage tolerance</span>
                <span className="font-mono font-bold text-accent-blue">{slippage}%</span>
              </div>
              <div className="flex gap-1.5">
                {[0.5, 1, 3, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlippage(s)}
                    className={`flex-1 py-1 text-[11px] font-mono font-medium rounded-lg border transition-colors ${
                      slippage === s
                        ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/40 font-bold'
                        : 'bg-bg-base border-bg-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {/* Minimum Received */}
            {quote && parsedAmount > 0n && (
              <div className="flex justify-between items-center text-text-muted text-[11px] pt-1 border-t border-bg-border/60">
                <span>Minimum received</span>
                <span className="font-mono text-text-primary font-medium">
                  {mode === 'buy' ? `${formatTokens(minOut)} ${token.symbol}` : `${formatUsdc(minOut)} USDC`}
                </span>
              </div>
            )}

            {/* Network Info */}
            <div className="flex justify-between items-center text-text-muted text-[11px] pt-1 border-t border-bg-border/60">
              <span>Execution network</span>
              <span className="font-mono text-text-secondary">Arc Testnet (5042002)</span>
            </div>
          </div>
        )}
      </div>

      {/* 6. PRIMARY ACTION CTA BUTTON WITH POLISHED STATES */}
      {!isConnected ? (
        <button
          onClick={() => connect({ connector: connectors[0] })}
          className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
        >
          Connect Wallet
        </button>
      ) : wrongNetwork ? (
        <button
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          disabled={isSwitching}
          className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
        >
          {isSwitching ? 'Switching Network…' : `Switch to Arc Testnet (${arcTestnet.id})`}
        </button>
      ) : isConfirming && !txConfirmed ? (
        <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-xl opacity-80">
          {txAction === 'approve' ? 'Step 1/2: Confirming approval…' : 'Step 2/2: Confirming trade on Arc…'}
        </button>
      ) : txConfirmed ? (
        <button disabled className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl bg-emerald-600">
          ✓ {mode === 'buy' ? 'Bought' : 'Sold'} ${token.symbol}
        </button>
      ) : hasInsufficientBalance ? (
        <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-xl opacity-60">
          Insufficient {mode === 'buy' ? 'USDC' : token.symbol} balance
        </button>
      ) : parsedAmount === 0n ? (
        <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-xl opacity-60">
          Enter amount
        </button>
      ) : needsApproval ? (
        <div className="space-y-1.5">
          <button
            onClick={handleApprove}
            disabled={isPending}
            className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
          >
            {isPending
              ? 'Step 1/2: Approving in wallet…'
              : mode === 'buy'
              ? `Step 1/2: Approve USDC`
              : `Step 1/2: Approve ${token.symbol}`}
          </button>
          <p className="text-[11px] text-text-muted text-center">
            First time trading this asset? Step 1 approves spending, then Step 2 executes your trade.
          </p>
        </div>
      ) : (
        <button
          onClick={handleTrade}
          disabled={isPending || !quote}
          className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
        >
          {isPending
            ? 'Confirming in wallet…'
            : mode === 'buy'
            ? `BUY ${token.symbol}`
            : `SELL ${token.symbol}`}
        </button>
      )}

      {/* Confirmation indicator */}
      {isConfirming && !txConfirmed && (
        <p className="text-xs text-text-muted text-center animate-pulse">
          Confirming on Arc blockchain (~0.5s block time)…
        </p>
      )}
      {fallback.failed && (
        <p role="alert" className="text-xs text-rose-500 font-medium text-center">
          Transaction failed on-chain. Please try again.
        </p>
      )}
    </div>
  );
}
