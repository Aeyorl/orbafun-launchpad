'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount, useWriteContract } from 'wagmi';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { CONTRACTS, ARC_CHAIN_ID, USDC_DECIMALS } from '@/lib/config';
import { formatUsdc, formatPrice, shortenAddress, timeAgo } from '@/lib/utils';
import { useAuth } from '@/lib/use-auth';
import { parseUnits } from 'viem';

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
  const [activeTab, setActiveTab] = useState<'activity' | 'launches' | 'tips'>('activity');

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  const { data: tipsData } = useQuery({
    queryKey: ['agent-tips', agentId],
    queryFn: () => api.getAgentTips(agentId, 20, 0),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="card animate-pulse h-32" />
        <div className="card animate-pulse h-64" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="card text-center py-12">
        <h2 className="text-xl font-bold mb-2">Agent not found</h2>
        <Link href="/agents" className="text-accent hover:underline">
          ← Back to agents
        </Link>
      </div>
    );
  }

  const totalLaunches = agent.stats?.total_launches ?? 0;
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

    // Determine recipient: agent's wallet, or deployer wallet if none.
    const recipient = agent.wallet || '0x74E931264f0f83F6c22d263efD8aA719D5e7f337';
    if (!agent.wallet) {
      toast('Agent has no wallet — tipping platform deployer', { icon: 'ℹ️' });
    }

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
      // Step 1: Send USDC on-chain via wagmi (user signs the transfer).
      toast.loading('Sending USDC on-chain...', { id: 'tip-tx' });
      const txHash = await writeContractAsync({
        address: CONTRACTS.USDC,
        abi: [{
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        }],
        functionName: 'transfer',
        args: [recipient as `0x${string}`, BigInt(amountMicro)],
        chainId: ARC_CHAIN_ID,
      });

      // Step 2: Wait for the tx to be confirmed.
      toast.loading('Waiting for confirmation...', { id: 'tip-tx' });
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
        setTimeout(() => { clearInterval(check); reject(new Error('Confirmation timeout')); }, 30000);
      });

      // Step 3: Record the tip with the tx hash (API verifies on-chain).
      toast.loading('Recording tip...', { id: 'tip-tx' });
      await api.tipAgent(agentId, String(amountMicro), address, tipMessage || undefined, txHash, token);
      toast.success(`Tipped ${formatUsdc(String(amountMicro))} USDC!`, { id: 'tip-tx' });
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
    <div className="space-y-6">
      <Link href="/agents" className="text-sm text-text-secondary hover:text-accent">
        ← All agents
      </Link>

      {/* Agent header */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/30 to-purple-500/30 flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            {agent.description && (
              <p className="text-text-secondary mt-1">{agent.description}</p>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-text-secondary">
              <span>
                Created {new Date(agent.created_at).toLocaleDateString()}
              </span>
              {agent.wallet && (
                <span className="font-mono">
                  Wallet: {shortenAddress(agent.wallet)}
                </span>
              )}
              <span className={agent.active ? 'text-success' : 'text-error'}>
                {agent.active ? '● Active' : '● Inactive'}
              </span>
            </div>
          </div>
          {/* Tip button */}
          <button
            onClick={() => setShowTipForm(!showTipForm)}
            className="btn-primary text-sm px-4 py-2 flex-shrink-0"
          >
            Tip
          </button>
        </div>

        {/* Tip form */}
        {showTipForm && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-shrink-0">
                <label className="text-xs text-text-secondary block mb-1">Amount (USDC)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="input w-32"
                  placeholder="1.00"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-text-secondary block mb-1">Message (optional)</label>
                <input
                  type="text"
                  maxLength={280}
                  value={tipMessage}
                  onChange={(e) => setTipMessage(e.target.value)}
                  className="input w-full"
                  placeholder="Great work!"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleTip}
                  disabled={tipping || !address}
                  className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                >
                  {tipping ? 'Sending...' : 'Send Tip'}
                </button>
              </div>
            </div>
            {!address && (
              <p className="text-xs text-text-secondary mt-2">Connect your wallet to tip</p>
            )}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold">{totalLaunches}</div>
          <div className="text-xs text-text-secondary mt-1">Total Launches</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-success">{confirmedLaunches}</div>
          <div className="text-xs text-text-secondary mt-1">Confirmed</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold">{formatUsdc(totalSpent)}</div>
          <div className="text-xs text-text-secondary mt-1">USDC Spent</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-accent">{formatUsdc(totalTips)}</div>
          <div className="text-xs text-text-secondary mt-1">Tips Received</div>
        </div>
      </div>

      {/* Tabbed section: Activity / Launches / Tips */}
      <div className="card">
        <div className="flex gap-1 border-b border-border mb-4">
          {(['activity', 'launches', 'tips'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
              {tab === 'tips' && tips.length > 0 && (
                <span className="ml-1 text-xs text-text-secondary">({tips.length})</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'activity' && <AgentActivityFeed agentId={agentId} />}
        {activeTab === 'launches' && <AgentLaunches agentId={agentId} />}
        {activeTab === 'tips' && (
          tips.length === 0 ? (
            <p className="text-sm text-text-secondary py-4">
              No tips yet. Be the first to support this agent!
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tips.map((tip) => (
                <div key={tip.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {tip.from_wallet.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-text-secondary">
                        {shortenAddress(tip.from_wallet)}
                      </span>
                      <span className="text-sm font-bold text-accent">
                        +{formatUsdc(tip.amount)}
                      </span>
                    </div>
                    {tip.message && (
                      <p className="text-sm text-text-primary mt-1">{tip.message}</p>
                    )}
                    <span className="text-xs text-text-secondary">
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

/**
 * Unified activity feed — launches, trades, and tips in one timeline.
 */
function AgentActivityFeed({ agentId }: { agentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-activity', agentId],
    queryFn: () => api.getAgentActivity(agentId, 50, 0),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-bg-card rounded" />
        ))}
      </div>
    );
  }

  const activities = data?.activities || [];
  if (activities.length === 0) {
    return (
      <p className="text-sm text-text-secondary py-4">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="space-y-2 max-h-[32rem] overflow-y-auto">
      {activities.map((activity, i) => (
        <ActivityRow key={i} activity={activity} />
      ))}
    </div>
  );
}

function ActivityRow({ activity }: { activity: import('@/lib/api').AgentActivity }) {
  const { activity_type, created_at, payload } = activity;

  if (activity_type === 'launch') {
    return (
      <Link
        href={`/coin/${payload.token_address}`}
        className="flex items-center gap-3 p-3 rounded-lg hover:bg-bg-card transition-colors group"
      >
        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-lg flex-shrink-0">
          🚀
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="font-medium">Launched </span>
            <span className="font-medium group-hover:text-accent transition-colors">
              {payload.name} (${payload.symbol})
            </span>
          </div>
          <div className="text-xs text-text-secondary">
            Fee: {formatUsdc(payload.fee_paid || '0')} USDC
            {payload.status && payload.status !== 'confirmed' && (
              <span className="ml-2 capitalize text-warning">● {payload.status}</span>
            )}
          </div>
        </div>
        <span className="text-xs text-text-secondary flex-shrink-0">
          {timeAgo(created_at)}
        </span>
      </Link>
    );
  }

  if (activity_type === 'trade') {
    const isBuy = payload.trade_type === 'buy';
    return (
      <Link
        href={`/coin/${payload.token_address}`}
        className="flex items-center gap-3 p-3 rounded-lg hover:bg-bg-card transition-colors group"
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
          isBuy ? 'bg-success/20' : 'bg-error/20'
        }`}>
          {isBuy ? '📈' : '📉'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className={`font-medium ${isBuy ? 'text-success' : 'text-error'}`}>
              {isBuy ? 'Bought' : 'Sold'}
            </span>
            <span className="text-text-secondary"> on </span>
            <span className="font-mono text-xs group-hover:text-accent transition-colors">
              {payload.token_address?.slice(0, 8)}...
            </span>
          </div>
          <div className="text-xs text-text-secondary">
            {formatUsdc(payload.usdc_amount || '0')} USDC
            {payload.status && payload.status !== 'confirmed' && (
              <span className="ml-2 capitalize text-warning">● {payload.status}</span>
            )}
          </div>
        </div>
        <span className="text-xs text-text-secondary flex-shrink-0">
          {timeAgo(created_at)}
        </span>
      </Link>
    );
  }

  // tip
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg">
      <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-lg flex-shrink-0">
        💰
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <span className="font-medium">Received tip of </span>
          <span className="font-bold text-accent">{formatUsdc(payload.amount || '0')} USDC</span>
          <span className="text-text-secondary"> from </span>
          <span className="font-mono text-xs">{shortenAddress(payload.from_wallet || '')}</span>
        </div>
        {payload.message && (
          <div className="text-xs text-text-secondary mt-0.5">"{payload.message}"</div>
        )}
      </div>
      <span className="text-xs text-text-secondary flex-shrink-0">
        {timeAgo(created_at)}
      </span>
    </div>
  );
}

/**
 * Fetch and display the agent's launched tokens via the public endpoint.
 */
function AgentLaunches({ agentId }: { agentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-launches', agentId],
    queryFn: () => api.getAgentLaunches(agentId, 50, 0),
    enabled: !!agentId,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="animate-pulse space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-bg-card rounded" />)}</div>;
  }

  const launches = data?.launches || [];
  if (launches.length === 0) {
    return (
      <div className="text-sm text-text-secondary py-4">
        <p>This agent has not launched any tokens yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {launches.map((launch) => (
        <Link
          key={launch.token_address}
          href={`/coin/${launch.token_address}`}
          className="flex items-center justify-between p-3 rounded-lg hover:bg-bg-card transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center text-sm font-bold">
              {launch.symbol?.charAt(0) || '?'}
            </div>
            <div>
              <div className="font-medium group-hover:text-accent transition-colors">
                {launch.name} <span className="text-text-secondary">(${launch.symbol})</span>
              </div>
              <div className="text-xs text-text-secondary">
                {new Date(launch.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="text-right">
            {launch.price && (
              <div className="text-sm font-mono">
                ${formatPrice(launch.price)}
              </div>
            )}
            {launch.market_cap && (
              <div className="text-xs text-text-secondary">
                MC: ${formatPrice(launch.market_cap)}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
