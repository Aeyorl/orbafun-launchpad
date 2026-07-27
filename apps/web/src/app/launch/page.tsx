'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, useReadContract, useSwitchChain } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { parseUnits, formatUnits, erc20Abi, maxUint256, toEventSelector, decodeEventLog, type Log } from 'viem';
import { CONTRACTS, USDC_DECIMALS } from '@/lib/config';
import { formatUsdDirect, formatNativeUsdc } from '@/lib/utils';
import { useArcReceiptFallback } from '@/lib/use-arc-receipt';
import { useAuth } from '@/lib/use-auth';
import { api } from '@/lib/api';
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

// TokenFactory.TokenCreated event — used to extract the new token address
// from the launch tx receipt so we can POST the off-chain banner URI.
const TOKEN_CREATED_EVENT = {
  type: 'event',
  name: 'TokenCreated',
  inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'curve', type: 'address', indexed: true },
    { name: 'creator', type: 'address', indexed: true },
    { name: 'name', type: 'string', indexed: false },
    { name: 'symbol', type: 'string', indexed: false },
    { name: 'image', type: 'string', indexed: false },
    { name: 'createdAt', type: 'uint256', indexed: false },
  ],
} as const;

const CREATION_FEE = 5; // 5 USDC

export default function LaunchPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  // Detect wallet on wrong network — otherwise every hook silently fails.
  const wrongNetwork = isConnected && chainId !== arcTestnet.id;
  // Track which step the in-flight tx belongs to: USDC approval (for the
  // 5 USDC creation fee pulled via transferFrom) or the actual createToken.
  const [txAction, setTxAction] = useState<'approve' | 'launch' | null>(null);
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  // Pin chainId so the receipt is fetched via our Arc transports.
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: arcTestnet.id,
  });
  const fallback = useArcReceiptFallback(txHash);
  const txConfirmed = isSuccess || fallback.confirmed;
  const { getAuthToken, authenticate } = useAuth();
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
  const [image, setImage] = useState('');        // pfp — sent on-chain as `image`
  const [banner, setBanner] = useState('');      // banner — stored off-chain in token_metadata
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [discord, setDiscord] = useState('');
  const [showSocials, setShowSocials] = useState(false);
  const [error, setError] = useState('');

  // Auto-expand socials if any field has restored values
  useEffect(() => {
    if (website || twitter || telegram || discord) {
      setShowSocials(true);
    }
  }, [website, twitter, telegram, discord]);

  // Persist form state to sessionStorage so mobile browsers don't lose
  // PFP/banner/fields when the page is backgrounded and restored.
  const STORAGE_KEY = 'orba-launch-form';

  // Restore on mount.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.name) setName(s.name);
      if (s.symbol) setSymbol(s.symbol);
      if (s.description) setDescription(s.description);
      if (s.image) setImage(s.image);
      if (s.banner) setBanner(s.banner);
      if (s.website) setWebsite(s.website);
      if (s.twitter) setTwitter(s.twitter);
      if (s.telegram) setTelegram(s.telegram);
      if (s.discord) setDiscord(s.discord);
    } catch { /* ignore corrupt storage */ }
  }, []);

  // Save on every change.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name, symbol, description, image, banner, website, twitter, telegram, discord }),
      );
    } catch { /* quota exceeded — ignore */ }
  }, [name, symbol, description, image, banner, website, twitter, telegram, discord]);

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
      args: [CONTRACTS.TOKEN_FACTORY, parseUnits(String(CREATION_FEE), USDC_DECIMALS)],
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

  // Extract the newly launched token address from the receipt's TokenCreated
  // event so we can persist the off-chain banner URI to token_metadata.
  const extractTokenAddress = (logs: Log[] | undefined): `0x${string}` | null => {
    if (!logs || logs.length === 0) return null;
    const eventTopic = toEventSelector(
      'TokenCreated(address,address,address,string,string,string,uint256)',
    );
    for (const log of logs) {
      if (log.topics[0] !== eventTopic) continue;
      try {
        const decoded = decodeEventLog({
          abi: [TOKEN_CREATED_EVENT],
          data: log.data,
          topics: log.topics,
        });
        return decoded.args.token as `0x${string}`;
      } catch {
        // fall through — try the indexed topic directly as a fallback
      }
      // Fallback: token is the first indexed topic (topics[1]).
      const topic = log.topics[1];
      if (topic) return `0x${topic.slice(-40)}` as `0x${string}`;
    }
    return null;
  };

  // After launch confirms, persist off-chain metadata (banner + social links)
  // to token_metadata. Best-effort, non-blocking — the token is already
  // launched on-chain. Authenticates with the wallet if needed, then POSTs
  // whatever optional fields the user filled in.
  const metadataSavedRef = useRef(false);
  useEffect(() => {
    if (!launchConfirmed || metadataSavedRef.current) return;
    const hasMetadata = banner || website || twitter || telegram || discord;
    if (!hasMetadata || !address) {
      metadataSavedRef.current = true;
      return;
    }
    const tokenAddress = extractTokenAddress(receipt?.logs);
    if (!tokenAddress) {
      metadataSavedRef.current = true;
      return;
    }
    metadataSavedRef.current = true;
    (async () => {
      try {
        let authToken = getAuthToken();
        if (!authToken) {
          await authenticate();
          authToken = getAuthToken();
        }
        if (!authToken) return; // user declined auth — metadata stays unset
        await api.setTokenMetadata(
          tokenAddress,
          address,
          {
            banner: banner || undefined,
            website: website || undefined,
            twitter: twitter || undefined,
            telegram: telegram || undefined,
            discord: discord || undefined,
          },
          authToken,
        );
      } catch (err) {
        // Non-fatal — token is already launched; metadata just won't display.
        console.warn('Failed to save token metadata:', err);
      }
    })();
  }, [launchConfirmed, banner, website, twitter, telegram, discord, address, receipt, getAuthToken, authenticate]);

  useEffect(() => {
    if (launchConfirmed) {
      // Clear the persisted form state on successful launch.
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

      toast.success(`${symbol || 'Token'} launched successfully!`, { id: 'launch' });

      const tokenAddress = extractTokenAddress(receipt?.logs);
      if (tokenAddress) {
        // Seed React Query cache immediately so /coin/0x... loads INSTANTLY
        // without waiting for the indexer or showing any error screen.
        queryClient.setQueryData(['token', tokenAddress.toLowerCase()], {
          id: Date.now(),
          contract_address: tokenAddress.toLowerCase(),
          curve_address: tokenAddress.toLowerCase(),
          amm_pair_address: null,
          creator_wallet: (address || '').toLowerCase(),
          name,
          symbol,
          description: description || null,
          image: image || null,
          price: '0.000004',
          market_cap: '4000.000000',
          volume_24h: '0.000000',
          real_usdc: '0',
          tokens_sold: '0',
          creator_fees_accrued: '0',
          protocol_fees_accrued: '0',
          status: 'active',
          graduated_at: null,
          lp_burned: null,
          created_block: '0',
          created_tx_hash: receipt?.transactionHash || '',
          created_at: new Date().toISOString(),
        });
      }
      const destination = tokenAddress
        ? `/trade/${tokenAddress}`
        : '/explore?sort=newest';
      const t = setTimeout(() => router.push(destination), 1000);
      return () => clearTimeout(t);
    }
  }, [launchConfirmed, router, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Launch a Token</h1>
        <p className="text-text-secondary">
          Fair launch on a bonding curve. Starts at $4.0K market cap, migrates
          to DEX at $30.0K.
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

        {/* Pfp upload (sent on-chain as the token's `image`) */}
        <ImageUploader
          value={image}
          onChange={setImage}
          symbol={symbol}
          label="Add Pfp"
          shape="round"
        />

        {/* Banner upload (stored off-chain in token_metadata) */}
        <ImageUploader
          value={banner}
          onChange={setBanner}
          symbol={symbol}
          label="Add Banner"
          shape="wide"
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

        {/* Social links — collapsable accordion matching pump.fun design */}
        <div className="border-t border-bg-border pt-4">
          <button
            type="button"
            onClick={() => setShowSocials(!showSocials)}
            className="flex items-center justify-between w-full text-left font-medium text-sm hover:opacity-80 transition-opacity py-1"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>Add social links</span>
              <span className="text-text-muted text-xs font-normal">(Optional)</span>
            </span>
            <svg
              className={`w-4 h-4 text-text-muted transition-transform duration-200 ${showSocials ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showSocials && (
            <div className="space-y-3 pt-3">
              <div>
                <label htmlFor="token-website" className="text-xs text-text-muted block mb-1">Website</label>
                <input
                  id="token-website"
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  maxLength={200}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="token-twitter" className="text-xs text-text-muted block mb-1">Twitter / X</label>
                <input
                  id="token-twitter"
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="handle (without @)"
                  maxLength={50}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="token-telegram" className="text-xs text-text-muted block mb-1">Telegram</label>
                <input
                  id="token-telegram"
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="https://t.me/yourgroup"
                  maxLength={200}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="token-discord" className="text-xs text-text-muted block mb-1">Discord</label>
                <input
                  id="token-discord"
                  type="text"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                  placeholder="https://discord.gg/invite"
                  maxLength={200}
                  className="input"
                />
              </div>
            </div>
          )}
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
            <span className="font-semibold tabular-nums">$30,000.00</span>
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
