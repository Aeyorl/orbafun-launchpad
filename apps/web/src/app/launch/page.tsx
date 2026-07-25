'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, useReadContract, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { parseUnits, formatUnits, erc20Abi } from 'viem';
import { CONTRACTS, USDC_DECIMALS } from '@/lib/config';
import { formatUsdDirect, formatNativeUsdc } from '@/lib/utils';
import { useArcReceiptFallback } from '@/lib/use-arc-receipt';
import { ImageUploader } from '@/components/ImageUploader';
import toast from 'react-hot-toast';

const TOKEN_FACTORY_ABI = [
  {
    name: 'createToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'image', type: 'string' },
      { name: 'description', type: 'string' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
] as const;

const CREATION_FEE = 5; // 5 USDC

export default function LaunchPage() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  // Detect wallet on wrong network — otherwise every hook silently fails.
  const wrongNetwork = isConnected && chainId !== arcTestnet.id;
  // Track which step the in-flight tx belongs to: USDC approval (for the
  // 5 USDC creation fee pulled via transferFrom) or the actual createToken.
  const [txAction, setTxAction] = useState<'approve' | 'launch' | null>(null);
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  // Pin chainId so the receipt is fetched via our Arc transports.
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: arcTestnet.id,
  });
  const fallback = useArcReceiptFallback(txHash);
  const txConfirmed = isSuccess || fallback.confirmed;
  // Pin chainId on reads.
  const { data: balance } = useBalance({ address, chainId: arcTestnet.id });

  // The TokenFactory pulls the 5 USDC creation fee via transferFrom, so the
  // user must approve USDC spending first. Without this, createToken reverts.
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, CONTRACTS.TOKEN_FACTORY],
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });
  const feeAmount = parseUnits(String(CREATION_FEE), USDC_DECIMALS);
  const allowanceLoaded = usdcAllowance !== undefined;
  const needsApproval = !allowanceLoaded || usdcAllowance < feeAmount;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [error, setError] = useState('');

  const noGasMoney = isConnected && balance && balance.value === 0n;
  // balance.value is the NATIVE balance (18 decimals on Arc), so the fee
  // comparison must use 18-dec units, not the 6-dec ERC-20 view.
  const insufficientForFee =
    isConnected && balance && balance.value < parseUnits(String(CREATION_FEE), 18);

  const validateForm = () => {
    setError('');
    if (!name || !symbol) {
      setError('Name and symbol are required');
      return false;
    }
    if (symbol.length > 10) {
      setError('Symbol must be 10 characters or less');
      return false;
    }
    return true;
  };

  const handleApprove = async () => {
    if (!validateForm()) return;
    setTxAction('approve');
    writeContract({
      address: CONTRACTS.USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACTS.TOKEN_FACTORY, feeAmount],
      chainId: arcTestnet.id,
    });
  };

  const launchingRef = useRef(false);
  const handleLaunch = async () => {
    if (launchingRef.current) return; // prevent double-submit
    if (!validateForm()) return;
    launchingRef.current = true;
    setTxAction('launch');
    writeContract({
      address: CONTRACTS.TOKEN_FACTORY,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [name, symbol.toUpperCase(), image, description],
      chainId: arcTestnet.id,
    });
  };

  // Reset the guard when the tx completes or is reset.
  useEffect(() => {
    if (!isPending && !isConfirming) {
      launchingRef.current = false;
    }
  }, [isPending, isConfirming]);

  // After the approval confirms, refetch the allowance and reset the write
  // state so the button transitions to "Launch token".
  useEffect(() => {
    if (txConfirmed && txAction === 'approve') {
      refetchAllowance();
      reset();
      setTxAction(null);
    }
  }, [txConfirmed, txAction, refetchAllowance, reset]);

  // Redirect to explore page once the LAUNCH tx confirms (not the approval).
  const launchConfirmed = txConfirmed && txAction === 'launch';
  useEffect(() => {
    if (launchConfirmed) {
      toast.success(`${symbol || 'Token'} launched successfully!`, { id: 'launch' });
      const t = setTimeout(() => router.push('/explore?sort=newest'), 2000);
      return () => clearTimeout(t);
    }
  }, [launchConfirmed, router]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Launch a Token</h1>
        <p className="text-text-secondary">
          Fair launch on a bonding curve. Starts at $4.0K market cap, migrates
          to DEX at $25.0K.
        </p>
      </div>

      {/* Wallet state warnings */}
      {!isConnected && (
        <div className="card border-accent-blue/30 bg-accent-blue/5">
          <p className="text-sm text-accent-blue">
            🔗 Connect your wallet to launch a token
          </p>
        </div>
      )}
      {noGasMoney && (
        <div className="card border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">
            ⚠️ No USDC for gas. You need USDC to pay for transactions on Arc.
            Get testnet USDC from the{' '}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Circle faucet
            </a>
            .
          </p>
        </div>
      )}
      {insufficientForFee && !noGasMoney && (
        <div className="card border-accent-orange/30 bg-accent-orange/5">
          <p className="text-sm text-accent-orange">
            ⚠️ Insufficient USDC for creation fee ({CREATION_FEE} USDC required).
            Your balance: {balance ? formatNativeUsdc(balance.value) : '$0'}
          </p>
        </div>
      )}

      {/* Form */}
      <div className="card space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="token-name" className="text-sm font-medium mb-1 block">Token Name</label>
          <input
            id="token-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Arc Doge"
            maxLength={50}
            className="input"
          />
        </div>

        {/* Symbol */}
        <div>
          <label htmlFor="token-symbol" className="text-sm font-medium mb-1 block">Ticker Symbol</label>
          <input
            id="token-symbol"
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. ADOGE"
            maxLength={10}
            className="input uppercase"
          />
        </div>

        {/* Image upload */}
        <ImageUploader
          value={image}
          onChange={setImage}
          symbol={symbol}
        />

        {/* Description */}
        <div>
          <label htmlFor="token-description" className="text-sm font-medium mb-1 block">
            Description <span className="text-text-muted">(optional)</span>
          </label>
          <textarea
            id="token-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your token..."
            maxLength={280}
            rows={3}
            className="input resize-none"
          />
        </div>

        {/* Fee notice */}
        <div className="bg-bg-input rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Creation fee</span>
            <span className="font-semibold tabular-nums">{formatUsdDirect(CREATION_FEE)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-text-muted">Initial market cap</span>
            <span className="font-semibold tabular-nums">$4,000.00</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-text-muted">Graduation target</span>
            <span className="font-semibold tabular-nums">$25,000.00</span>
          </div>
        </div>

        {error && (
          <div role="alert" className="text-sm text-accent-red bg-accent-red/10 rounded-lg p-2">
            {error}
          </div>
        )}

        {/* Submit — approve USDC first (creation fee is pulled via
            transferFrom), then launch. */}
        {wrongNetwork ? (
          <button
            onClick={() => switchChain({ chainId: arcTestnet.id })}
            disabled={isSwitching}
            className="btn-primary w-full text-base py-3"
          >
            {isSwitching ? 'Switching…' : `Switch to Arc Testnet (${arcTestnet.id})`}
          </button>
        ) : needsApproval && !launchConfirmed ? (
          <button
            onClick={handleApprove}
            disabled={
              !isConnected ||
              isPending ||
              (isConfirming && !txConfirmed) ||
              !!noGasMoney ||
              !!insufficientForFee ||
              !name ||
              !symbol
            }
            className="btn-primary w-full text-base py-3"
          >
            {isPending
              ? 'Sending approval...'
              : isConfirming && !txConfirmed
              ? 'Confirming approval...'
              : `Approve ${CREATION_FEE} USDC creation fee`}
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={
              !isConnected ||
              isPending ||
              isConfirming ||
              launchConfirmed ||
              !!noGasMoney ||
              !!insufficientForFee ||
              !name ||
              !symbol
            }
            className="btn-primary w-full text-base py-3"
          >
            {isPending
              ? 'Sending transaction...'
              : isConfirming && !launchConfirmed
              ? 'Confirming on Arc...'
              : launchConfirmed
              ? '✓ Token launched! Redirecting...'
              : `Launch token (${CREATION_FEE} USDC fee)`}
          </button>
        )}

        {/* Fallback: if wagmi's receipt polling is stuck (rare now that we
            rotate between 4 Arc RPC providers), show a "Continue" link. */}
        {isConfirming && !txConfirmed && (
          <div className="text-xs text-text-muted text-center space-y-1">
            <p>Confirming on Arc… usually a few seconds.</p>
            <button
              onClick={() => router.push('/explore?sort=newest')}
              className="text-accent-blue underline hover:text-accent-blue/80"
            >
              Continue to Explore →
            </button>
          </div>
        )}
        {fallback.failed && (
          <div role="alert" className="text-sm text-accent-red bg-accent-red/10 rounded-lg p-2">
            Transaction failed on-chain. Please try again.
          </div>
        )}
      </div>

      {/* Economics info */}
      <div className="card">
        <h3 className="font-semibold mb-3">Launch Economics</h3>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <span className="text-accent-green">●</span> Total supply:{' '}
            <span className="font-medium text-text-primary">1,000,000,000 tokens</span>
          </p>
          <p>
            <span className="text-accent-green">●</span> 88% sold through the bonding curve
          </p>
          <p>
            <span className="text-accent-green">●</span> 12% reserved for DEX liquidity
          </p>
          <p>
            <span className="text-accent-green">●</span> 1% fee (0.5% creator / 0.5% protocol)
          </p>
          <p>
            <span className="text-accent-green">●</span> No presale, no team allocation
          </p>
        </div>
      </div>
    </div>
  );
}
