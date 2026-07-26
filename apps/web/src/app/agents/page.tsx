'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatUsdc } from '@/lib/utils';
import { useAuth } from '@/lib/use-auth';

export default function AgentsPage() {
  const { address } = useAccount();
  const { getAuthToken, authenticate, authenticating, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [templateCategory, setTemplateCategory] = useState<string | undefined>();
  const [leaderboardMetric, setLeaderboardMetric] = useState<'launches' | 'volume' | 'tips'>('launches');
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const limit = 24;

  const { data, isLoading } = useQuery({
    queryKey: ['agents', search, offset],
    queryFn: () => api.listAgents(limit, offset, search || undefined),
    refetchInterval: 60_000,
  });

  const { data: templatesData } = useQuery({
    queryKey: ['templates', templateCategory],
    queryFn: () => api.listTemplates(6, 0, templateCategory),
    refetchInterval: 120_000,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['agent-leaderboard', leaderboardMetric],
    queryFn: () => api.getAgentLeaderboard(leaderboardMetric, 5),
    refetchInterval: 60_000,
  });

  // Agents deployed by the connected wallet (self-serve). Only fetched when
  // the user is authenticated + has a wallet.
  const { data: myAgentsData, refetch: refetchMyAgents } = useQuery({
    queryKey: ['my-deployed-agents', address],
    queryFn: () => api.listMyDeployedAgents(20, 0, getAuthToken(), address),
    enabled: !!address,
    refetchInterval: 60_000,
  });

  const agents = data?.agents || [];
  const total = data?.total || 0;
  const hasMore = offset + limit < total;
  const hasPrev = offset > 0;
  const templates = templatesData?.templates || [];
  const leaderboard = leaderboardData?.agents || [];
  const myAgents = myAgentsData?.agents || [];

  const categories = ['general', 'trend', 'trader', 'community'];

  const handleDeploy = async (templateId: number, templateName: string) => {
    if (!address) {
      toast.error('Connect your wallet first');
      return;
    }

    // Admin-only endpoint — requires auth token (or x-wallet in insecure mode)
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

    setDeployingId(templateId);
    try {
      const result = await api.deployTemplate(
        templateId,
        { name: `${templateName} Agent` },
        token,
        address,
      );
      toast.success(`Agent deployed! API key: ${result.apiKey.slice(0, 12)}...`);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deploy failed';
      toast.error(msg);
    } finally {
      setDeployingId(null);
    }
  };

  const leaderboardMetricLabel = (m: string) => {
    switch (m) {
      case 'launches': return 'Launches';
      case 'volume': return 'Volume';
      case 'tips': return 'Tips';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">AI Agent Marketplace</h1>
        <p className="text-sm text-text-secondary mt-1">
          Deploy autonomous agents that launch and trade tokens on Arc
        </p>
      </div>

      {/* Templates section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold">Agent Templates</h2>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setTemplateCategory(undefined)}
              className={`badge ${!templateCategory ? 'badge-success' : 'badge-neutral'}`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setTemplateCategory(cat)}
                className={`badge ${templateCategory === cat ? 'badge-success' : 'badge-neutral'} capitalize`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-secondary text-sm">
              No templates yet. Admins can create templates via the API.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="card hover:border-accent/40 transition-colors flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/30 to-purple-500/30 flex items-center justify-center text-sm font-bold">
                      {tpl.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold">{tpl.name}</h3>
                      <span className="text-xs text-text-secondary capitalize">{tpl.category}</span>
                    </div>
                  </div>
                  <span className="text-xs text-text-secondary">
                    {tpl.deploy_count} deploys
                  </span>
                </div>
                {tpl.description && (
                  <p className="text-sm text-text-secondary line-clamp-2 mb-3 flex-1">
                    {tpl.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs text-text-secondary">
                    Limit: {formatUsdc(tpl.daily_limit)}/day
                  </span>
                  <button
                    onClick={() => handleDeploy(tpl.id, tpl.name)}
                    disabled={deployingId === tpl.id || authenticating}
                    className="btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
                  >
                    {deployingId === tpl.id ? 'Deploying...' : 'Deploy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard + Agents grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Leaderboard sidebar */}
        <div className="lg:col-span-1">
          <div className="card sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold">Top Agents</h2>
            </div>
            {/* Metric switcher */}
            <div className="flex gap-1 mb-3">
              {(['launches', 'volume', 'tips'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLeaderboardMetric(m)}
                  className={`text-xs px-2 py-1 rounded ${leaderboardMetric === m ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-bg-card'}`}
                >
                  {leaderboardMetricLabel(m)}
                </button>
              ))}
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-text-secondary">No agents yet.</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((agent, i) => (
                  <Link
                    key={agent.agent_id}
                    href={`/agents/${agent.agent_id}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-card transition-colors"
                  >
                    <span className={`text-sm font-bold w-5 ${i < 3 ? 'text-accent' : 'text-text-secondary'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{agent.name}</div>
                      <div className="text-xs text-text-secondary">
                        {leaderboardMetric === 'launches' && `${agent.confirmed_launches || '0'} launches`}
                        {leaderboardMetric === 'volume' && `${formatUsdc(agent.total_volume || '0')} vol`}
                        {leaderboardMetric === 'tips' && `${formatUsdc(agent.total_tips || '0')} tipped`}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Agents grid */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">All Agents</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search agents..."
              className="input max-w-xs"
              aria-label="Search agents by name or description"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card animate-pulse h-40" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-text-secondary">No agents found.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {agents.map((agent) => (
                  <Link
                    key={agent.agent_id}
                    href={`/agents/${agent.agent_id}`}
                    className="card hover:border-accent/40 transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/30 to-purple-500/30 flex items-center justify-center text-lg font-bold">
                          {agent.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold group-hover:text-accent transition-colors">
                            {agent.name}
                          </h3>
                          <p className="text-xs text-text-secondary">
                            {new Date(agent.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className="badge badge-success">Active</span>
                    </div>

                    {agent.description && (
                      <p className="text-sm text-text-secondary line-clamp-2 mb-3">
                        {agent.description}
                      </p>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold">
                          {agent.confirmed_launches || agent.stats?.confirmed_launches || '0'}
                        </div>
                        <div className="text-xs text-text-secondary">Launches</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">
                          {agent.total_trades || '0'}
                        </div>
                        <div className="text-xs text-text-secondary">Trades</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">
                          {formatUsdc(agent.total_spent || agent.stats?.total_spent || '0')}
                        </div>
                        <div className="text-xs text-text-secondary">Spent</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {(hasPrev || hasMore) && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={!hasPrev}
                    className="btn-secondary disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-text-secondary">
                    {offset + 1}–{Math.min(offset + limit, total)} of {total}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={!hasMore}
                    className="btn-secondary disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
