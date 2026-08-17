'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
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
import { parseUnits, formatUnits, erc20Abi } from 'viem';
import toast from 'react-hot-toast';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_URL,
  ARC_NETWORK_NAME,
  CONTRACTS,
  USDC_DECIMALS,
  TOKEN_DECIMALS,
} from '@/lib/config';
import {
  formatUsdc,
  formatNativeUsdc,
  formatTokens,
  formatPrice,
  bondingCurveProgress,
  ipfsToGateway,
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

const LEGACY_MEME_TOKEN_ABI = [
  {
    name: 'maxWallet',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
const AMM_PAIR_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
] as const;
const AMM_ROUTER_ABI = [
  { name: 'swapExactUSDCForTokens', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'swapExactTokensForUSDC', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const ARC_ERC20_TO_NATIVE_FACTOR = 10n ** 12n;
const ARC_GAS_RESERVE_NATIVE = 10n ** 16n; // Keep $0.01 USDC for gas.

/**
 * TradePanel — professional, high-density terminal trading form for Orba.
 */
export function TradePanel({ token }: { token: Token }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1); // 1% default
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAdvancingToTrade, setIsAdvancingToTrade] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const connectors = useConnectors();
  const { connect } = useConnect();

  const wrongNetwork = isConnected && chainId !== ARC_CHAIN_ID;
  const walletConnectConnector = connectors.find((connector) => connector.type === 'walletConnect');
  const injectedConnector = connectors.find((connector) => connector.type === 'injected');
  const preferredConnector = walletConnectConnector ?? injectedConnector ?? connectors[0];
  const isAmmTrade = token.status === 'graduated';
  const ammRouter = CONTRACTS.AMM_ROUTER;
  // Treat pre-versioning API responses as legacy-capped for safety.
  const isLegacyCapped = token.transfer_policy !== 'uncapped';

  // Track active tx hash locally to separate approval vs trade states cleanly
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [txAction, setTxAction] = useState<'approve' | 'trade' | null>(null);
  const pendingTradeRef = useRef<{
    mode: 'buy' | 'sell';
    displayAmount: string;
    parsedAmount: bigint;
    minOut: bigint;
  } | null>(null);

  const {
    writeContract,
    data: txHash,
    isPending,
    isError: isWriteError,
    error: writeError,
    reset,
  } = useWriteContract();

  useEffect(() => {
    if (txHash) setCurrentTxHash(txHash);
  }, [txHash]);

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
  } = useWaitForTransactionReceipt({
    hash: currentTxHash,
    chainId: ARC_CHAIN_ID,
  });
  const fallback = useArcReceiptFallback(currentTxHash);
  const txConfirmed = isSuccess || fallback.confirmed;

  // Wallet balances
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useBalance({
    address,
    chainId: ARC_CHAIN_ID,
    query: { refetchInterval: 5_000, enabled: !!address },
  });

  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: token.contract_address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const { data: maxWallet } = useReadContract({
    address: token.contract_address as `0x${string}`,
    abi: LEGACY_MEME_TOKEN_ABI,
    functionName: 'maxWallet',
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: !!address && token.status === 'active' && isLegacyCapped,
    },
  });

  // Allowances
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, (isAmmTrade ? ammRouter : token.curve_address) as `0x${string}`],
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address && (!isAmmTrade || !!ammRouter) },
  });

  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: token.contract_address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, (isAmmTrade ? ammRouter : token.curve_address) as `0x${string}`],
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address && mode === 'sell' && (!isAmmTrade || !!ammRouter) },
  });

  // Notifications & refetches on tx resolution
  useEffect(() => {
    if (!txConfirmed || !txAction) return;

    if (txAction === 'approve') {
      const pendingTrade = pendingTradeRef.current;
      if (!pendingTrade) return;

      const asset = pendingTrade.mode === 'buy' ? 'USDC' : token.symbol;
      toast.success(`${asset} approved! Opening the ${pendingTrade.mode === 'buy' ? 'buy' : 'sell'} confirmation…`, {
        id: `approve-${currentTxHash}`,
      });
      refetchAllowance();
      refetchTokenAllowance();
      setCurrentTxHash(undefined);
      setTxAction(null);
      setIsAdvancingToTrade(true);
      reset();
      return;
    } else if (txAction === 'trade') {
      const completedTrade = pendingTradeRef.current;
      const completedMode = completedTrade?.mode ?? mode;
      const verb = completedMode === 'buy' ? 'Bought' : 'Sold';
      const amt = completedTrade?.displayAmount ?? amount;
      toast.success(`${verb} ${token.symbol}${amt ? ` (${amt} ${completedMode === 'buy' ? 'USDC' : token.symbol})` : ''}`, {
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
        pendingTradeRef.current = null;
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [txConfirmed, txAction]);

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

  const { data: curveQuote } = useReadContract({
    address: token.curve_address as `0x${string}`,
    abi: BONDING_CURVE_ABI,
    functionName: mode === 'buy' ? 'quoteBuy' : 'quoteSell',
    args: [parsedAmount],
    chainId: ARC_CHAIN_ID,
    query: { enabled: !isAmmTrade && parsedAmount > 0n },
  });
  const { data: pairToken0 } = useReadContract({ address: token.amm_pair_address as `0x${string}`, abi: AMM_PAIR_ABI, functionName: 'token0', chainId: ARC_CHAIN_ID, query: { enabled: isAmmTrade && !!token.amm_pair_address } });
  const { data: reserves } = useReadContract({ address: token.amm_pair_address as `0x${string}`, abi: AMM_PAIR_ABI, functionName: 'getReserves', chainId: ARC_CHAIN_ID, query: { enabled: isAmmTrade && !!token.amm_pair_address } });
  const quote = useMemo(() => {
    if (!isAmmTrade) return curveQuote;
    if (!reserves || !pairToken0 || parsedAmount === 0n) return undefined;
    const [reserve0, reserve1] = reserves;
    const usdcIsToken0 = pairToken0.toLowerCase() === CONTRACTS.USDC.toLowerCase();
    const reserveIn = mode === 'buy' ? (usdcIsToken0 ? reserve0 : reserve1) : (usdcIsToken0 ? reserve1 : reserve0);
    const reserveOut = mode === 'buy' ? (usdcIsToken0 ? reserve1 : reserve0) : (usdcIsToken0 ? reserve0 : reserve1);
    return reserveIn > 0n && reserveOut > 0n ? (parsedAmount * reserveOut) / (reserveIn + parsedAmount) : undefined;
  }, [isAmmTrade, curveQuote, reserves, pairToken0, parsedAmount, mode]);

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

  const buyWouldExceedMaxWallet =
    !isAmmTrade && isLegacyCapped &&
    mode === 'buy' &&
    quote !== undefined &&
    tokenBalance !== undefined &&
    maxWallet !== undefined &&
    tokenBalance + quote > maxWallet;

  const remainingWalletCapacity =
    maxWallet !== undefined && tokenBalance !== undefined && maxWallet > tokenBalance
      ? maxWallet - tokenBalance
      : 0n;

  // Balance validations
  const hasInsufficientBalance = useMemo(() => {
    if (!isConnected || parsedAmount === 0n) return false;
    if (mode === 'buy') {
      const bal = usdcBalance?.value ?? 0n;
      const requiredNative = parsedAmount * ARC_ERC20_TO_NATIVE_FACTOR + ARC_GAS_RESERVE_NATIVE;
      return requiredNative > bal;
    } else {
      const bal = tokenBalance ?? 0n;
      return parsedAmount > bal;
    }
  }, [isConnected, parsedAmount, mode, usdcBalance, tokenBalance]);

  const createTradeIntent = () => ({
    mode,
    displayAmount: amount,
    parsedAmount,
    minOut,
  });

  const executeTrade = (trade: ReturnType<typeof createTradeIntent>) => {
    setTradeError(null);
    setIsAdvancingToTrade(false);
    setTxAction('trade');

    if (isAmmTrade) {
      if (!token.amm_pair_address || !address || !ammRouter) {
        setTradeError('AMM trading is not configured for this network yet.');
        setTxAction(null);
        return;
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      writeContract({ address: ammRouter, abi: AMM_ROUTER_ABI, functionName: trade.mode === 'buy' ? 'swapExactUSDCForTokens' : 'swapExactTokensForUSDC', args: [trade.parsedAmount, trade.minOut, deadline, token.amm_pair_address as `0x${string}`, address], chainId: ARC_CHAIN_ID });
    } else if (trade.mode === 'buy') {
      writeContract({
        address: token.curve_address as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'buy',
        args: [trade.parsedAmount, trade.minOut],
        chainId: ARC_CHAIN_ID,
      });
    } else {
      writeContract({
        address: token.curve_address as `0x${string}`,
        abi: BONDING_CURVE_ABI,
        functionName: 'sell',
        args: [trade.parsedAmount, trade.minOut],
        chainId: ARC_CHAIN_ID,
      });
    }
  };

  // Open the trade request only after the approval state has been cleared.
  // Keeping this timer in its own effect prevents the approval effect cleanup
  // from cancelling the second wallet prompt during the state transition.
  useEffect(() => {
    if (!isAdvancingToTrade) return;

    const timer = setTimeout(() => {
      const pendingTrade = pendingTradeRef.current;
      if (pendingTrade) {
        executeTrade(pendingTrade);
      } else {
        setIsAdvancingToTrade(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isAdvancingToTrade]);

  // Execute trade
  const handleTrade = async () => {
    if (!address || parsedAmount === 0n) return;
    setTradeError(null);
    const trade = createTradeIntent();
    pendingTradeRef.current = trade;
    executeTrade(trade);
  };

  // Approve only the amount used by this trade.
  const handleApprove = async () => {
    if (!address || parsedAmount === 0n) return;
    if (isAmmTrade && !ammRouter) {
      setTradeError('AMM trading is not configured for this network yet.');
      return;
    }
    setTradeError(null);
    const trade = createTradeIntent();
    pendingTradeRef.current = trade;
    setTxAction('approve');
    if (trade.mode === 'buy') {
      writeContract({
        address: CONTRACTS.USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [(isAmmTrade ? ammRouter : token.curve_address) as `0x${string}`, trade.parsedAmount],
        chainId: ARC_CHAIN_ID,
      });
    } else {
      writeContract({
        address: token.contract_address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [(isAmmTrade ? ammRouter : token.curve_address) as `0x${string}`, trade.parsedAmount],
        chainId: ARC_CHAIN_ID,
      });
    }
  };

  const flowLocked = isPending || isConfirming || isAdvancingToTrade;
  const approvalAsset = mode === 'buy' ? 'USDC' : token.symbol;
  const approvalAmount = formatUnits(
    parsedAmount,
    mode === 'buy' ? USDC_DECIMALS : TOKEN_DECIMALS,
  );
  const curveLabel = `${token.curve_address.slice(0, 6)}…${token.curve_address.slice(-4)}`;

  useEffect(() => {
    if (!isWriteError) return;

    const message = writeError?.message?.toLowerCase().includes('user rejected')
      ? 'Transaction cancelled in wallet.'
      : 'Wallet could not submit the transaction. Check the amount and try again.';
    setTradeError(message);
    setCurrentTxHash(undefined);
    setTxAction(null);
    setIsAdvancingToTrade(false);
    reset();
  }, [isWriteError, writeError, reset]);

  useEffect(() => {
    if ((!fallback.failed && !isReceiptError) || !txAction) return;

    const message = buyWouldExceedMaxWallet
      ? `This buy exceeds the legacy 4% wallet limit. You can receive at most ${formatTokens(remainingWalletCapacity)} ${token.symbol}.`
      : 'Transaction reverted on Arc. Refresh the quote and try a smaller amount.';
    setTradeError(message);
    setCurrentTxHash(undefined);
    setTxAction(null);
    setIsAdvancingToTrade(false);
    reset();
  }, [
    fallback.failed,
    isReceiptError,
    txAction,
    buyWouldExceedMaxWallet,
    remainingWalletCapacity,
    token.symbol,
    reset,
  ]);

  // Set preset percentages (25%, 50%, 75%, 100%)
  const setPercentageAmount = (pct: number) => {
    if (mode === 'buy') {
      const bal = usdcBalance?.value ?? 0n;
      if (bal === 0n) return;
      const spendable = bal > ARC_GAS_RESERVE_NATIVE ? bal - ARC_GAS_RESERVE_NATIVE : 0n;
      const target = (spendable * BigInt(pct)) / 100n;
      // usdcBalance.value is 18-decimal Arc native USDC
      setAmount(formatUnits(target, usdcBalance?.decimals ?? 18));
    } else {
      const bal = tokenBalance ?? 0n;
      if (bal === 0n) return;
      const target = (bal * BigInt(pct)) / 100n;
      setAmount(formatUnits(target, TOKEN_DECIMALS));
    }
  };

  const progress = bondingCurveProgress(token.market_cap);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-card">
      <div
        data-testid="trade-panel-scroll-region"
        className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4 pb-3 sm:p-5 sm:pb-3"
      >
      {/* 1. SEGMENTED BUY / SELL CONTROL */}
      <div className="bg-bg-input p-1 rounded-xl flex gap-1 border border-bg-border/60" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'buy'}
          onClick={() => {
            setMode('buy');
            setAmount('');
          }}
          disabled={flowLocked}
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
          disabled={flowLocked}
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
                disabled={flowLocked}
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
            disabled={flowLocked}
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
              disabled={flowLocked}
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
          <span className="flex flex-shrink-0 items-center gap-2 text-xs font-bold text-text-secondary font-mono">
            {mode === 'buy' ? token.symbol : 'USDC'}
            {mode === 'buy' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={token.image ? ipfsToGateway(token.image) : '/orba-bloom-icon.svg'}
                alt=""
                className="h-6 w-6 rounded-full border border-bg-border object-cover"
              />
            )}
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
          disabled={flowLocked}
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
                    disabled={flowLocked}
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
              <span className="font-mono text-text-secondary">{ARC_NETWORK_NAME} ({ARC_CHAIN_ID})</span>
            </div>
          </div>
        )}
      </div>

      </div>

      {/* 6. PRIMARY ACTION CTA BUTTON WITH POLISHED STATES */}
      <div
        data-testid="trade-panel-action-footer"
        className="shrink-0 space-y-2.5 border-t border-bg-border bg-bg-card p-4 pt-3 sm:px-5 sm:pb-5"
      >
        {buyWouldExceedMaxWallet && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          This legacy token limits a wallet to 4% of supply. You can receive at most{' '}
          <span className="font-mono font-bold">
            {formatTokens(remainingWalletCapacity)} {token.symbol}
          </span>
          . Reduce the buy amount.
        </div>
      )}
        {!isConnected ? (
        <button
          onClick={() => preferredConnector && connect({ connector: preferredConnector })}
          disabled={!preferredConnector}
          className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
        >
          Connect Wallet
        </button>
      ) : wrongNetwork ? (
        <button
          onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
          disabled={isSwitching}
          className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
        >
          {isSwitching ? 'Switching Network…' : `Switch to ${ARC_NETWORK_NAME} (${ARC_CHAIN_ID})`}
        </button>
      ) : isConfirming && !txConfirmed ? (
        <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-xl opacity-80">
          {txAction === 'approve' ? 'Step 1/2: Confirming approval…' : 'Step 2/2: Confirming trade on Arc…'}
        </button>
      ) : isAdvancingToTrade ? (
        <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-xl opacity-80">
          Step 2/2: Opening trade confirmation…
        </button>
      ) : txConfirmed ? (
        <button disabled className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl bg-emerald-600">
          ✓ {mode === 'buy' ? 'Bought' : 'Sold'} ${token.symbol}
        </button>
      ) : buyWouldExceedMaxWallet ? (
        <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-lg opacity-60">
          Reduce buy — legacy wallet limit
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
        <div className="space-y-2.5">
          <div className="rounded-xl border border-accent-blue/25 bg-accent-blue/5 p-3 text-xs space-y-2">
            <div className="font-bold text-text-primary">Why your wallet says “Spending cap”</div>
            <p className="text-text-secondary leading-relaxed">
              This is the secure approval step, not the purchase. It authorizes exactly{' '}
              <span className="font-mono font-bold text-text-primary">
                {approvalAmount} {approvalAsset}
              </span>{' '}
              for this token&apos;s {isAmmTrade ? 'AMM router' : 'bonding curve'}. Orba opens the actual trade confirmation next.
            </p>
            <div className="flex items-center justify-between gap-3 text-[11px] text-text-muted">
              <span>Approved spender</span>
              <a
                href={`${ARC_EXPLORER_URL}/address/${isAmmTrade ? ammRouter : token.curve_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-accent-blue hover:underline"
                title={isAmmTrade ? ammRouter : token.curve_address}
              >
                {isAmmTrade ? 'AMM router' : `Bonding curve ${curveLabel}`} ↗
              </a>
            </div>
            <p className="text-[11px] font-medium text-text-secondary">
              Keep the wallet cap unchanged. Orba never requests unlimited approval.
            </p>
          </div>
          <button
            onClick={handleApprove}
            disabled={isPending || (isAmmTrade && !ammRouter)}
            className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
          >
            {isPending
              ? 'Step 1/2: Approving in wallet…'
              : `Approve ${approvalAmount} ${approvalAsset} (1 of 2)`}
          </button>
          <p className="text-[11px] text-text-muted text-center">
            After approval confirms, your wallet will ask you to confirm the trade.
          </p>
        </div>
      ) : (
        <button
          onClick={handleTrade}
          disabled={isPending || !quote || (isAmmTrade && !ammRouter)}
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
        {tradeError && (
        <p role="alert" className="text-xs text-rose-500 font-medium text-center">
          {tradeError}
        </p>
        )}
      </div>
    </div>
  );
}
