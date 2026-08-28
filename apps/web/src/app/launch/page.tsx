'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
  useReadContract,
  useSwitchChain,
} from 'wagmi';
import {
  parseUnits,
  erc20Abi,
  toEventSelector,
  decodeEventLog,
  type Log,
} from 'viem';
import { ARC_CHAIN_ID, ARC_NETWORK_NAME, CONTRACTS, USDC_DECIMALS } from '@/lib/config';
import { formatUsdDirect, formatNativeUsdc } from '@/lib/utils';
import { useArcReceiptFallback } from '@/lib/use-arc-receipt';
import { useAuth } from '@/lib/use-auth';
import { api, type TokenMetadata } from '@/lib/api';
import {
  recoverLaunchMetadataAuth,
  saveLaunchMetadataWithRetry,
  validateLaunchMetadata,
} from '@/lib/launch-metadata';
import { ImageUploader } from '@/components/ImageUploader';
import toast from 'react-hot-toast';
import { ChartBar, Globe, NotePencil, Palette, WarningCircle } from '@phosphor-icons/react';

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
const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function LaunchPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const wrongNetwork = isConnected && chainId !== ARC_CHAIN_ID;
  const [txAction, setTxAction] = useState<'approve' | 'launch' | null>(null);
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: ARC_CHAIN_ID,
  });
  const fallback = useArcReceiptFallback(txHash);
  const txConfirmed = isSuccess || fallback.confirmed;
  const { getAuthToken, authenticate } = useAuth();

  const { data: balance } = useBalance({ address, chainId: ARC_CHAIN_ID });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, CONTRACTS.TOKEN_FACTORY],
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  const feeAmount = parseUnits(String(CREATION_FEE), USDC_DECIMALS);
  const allowanceLoaded = usdcAllowance !== undefined;
  const needsApproval = !allowanceLoaded || usdcAllowance !== feeAmount;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');        // PFP sent on-chain
  const [banner, setBanner] = useState('');      // Banner stored off-chain
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [discord, setDiscord] = useState('');

  const [activeSocialFields, setActiveSocialFields] = useState<{
    twitter: boolean;
    telegram: boolean;
    website: boolean;
    discord: boolean;
  }>({
    twitter: false,
    telegram: false,
    website: false,
    discord: false,
  });

  const [error, setError] = useState('');

  const STORAGE_KEY = 'orba-launch-studio-form';

  // Restore on mount
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
      if (s.website) { setWebsite(s.website); setActiveSocialFields((f) => ({ ...f, website: true })); }
      if (s.twitter) { setTwitter(s.twitter); setActiveSocialFields((f) => ({ ...f, twitter: true })); }
      if (s.telegram) { setTelegram(s.telegram); setActiveSocialFields((f) => ({ ...f, telegram: true })); }
      if (s.discord) { setDiscord(s.discord); setActiveSocialFields((f) => ({ ...f, discord: true })); }
    } catch { /* ignore */ }
  }, []);

  // Persist form state
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name, symbol, description, image, banner, website, twitter, telegram, discord }),
      );
    } catch { /* ignore */ }
  }, [name, symbol, description, image, banner, website, twitter, telegram, discord]);

  const noGasMoney = isConnected && balance && balance.value === 0n;
  const insufficientForFee =
    isConnected && balance && balance.value < parseUnits(String(CREATION_FEE), 18);

  const validateForm = (): Partial<TokenMetadata> | null => {
    setError('');
    if (!name.trim()) {
      setError('Token name is required');
      return null;
    }
    if (!symbol.trim()) {
      setError('Ticker symbol is required');
      return null;
    }
    if (symbol.trim().length > 10) {
      setError('Symbol must be 10 characters or less');
      return null;
    }
    const validation = validateLaunchMetadata({
      banner,
      website,
      twitter,
      telegram,
      discord,
    });
    if (validation.error) {
      setError(validation.error);
      return null;
    }
    return validation.metadata;
  };

  const handleApprove = async () => {
    if (!validateForm()) return;
    setTxAction('approve');
    writeContract({
      address: CONTRACTS.USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACTS.TOKEN_FACTORY, feeAmount],
      chainId: ARC_CHAIN_ID,
    });
  };

  const launchingRef = useRef(false);
  const launchMetadataRef = useRef<Partial<TokenMetadata>>({});
  const handleLaunch = async () => {
    if (launchingRef.current) return;
    const metadata = validateForm();
    if (!metadata) return;
    launchMetadataRef.current = metadata;
    launchingRef.current = true;
    setTxAction('launch');
    writeContract({
      address: CONTRACTS.TOKEN_FACTORY,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [name.trim(), symbol.trim().toUpperCase(), image, description.trim()],
      chainId: ARC_CHAIN_ID,
    });
  };

  useEffect(() => {
    if (!isPending && !isConfirming) {
      launchingRef.current = false;
    }
  }, [isPending, isConfirming]);

  useEffect(() => {
    if (txConfirmed && txAction === 'approve') {
      refetchAllowance();
      reset();
      setTxAction(null);
    }
  }, [txConfirmed, txAction, refetchAllowance, reset]);

  const launchConfirmed = txConfirmed && txAction === 'launch';

  const extractTokenAddress = (
    logs: Pick<Log, 'data' | 'topics'>[] | undefined,
  ): `0x${string}` | null => {
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
      } catch { /* fallback */ }
      const topic = log.topics[1];
      if (topic) return `0x${topic.slice(-40)}` as `0x${string}`;
    }
    return null;
  };

  const launchFinalizedRef = useRef(false);
  useEffect(() => {
    if (!launchConfirmed || launchFinalizedRef.current) return;

    const receiptLogs = receipt?.logs?.length ? receipt.logs : fallback.logs;
    const tokenAddress = extractTokenAddress(receiptLogs);
    if (!tokenAddress) return;
    launchFinalizedRef.current = true;

    const finalizeLaunch = async () => {
      toast.success(`${symbol || 'Token'} launched successfully!`, { id: 'launch' });

      queryClient.setQueryData(['token', tokenAddress.toLowerCase()], {
        id: Date.now(),
        contract_address: tokenAddress.toLowerCase(),
        curve_address: tokenAddress.toLowerCase(),
        factory_address: CONTRACTS.TOKEN_FACTORY.toLowerCase(),
        transfer_policy: (
          process.env.NEXT_PUBLIC_UNCAPPED_TOKEN_FACTORY_ADDRESSES || ''
        )
          .toLowerCase()
          .split(',')
          .map((factory) => factory.trim())
          .includes(CONTRACTS.TOKEN_FACTORY.toLowerCase())
            ? 'uncapped'
            : 'legacy_capped',
        amm_pair_address: null,
        creator_wallet: (address || '').toLowerCase(),
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
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
        created_tx_hash: receipt?.transactionHash || txHash || '',
        created_at: new Date().toISOString(),
      });

      const metadata = launchMetadataRef.current;
      const hasMetadata = Object.values(metadata).some(Boolean);

      if (hasMetadata) {
        toast.loading('Saving token image and social links…', { id: 'metadata' });
        try {
          if (!address) throw new Error('Wallet disconnected before token metadata was saved');
          const authToken = await recoverLaunchMetadataAuth(getAuthToken, authenticate);
          const savedMetadata = await saveLaunchMetadataWithRetry(
            () => api.setTokenMetadata(
                tokenAddress,
                address,
                metadata,
                authToken,
              ),
            wait,
          );

          queryClient.setQueryData(
            ['token-metadata', tokenAddress.toLowerCase()],
            savedMetadata,
          );
          toast.success('Token image and social links saved', { id: 'metadata' });
        } catch (err) {
          console.error('Failed to save token metadata after launch:', err);
          toast.error(
            'Token launched, but its image/socials could not be saved. Open Token Info & About to retry.',
            { id: 'metadata', duration: 12_000 },
          );
        }
      }

      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      await wait(750);
      router.push(`/trade/${tokenAddress}`);
    };

    void finalizeLaunch();
  }, [launchConfirmed, receipt, fallback.logs, txHash, router, queryClient]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 lg:pb-12">
      {/* PAGE HERO HEADER */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Arc · USDC Native Fair Launch
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
          Token Launch Studio
        </h1>

        <p className="text-sm text-text-secondary max-w-xl mx-auto">
          Create and deploy on Arc Network
        </p>
      </div>

      {/* WALLET & GAS WARNINGS */}
      {noGasMoney && (
        <div className="card bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
          <WarningCircle size={15} weight="fill" aria-hidden="true" /> No USDC for gas. Get testnet USDC from the{' '}
          <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">
            Circle Faucet
          </a>
          .
        </div>
      )}
      {insufficientForFee && !noGasMoney && (
        <div className="card bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <WarningCircle size={15} weight="fill" aria-hidden="true" /> Insufficient USDC for creation fee ({CREATION_FEE} USDC required). Balance: {balance ? formatNativeUsdc(balance.value) : '$0'}
        </div>
      )}

      {/* LAUNCH FORM LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* FORM CONTROLS */}
        <div className="lg:col-span-12 space-y-5">
          {/* TOKEN DETAILS CARD */}
          <div className="card space-y-4 bg-bg-card border border-bg-border shadow-subtle-1">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2 border-b border-bg-border pb-2.5">
              <NotePencil size={18} aria-hidden="true" /> Token Details
            </h2>

            {/* Token Name */}
            <div className="space-y-1">
              <label htmlFor="token-name" className="text-xs font-semibold text-text-secondary flex justify-between">
                <span>Token Name <span className="text-rose-500">*</span></span>
                <span className="text-[11px] font-mono text-text-muted">{name.length}/50</span>
              </label>
              <input
                id="token-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Arc Doge"
                maxLength={50}
                className="input font-medium text-sm"
              />
            </div>

            {/* Symbol */}
            <div className="space-y-1">
              <label htmlFor="token-symbol" className="text-xs font-semibold text-text-secondary flex justify-between">
                <span>Ticker Symbol <span className="text-rose-500">*</span></span>
                <span className="text-[11px] font-mono text-text-muted">{symbol.length}/10</span>
              </label>
              <div className="relative">
                <input
                  id="token-symbol"
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. ADOGE"
                  maxLength={10}
                  className="input font-mono font-bold text-sm uppercase pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-text-muted">
                  $
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="token-description" className="text-xs font-semibold text-text-secondary flex justify-between">
                <span>Description <span className="text-text-muted font-normal">(optional)</span></span>
                <span className="text-[11px] font-mono text-text-muted">{description.length}/280</span>
              </label>
              <textarea
                id="token-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell the community what your token is about..."
                maxLength={280}
                rows={3}
                className="input text-xs resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* MEDIA UPLOADS CARD */}
          <div className="card space-y-4 bg-bg-card border border-bg-border shadow-subtle-1">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2 border-b border-bg-border pb-2.5">
              <Palette size={18} aria-hidden="true" /> Add media
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* PFP Upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary block">
                  Token Avatar (PFP)
                </label>
                <ImageUploader
                  value={image}
                  onChange={setImage}
                  symbol={symbol}
                  label="Upload Avatar"
                  shape="round"
                />
              </div>

              {/* Banner Upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary block">
                  Header Banner (3:1)
                </label>
                <ImageUploader
                  value={banner}
                  onChange={setBanner}
                  symbol={symbol}
                  label="Upload Banner"
                  shape="wide"
                />
              </div>
            </div>
          </div>

          {/* SOCIAL LINKS CARD */}
          <div className="card space-y-3 bg-bg-card border border-bg-border shadow-subtle-1">
            <div className="flex items-center justify-between border-b border-bg-border pb-2.5">
              <h2 className="text-base font-bold text-text-primary inline-flex items-center gap-2"><Globe size={18} aria-hidden="true" /> Social Links</h2>
              <span className="text-xs text-text-muted">(Optional)</span>
            </div>

            {/* Quick add toggle buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {!activeSocialFields.twitter && (
                <button
                  type="button"
                  onClick={() => setActiveSocialFields((f) => ({ ...f, twitter: true }))}
                  className="btn-secondary text-xs px-3 py-1 rounded-full flex items-center gap-1 font-medium"
                >
                  + Add X / Twitter
                </button>
              )}
              {!activeSocialFields.telegram && (
                <button
                  type="button"
                  onClick={() => setActiveSocialFields((f) => ({ ...f, telegram: true }))}
                  className="btn-secondary text-xs px-3 py-1 rounded-full flex items-center gap-1 font-medium"
                >
                  + Add Telegram
                </button>
              )}
              {!activeSocialFields.website && (
                <button
                  type="button"
                  onClick={() => setActiveSocialFields((f) => ({ ...f, website: true }))}
                  className="btn-secondary text-xs px-3 py-1 rounded-full flex items-center gap-1 font-medium"
                >
                  + Add Website
                </button>
              )}
              {!activeSocialFields.discord && (
                <button
                  type="button"
                  onClick={() => setActiveSocialFields((f) => ({ ...f, discord: true }))}
                  className="btn-secondary text-xs px-3 py-1 rounded-full flex items-center gap-1 font-medium"
                >
                  + Add Discord
                </button>
              )}
            </div>

            {/* Active Social Fields */}
            <div className="space-y-3 pt-2">
              {activeSocialFields.twitter && (
                <div className="space-y-1">
                  <label htmlFor="token-twitter" className="text-xs text-text-muted block">X / Twitter</label>
                  <input
                    id="token-twitter"
                    type="text"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="@arcdoge_coin or https://x.com/arcdoge_coin"
                    maxLength={200}
                    className="input text-xs"
                  />
                </div>
              )}

              {activeSocialFields.telegram && (
                <div className="space-y-1">
                  <label htmlFor="token-telegram" className="text-xs text-text-muted block">Telegram Link</label>
                  <input
                    id="token-telegram"
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="https://t.me/yourgroup"
                    maxLength={200}
                    className="input text-xs"
                  />
                </div>
              )}

              {activeSocialFields.website && (
                <div className="space-y-1">
                  <label htmlFor="token-website" className="text-xs text-text-muted block">Website URL</label>
                  <input
                    id="token-website"
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    maxLength={200}
                    className="input text-xs"
                  />
                </div>
              )}

              {activeSocialFields.discord && (
                <div className="space-y-1">
                  <label htmlFor="token-discord" className="text-xs text-text-muted block">Discord Invite</label>
                  <input
                    id="token-discord"
                    type="text"
                    value={discord}
                    onChange={(e) => setDiscord(e.target.value)}
                    placeholder="https://discord.gg/invite"
                    maxLength={200}
                    className="input text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* LAUNCH ECONOMICS CARD */}
          <div className="card space-y-3 bg-bg-card border border-bg-border shadow-subtle-1">
            <h2 className="text-base font-bold text-text-primary border-b border-bg-border pb-2.5 flex items-center gap-2">
              <ChartBar size={18} aria-hidden="true" /> Launch Economics
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-bg-input p-2.5 rounded-xl border border-bg-border/60">
                <span className="text-[10px] text-text-muted uppercase font-semibold block">Starting Market Cap</span>
                <span className="font-bold text-sm font-mono text-text-primary">$4,000</span>
              </div>
              <div className="bg-bg-input p-2.5 rounded-xl border border-bg-border/60">
                <span className="text-[10px] text-text-muted uppercase font-semibold block">Graduation Target</span>
                <span className="font-bold text-sm font-mono text-accent-blue">$30,000</span>
              </div>
              <div className="bg-bg-input p-2.5 rounded-xl border border-bg-border/60">
                <span className="text-[10px] text-text-muted uppercase font-semibold block">Total Supply</span>
                <span className="font-bold text-sm font-mono text-text-primary">1B Tokens</span>
              </div>
              <div className="bg-bg-input p-2.5 rounded-xl border border-bg-border/60">
                <span className="text-[10px] text-text-muted uppercase font-semibold block">Bonding Curve</span>
                <span className="font-bold text-sm font-mono text-text-primary">88% (880M)</span>
              </div>
              <div className="bg-bg-input p-2.5 rounded-xl border border-bg-border/60">
                <span className="text-[10px] text-text-muted uppercase font-semibold block">DEX Liquidity</span>
                <span className="font-bold text-sm font-mono text-text-primary">12% (120M)</span>
              </div>
              <div className="bg-bg-input p-2.5 rounded-xl border border-bg-border/60">
                <span className="text-[10px] text-text-muted uppercase font-semibold block">Trading Fee</span>
                <span className="font-bold text-sm font-mono text-text-primary">1.0% Split</span>
              </div>
            </div>

            {/* Bonding Curve Progression Bar Graphic */}
            <div className="bg-bg-input p-3 rounded-xl border border-bg-border/60 space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="text-text-muted">$4,000 MC Start</span>
                <span className="text-accent-blue font-bold">$30,000 DEX Graduation</span>
              </div>
              <div className="w-full h-2 bg-bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent-blue w-0 transition-all duration-500 rounded-full" />
              </div>
              <div className="flex justify-between items-center text-[10px] text-text-muted">
                <span>Fair launch bonding curve</span>
                <span>100% LP burned to dead address</span>
              </div>
            </div>
          </div>

          {/* LAUNCH COST & CTA CARD */}
          <div className="card space-y-3 bg-bg-card border border-bg-border shadow-subtle-1">
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-sm text-text-primary block">Creation Fee</span>
              </div>
              <div className="text-right font-mono">
                <span className="font-extrabold text-lg text-text-primary">{formatUsdDirect(CREATION_FEE)}</span>
              </div>
            </div>

            {error && (
              <div role="alert" className="text-xs text-rose-500 bg-rose-500/10 rounded-xl p-2.5 border border-rose-500/20 font-medium">
                ⚠️ {error}
              </div>
            )}

            {/* Action Buttons */}
            {!isConnected ? (
              <button disabled className="btn-secondary w-full py-3.5 text-sm font-bold rounded-xl opacity-60">
                Connect Wallet to Launch Token
              </button>
            ) : wrongNetwork ? (
              <button
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                disabled={isSwitching}
                className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
              >
                {isSwitching ? 'Switching Network…' : `Switch to ${ARC_NETWORK_NAME} (${ARC_CHAIN_ID})`}
              </button>
            ) : needsApproval && !launchConfirmed ? (
              <button
                onClick={handleApprove}
                disabled={
                  isPending ||
                  (isConfirming && !txConfirmed) ||
                  !!noGasMoney ||
                  !!insufficientForFee ||
                  !name.trim() ||
                  !symbol.trim()
                }
                className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
              >
                {isPending
                  ? 'Sending approval in wallet...'
                  : isConfirming && !txConfirmed
                  ? 'Confirming approval on Arc...'
                  : `Approve ${CREATION_FEE} USDC Creation Fee`}
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={
                  isPending ||
                  isConfirming ||
                  launchConfirmed ||
                  !!noGasMoney ||
                  !!insufficientForFee ||
                  !name.trim() ||
                  !symbol.trim()
                }
                className="btn-primary w-full py-3.5 text-sm font-bold rounded-xl shadow-sm"
              >
                {isPending
                  ? 'Confirming transaction in wallet...'
                  : isConfirming && !launchConfirmed
                  ? 'Deploying token on Arc...'
                  : launchConfirmed
                  ? '✓ Token launched! Redirecting…'
                  : `LAUNCH $${symbol ? symbol.trim().toUpperCase() : 'TOKEN'}`}
              </button>
            )}

            {isConfirming && !txConfirmed && (
              <div className="text-xs text-text-muted text-center space-y-1 animate-pulse">
                <p>Deploying on Arc blockchain (~0.5s block time)…</p>
              </div>
            )}
            {fallback.failed && (
              <div role="alert" className="text-xs text-rose-500 bg-rose-500/10 rounded-xl p-2.5 border border-rose-500/20 text-center font-medium">
                Transaction failed on-chain. Please try again.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* MOBILE STICKY LAUNCH CTA BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-base/95 backdrop-blur-md border-t border-bg-border p-3 shadow-subtle-3 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-text-muted uppercase font-semibold block">Creation Fee</span>
          <span className="font-bold text-sm font-mono text-text-primary">{formatUsdDirect(CREATION_FEE)} USDC</span>
        </div>

        {!isConnected ? (
          <button disabled className="btn-secondary text-xs px-4 py-2.5 rounded-full opacity-60">
            Connect Wallet
          </button>
        ) : wrongNetwork ? (
          <button
            onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
            className="btn-primary text-xs px-4 py-2.5 rounded-full font-bold"
          >
            Switch Network
          </button>
        ) : needsApproval && !launchConfirmed ? (
          <button
            onClick={handleApprove}
            disabled={isPending || !name.trim() || !symbol.trim()}
            className="btn-primary text-xs px-4 py-2.5 rounded-full font-bold"
          >
            Approve {CREATION_FEE} USDC
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={isPending || isConfirming || !name.trim() || !symbol.trim()}
            className="btn-primary text-xs px-5 py-2.5 rounded-full font-bold"
          >
            LAUNCH ${symbol ? symbol.trim().toUpperCase() : 'TOKEN'} →
          </button>
        )}
      </div>
    </div>
  );
}
