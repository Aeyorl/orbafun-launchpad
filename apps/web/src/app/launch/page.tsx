'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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
import { formatUsdDirect, formatNativeUsdc, shortenAddress, ipfsToGateway, tokenEmoji } from '@/lib/utils';
import { useArcReceiptFallback } from '@/lib/use-arc-receipt';
import { useAuth } from '@/lib/use-auth';
import { api } from '@/lib/api';
import { ImageUploader } from '@/components/ImageUploader';
import toast from 'react-hot-toast';
import { ChartBar, Globe, LinkSimple, NotePencil, Palette, WarningCircle } from '@phosphor-icons/react';

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

  const validateForm = () => {
    setError('');
    if (!name.trim()) {
      setError('Token name is required');
      return false;
    }
    if (!symbol.trim()) {
      setError('Ticker symbol is required');
      return false;
    }
    if (symbol.trim().length > 10) {
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
      chainId: ARC_CHAIN_ID,
    });
  };

  const launchingRef = useRef(false);
  const handleLaunch = async () => {
    if (launchingRef.current) return;
    if (!validateForm()) return;
    launchingRef.current = true;
    setTxAction('launch');
    writeContract({
      address: CONTRACTS.TOKEN_FACTORY,
      abi: TOKEN_FACTORY_ABI,
      functionName: 'createToken',
      args: [name.trim(), symbol.trim().toUpperCase(), image, description],
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
      } catch { /* fallback */ }
      const topic = log.topics[1];
      if (topic) return `0x${topic.slice(-40)}` as `0x${string}`;
    }
    return null;
  };

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
        if (!authToken) return;
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
        console.warn('Failed to save token metadata:', err);
      }
    })();
  }, [launchConfirmed, banner, website, twitter, telegram, discord, address, receipt, getAuthToken, authenticate]);

  useEffect(() => {
    if (launchConfirmed) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      toast.success(`${symbol || 'Token'} launched successfully!`, { id: 'launch' });

      const tokenAddress = extractTokenAddress(receipt?.logs);
      if (tokenAddress) {
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
          created_tx_hash: receipt?.transactionHash || '',
          created_at: new Date().toISOString(),
        });
      }
      const destination = tokenAddress ? `/trade/${tokenAddress}` : '/explore?sort=newest';
      const t = setTimeout(() => router.push(destination), 1000);
      return () => clearTimeout(t);
    }
  }, [launchConfirmed, router, queryClient]);

  // Step progression state
  const stepStatus = useMemo(() => {
    const hasName = name.trim().length > 0;
    const hasSymbol = symbol.trim().length > 0;
    const detailsDone = hasName && hasSymbol;
    const previewDone = detailsDone && (image.length > 0 || description.length > 0);
    return { detailsDone, previewDone };
  }, [name, symbol, image, description]);

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
          Configure and deploy your memecoin on Arc blockchain. Starts on the bonding curve at $4,000 MC and graduates to DEX at $30,000.
        </p>

        {/* STEP PROGRESSION INDICATOR */}
        <div className="flex items-center justify-center gap-3 pt-3 text-xs font-mono">
          <div className={`flex items-center gap-1.5 ${stepStatus.detailsDone ? 'text-accent-blue font-bold' : 'text-text-muted'}`}>
            <span>{stepStatus.detailsDone ? '✓' : '01'}</span>
            <span>Details</span>
          </div>
          <span className="text-bg-border">──────</span>
          <div className={`flex items-center gap-1.5 ${stepStatus.previewDone ? 'text-accent-blue font-bold' : 'text-text-muted'}`}>
            <span>{stepStatus.previewDone ? '✓' : '02'}</span>
            <span>Preview</span>
          </div>
          <span className="text-bg-border">──────</span>
          <div className={`flex items-center gap-1.5 ${launchConfirmed ? 'text-emerald-500 font-bold' : 'text-text-muted'}`}>
            <span>03</span>
            <span>Launch</span>
          </div>
        </div>
      </div>

      {/* WALLET & GAS WARNINGS */}
      {!isConnected && (
        <div className="card bg-accent-blue/5 border border-accent-blue/30 text-xs text-accent-blue flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5"><LinkSimple size={15} aria-hidden="true" /> Connect your wallet to deploy a token on Arc</span>
        </div>
      )}
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

      {/* TWO-COLUMN STUDIO LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: FORM CONTROLS (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
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
              <Palette size={18} aria-hidden="true" /> Media & Branding
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
                  <label htmlFor="token-twitter" className="text-xs text-text-muted block">X / Twitter Handle</label>
                  <input
                    id="token-twitter"
                    type="text"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="e.g. arcdoge_coin"
                    maxLength={50}
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
                <span className="text-text-muted text-[11px]">One-time token deployment cost</span>
              </div>
              <div className="text-right font-mono">
                <span className="font-extrabold text-lg text-text-primary">{formatUsdDirect(CREATION_FEE)}</span>
                <span className="text-text-muted block text-[10px]">+$0.001 Arc gas</span>
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

        {/* RIGHT COLUMN: LIVE TOKEN PREVIEW (5 cols) */}
        <div className="lg:col-span-5 sticky top-20 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
            <span>Live Token Preview</span>
            <span className="text-[10px] text-accent-blue font-mono">Updates in real-time</span>
          </div>

          {/* Interactive Live Card Preview */}
          <div className="card space-y-3.5 bg-bg-card border border-bg-border shadow-subtle-2 relative overflow-hidden">
            {/* Banner preview overlay */}
            {banner && (
              <div className="h-20 -mx-5 -mt-5 mb-2 overflow-hidden bg-bg-base border-b border-bg-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ipfsToGateway(banner)} alt="Banner" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Token Header Identity */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-bg-base border border-bg-border flex items-center justify-center text-xl overflow-hidden flex-shrink-0 shadow-xs">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ipfsToGateway(image)} alt={symbol} className="w-full h-full object-cover" />
                ) : (
                  tokenEmoji(symbol || 'TOKEN')
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate">
                  <h3 className="font-bold text-base text-text-primary truncate">
                    {name.trim() || 'Your Token Name'}
                  </h3>
                  <span className="text-xs font-semibold text-text-muted flex-shrink-0">
                    ${symbol ? symbol.trim().toUpperCase() : 'SYMBOL'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <span className="w-1 h-1 rounded-full bg-emerald-500" />
                    Bonding
                  </span>
                  <span className="text-[10px] text-text-muted">
                    by {address ? shortenAddress(address) : '0x...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Price & MC */}
            <div className="flex items-baseline justify-between pt-2 border-t border-bg-border/60">
              <div>
                <div className="text-xl font-extrabold font-mono text-text-primary tabular-nums">
                  $0.00000400
                </div>
                <div className="text-[11px] text-text-muted font-medium">Starting Price</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-text-primary font-mono tabular-nums">
                  $4,000 MC
                </div>
                <div className="text-[11px] text-text-muted">Initial Cap</div>
              </div>
            </div>

            {/* Description Preview */}
            <div className="text-xs text-text-secondary leading-relaxed bg-bg-base/60 p-2.5 rounded-xl border border-bg-border/60 min-h-[50px]">
              {description.trim() ? (
                <p className="line-clamp-3">{description.trim()}</p>
              ) : (
                <p className="text-text-muted italic">Your token description will appear here...</p>
              )}
            </div>

            {/* Bonding curve status indicator */}
            <div className="bg-bg-base p-2.5 rounded-xl border border-bg-border space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-text-muted">Bonding Progress</span>
                <span className="font-bold text-accent-blue font-mono">0%</span>
              </div>
              <div className="w-full h-1.5 bg-bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent-blue w-0 rounded-full" />
              </div>
              <div className="text-[10px] text-text-muted text-right">
                $26.0K USDC to DEX graduation
              </div>
            </div>
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
