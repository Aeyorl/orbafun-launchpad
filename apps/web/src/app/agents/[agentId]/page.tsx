'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useWriteContract } from 'wagmi';
import toast from 'react-hot-toast';
import { api, AgentActivity } from '@/lib/api';
import { CONTRACTS, ARC_CHAIN_ID } from '@/lib/config';
import { formatUsdc, formatPrice, shortenAddress, timeAgo } from '@/lib/utils';
import { useAuth } from '@/lib/use-auth';

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.agentId as string;
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { getAuthToken, authenticate, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [tipAmount, setTipAmount] = useState('1');
  const [tipMessage, setTipMessage] = useState('');
  const [tipping, setTipping] = useState(false);
  const [showTipForm, setShowTipForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'activity' | 'launches' | 'strategy' | 'tips'>('activity');

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    enabled: !!agentId,
    refetchInterval: 15_000,
  });

  const { data: tipsData } = useQuery({
    queryKey: ['agent-tips', agentId],
    queryFn: () => api.getAgentTips(agentId, 20, 0),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="card h-40 bg-bg-card border border-bg-border rounded-2xl" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-20 bg-bg-card border border-bg-border rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-md mx-auto card text-center py-12 space-y-4 bg-bg-card border border-bg-border">
        <div className="text-4xl">🤖</div>
        <h2 className="text-xl font-bold text-text-primary">Agent Not Found</h2>
        <p className="text-xs text-text-muted">The requested autonomous agent ID could not be retrieved from the indexer.</p>
        <Link href="/agents" className="btn-primary text-xs px-4 py-2 rounded-full font-bold inline-block">
          ← Return to Agent Marketplace
        </Link>
      </div>
    );
  }

  const confirmedLaunches = agent.stats?.confirmed_launches ?? 0;
  const totalSpent = agent.stats?.total_spent || '0';
  const tips = tipsData?.tips || [];
  const totalTips = tipsData?.total_amount || '0';

  const handleTip = async () => {
    if (!address) {
      toast.error('Connect your wallet first');
      return;
    }

    const amountMicro = Math.round(parseFloat(tipAmount) * 1_000_000);
    if (isNaN(amountMicro) || amountMicro <= 0) {
      toast.error('Enter a valid tip amount');
      return;
    }

    const recipient = agent.wallet || '0x74E931264f0f83F6c22d263efD8aA719D5e7f337';

    let token = getAuthToken();
    if (!token && !isAuthenticated) {
      try {
        await authenticate();
        token = getAuthToken();
      } catch {
        toast.error('Authentication failed');
        return;
      }
    }

    setTipping(true);
    try {
      toast.loading('Sending USDC on Arc...', { id: 'tip-tx' });
      const txHash = await writeContractAsync({
        address: CONTRACTS.USDC,
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [recipient as `0x${string}`, BigInt(amountMicro)],
        chainId: ARC_CHAIN_ID,
      });

      toast.loading('Waiting for Arc block confirmation...', { id: 'tip-tx' });
      await new Promise<void>((resolve, reject) => {
        const check = setInterval(async () => {
          try {
            const receipt = await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api'}/rpc`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getTransactionReceipt',
                params: [txHash],
                id: 1,
              }),
            });
            const data = await receipt.json();
            if (data.result?.status === '0x1') {
              clearInterval(check);
              resolve();
            } else if (data.result) {
              clearInterval(check);
              reject(new Error('Transaction reverted'));
            }
          } catch {
            // Keep polling
          }
        }, 2000);
        setTimeout(() => {
          clearInterval(check);
          reject(new Error('Confirmation timeout'));
        }, 30000);
      });

      toast.loading('Recording tip...', { id: 'tip-tx' });
      await api.tipAgent(agentId, String(amountMicro), address, tipMessage || undefined, txHash, token);
      toast.success(`Tipped ${formatUsdc(String(amountMicro))} USDC to ${agent.name}!`, { id: 'tip-tx' });
      setTipMessage('');
      setShowTipForm(false);
      queryClient.invalidateQueries({ queryKey: ['agent-tips', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tip failed';
      toast.error(msg, { id: 'tip-tx' });
    } finally {
      setTipping(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* BACK NAVIGATION */}
      <Link href="/agents" className="text-xs font-semibold text-text-muted hover:text-accent-blue inline-flex items-center gap-1">
        ← Back to Agent Marketplace
      </Link>

      {/* AGENT IDENTITY HEADER CARD */}
      <div className="card bg-bg-card border border-bg-border shadow-subtle-1 p-6 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-3xl font-bold text-accent-blue shadow-xs flex-shrink-0">
              🤖
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">{agent.name}</h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  ● ACTIVE
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
                {agent.description || 'Autonomous trading & launch agent operating on Arc bonding curve contracts.'}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-mono text-text-muted">
                <span>Created {new Date(agent.created_at).toLocaleDateString()}</span>
                <span>•</span>
                <span>
                  Wallet: {agent.wallet ? shortenAddress(agent.wallet) : 'Platform Deployer'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowTipForm(!showTipForm)}
            className="btn-primary text-xs px-4 py-2.5 rounded-full font-bold shadow-xs flex items-center gap-1.5 flex-shrink-0"
          >
            <span>💰 Tip Agent</span>
          </button>
        </div>

        {/* TIP FORM ACCORDION */}
        {showTipForm && (
          <div className="pt-4 border-t border-bg-border space-y-3 bg-bg-input p-4 rounded-xl">
            <div className="font-bold text-xs text-text-primary">Send USDC Tip to Agent</div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-4">
                <label className="text-[11px] text-text-muted block mb-1">Tip Amount (USDC)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="input text-xs font-mono font-bold"
                  placeholder="1.00"
                />
              </div>
              <div className="sm:col-span-8">
                <label className="text-[11px] text-text-muted block mb-1">Support Message (optional)</label>
                <input
                  type="text"
                  maxLength={280}
                  value={tipMessage}
                  onChange={(e) => setTipMessage(e.target.value)}
                  className="input text-xs"
                  placeholder="Keep up the great trades!"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowTipForm(false)}
                className="btn-secondary text-xs px-3 py-1.5 rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={handleTip}
                disabled={tipping || !address}
                className="btn-primary text-xs px-4 py-1.5 rounded-full font-bold shadow-xs"
              >
                {tipping ? 'Confirming on Arc…' : 'Send USDC Tip'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* METRICS DASHBOARD GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card bg-bg-card border border-bg-border text-center p-3.5 rounded-xl">
          <div className="text-xl font-extrabold font-mono text-text-primary">{confirmedLaunches}</div>
          <div className="text-[11px] text-text-muted font-medium mt-0.5">Tokens Launched</div>
        </div>
        <div className="card bg-bg-card border border-bg-border text-center p-3.5 rounded-xl">
          <div className="text-xl font-extrabold font-mono text-accent-blue">{formatUsdc(totalSpent)}</div>
          <div className="text-[11px] text-text-muted font-medium mt-0.5">USDC Deployed</div>
        </div>
        <div className="card bg-bg-card border border-bg-border text-center p-3.5 rounded-xl">
          <div className="text-xl font-extrabold font-mono text-text-primary">{agent.total_trades || 0}</div>
          <div className="text-[11px] text-text-muted font-medium mt-0.5">Total Trades</div>
        </div>
        <div className="card bg-bg-card border border-bg-border text-center p-3.5 rounded-xl">
          <div className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{formatUsdc(totalTips)}</div>
          <div className="text-[11px] text-text-muted font-medium mt-0.5">Tips Received</div>
        </div>
      </div>

      {/* TABBED SECTION: ACTIVITY / LAUNCHES / STRATEGY / TIPS */}
      <div className="card bg-bg-card border border-bg-border p-5 rounded-2xl space-y-4">
        <div className="flex border-b border-bg-border gap-2 text-xs font-semibold pb-1 overflow-x-auto">
          {(['activity', 'launches', 'strategy', 'tips'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-2 rounded-lg transition-all capitalize flex-shrink-0 ${
                activeTab === tab
                  ? 'bg-accent-blue text-white font-bold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {tab}
              {tab === 'tips' && tips.length > 0 && ` (${tips.length})`}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS */}
        {activeTab === 'activity' && <AgentActivityFeed agentId={agentId} />}

        {activeTab === 'launches' && <AgentLaunches agentId={agentId} />}

        {activeTab === 'strategy' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-sm text-text-primary">Agent Operational Strategy</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-bg-input p-3.5 rounded-xl border border-bg-border space-y-1">
                <span className="font-bold text-accent-blue uppercase font-mono block">Volume & Momentum Detection</span>
                <p className="text-text-secondary leading-relaxed">
                  Monitors Arc RPC block transactions to identify high-momentum tokens crossing threshold liquidity.
                </p>
              </div>
              <div className="bg-bg-input p-3.5 rounded-xl border border-bg-border space-y-1">
                <span className="font-bold text-accent-blue uppercase font-mono block">Automated Launch Logic</span>
                <p className="text-text-secondary leading-relaxed">
                  Triggers token launches via TokenFactory contract when trend triggers are validated.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tips' && (
          tips.length === 0 ? (
            <div className="text-xs text-text-muted py-6 text-center">
              No tips received yet. Be the first to tip this agent!
            </div>
          ) : (
            <div className="space-y-3">
              {tips.map((tip) => (
                <div key={tip.id} className="flex items-start gap-3 p-3 rounded-xl bg-bg-input border border-bg-border text-xs">
                  <div className="w-8 h-8 rounded-full bg-accent-blue/20 text-accent-blue font-bold flex items-center justify-center font-mono flex-shrink-0">
                    {tip.from_wallet.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-text-primary">
                        {shortenAddress(tip.from_wallet)}
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatUsdc(tip.amount)} USDC
                      </span>
                    </div>
                    {tip.message && (
                      <p className="text-text-secondary mt-1 italic font-medium">"{tip.message}"</p>
                    )}
                    <span className="text-[10px] text-text-muted block mt-1">
                      {timeAgo(tip.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/* ─── UNIFIED ACTIVITY FEED ─────────────────────────────────────────── */

function AgentActivityFeed({ agentId }: { agentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-activity', agentId],
    queryFn: () => api.getAgentActivity(agentId, 50, 0),
    enabled: !!agentId,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-bg-input rounded-xl" />
        ))}
      </div>
    );
  }

  const activities = data?.activities || [];
  if (activities.length === 0) {
    return <div className="text-xs text-text-muted py-6 text-center">No recorded activity yet for this agent.</div>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {activities.map((act, i) => (
        <ActivityRow key={i} activity={act} />
      ))}
    </div>
  );
}

function ActivityRow({ activity }: { activity: AgentActivity }) {
  const { activity_type, created_at, payload } = activity;

  if (activity_type === 'launch') {
    return (
      <Link
        href={`/trade/${payload.token_address}`}
        className="flex items-center gap-3 p-3 rounded-xl bg-bg-input hover:bg-bg-hover transition-colors text-xs group"
      >
        <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
          🚀
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-text-primary group-hover:text-accent-blue transition-colors">
            Launched {payload.name} (${payload.symbol})
          </div>
          <div className="text-[11px] text-text-muted">Creation fee: {formatUsdc(payload.fee_paid || '0')} USDC</div>
        </div>
        <span className="text-[10px] text-text-muted font-mono">{timeAgo(created_at)}</span>
      </Link>
    );
  }

  if (activity_type === 'trade') {
    const isBuy = payload.trade_type === 'buy';
    return (
      <Link
        href={`/trade/${payload.token_address}`}
        className="flex items-center gap-3 p-3 rounded-xl bg-bg-input hover:bg-bg-hover transition-colors text-xs group"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
          isBuy ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'
        }`}>
          {isBuy ? '📈' : '📉'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-text-primary">
            <span className={isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              {isBuy ? 'Bought' : 'Sold'}
            </span>{' '}
            token on bonding curve
          </div>
          <div className="text-[11px] text-text-muted font-mono">Amount: {formatUsdc(payload.usdc_amount || '0')} USDC</div>
        </div>
        <span className="text-[10px] text-text-muted font-mono">{timeAgo(created_at)}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-input text-xs">
      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
        💰
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-text-primary">
          Received tip of <span className="text-emerald-600 dark:text-emerald-400">+{formatUsdc(payload.amount || '0')} USDC</span>
        </div>
        {payload.message && <div className="text-[11px] text-text-muted italic">"{payload.message}"</div>}
      </div>
      <span className="text-[10px] text-text-muted font-mono">{timeAgo(created_at)}</span>
    </div>
  );
}

function AgentLaunches({ agentId }: { agentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-launches', agentId],
    queryFn: () => api.getAgentLaunches(agentId, 50, 0),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 bg-bg-input rounded-xl" />)}</div>;
  }

  const launches = data?.launches || [];
  if (launches.length === 0) {
    return <div className="text-xs text-text-muted py-6 text-center">This agent has not launched any tokens yet.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {launches.map((launch) => (
        <Link
          key={launch.token_address}
          href={`/trade/${launch.token_address}`}
          className="p-3.5 rounded-xl bg-bg-input hover:bg-bg-hover transition-colors border border-bg-border flex items-center justify-between group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center font-bold text-accent-blue text-xs font-mono">
              ${launch.symbol?.slice(0, 3)}
            </div>
            <div>
              <div className="font-bold text-xs text-text-primary group-hover:text-accent-blue transition-colors">
                {launch.name}
              </div>
              <div className="text-[10px] text-text-muted font-mono">${launch.symbol}</div>
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            <div className="font-bold text-text-primary">${formatPrice(launch.market_cap || '4000')}</div>
            <div className="text-[10px] text-text-muted">Market Cap</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
