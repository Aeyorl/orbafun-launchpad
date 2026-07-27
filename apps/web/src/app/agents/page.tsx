'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import { api, Agent, AgentTemplate } from '@/lib/api';
import { formatUsdc, shortenAddress } from '@/lib/utils';
import { useAuth } from '@/lib/use-auth';

const CATEGORIES = ['all', 'trader', 'trend', 'launcher', 'community', 'general'];

export default function AgentsPage() {
  const { address } = useAccount();
  const { getAuthToken, authenticate, isAuthenticated, authenticating } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'launches' | 'volume' | 'tips'>('launches');
  const [deployModalTemplate, setDeployModalTemplate] = useState<AgentTemplate | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [customAgentName, setCustomAgentName] = useState('');

  const limit = 24;

  // List all deployed agents
  const { data, isLoading } = useQuery({
    queryKey: ['agents', search, offset],
    queryFn: () => api.listAgents(limit, offset, search || undefined),
    refetchInterval: 30_000,
  });

  // List agent templates
  const { data: templatesData } = useQuery({
    queryKey: ['templates', selectedCategory],
    queryFn: () => api.listTemplates(12, 0, selectedCategory === 'all' ? undefined : selectedCategory),
    refetchInterval: 60_000,
  });

  // Top agents leaderboard
  const { data: leaderboardData } = useQuery({
    queryKey: ['agent-leaderboard', leaderboardMetric],
    queryFn: () => api.getAgentLeaderboard(leaderboardMetric, 5),
    refetchInterval: 30_000,
  });

  const agents = data?.agents || [];
  const total = data?.total || 0;
  const hasMore = offset + limit < total;
  const hasPrev = offset > 0;
  const templates = templatesData?.templates || [];
  const leaderboard = leaderboardData?.agents || [];

  const handleDeployConfirm = async () => {
    if (!deployModalTemplate) return;
    if (!address) {
      toast.error('Connect your wallet first');
      return;
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

    setDeploying(true);
    try {
      const agentName = customAgentName.trim() || `${deployModalTemplate.name} Agent`;
      const result = await api.deployTemplate(
        deployModalTemplate.id,
        { name: agentName },
        token,
        address,
      );
      toast.success(`Agent "${agentName}" deployed! API Key generated.`, { id: 'deploy' });
      setDeployModalTemplate(null);
      setCustomAgentName('');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      toast.error(msg, { id: 'deploy' });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* HERO HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-bg-border pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-blue/10 text-accent-blue border border-accent-blue/20 mb-2">
            🤖 Autonomous Agent Network
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
            AI Agent Marketplace
          </h1>
          <p className="text-sm text-text-secondary mt-1 max-w-xl">
            Deploy autonomous agents that launch tokens, detect market trends, and trade automatically on Arc blockchain.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (templates.length > 0) setDeployModalTemplate(templates[0]);
              else toast('Select a template below to deploy an agent.');
            }}
            className="btn-primary text-xs px-4 py-2.5 rounded-full font-bold shadow-xs flex items-center gap-1.5"
          >
            <span>+ Deploy Agent</span>
          </button>
        </div>
      </div>

      {/* CATEGORY TAB FILTERS & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs font-semibold">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-lg transition-all capitalize flex-shrink-0 ${
                selectedCategory === cat
                  ? 'bg-accent-blue text-white font-bold shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs w-full">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search agents by name or strategy..."
            className="input text-xs pl-8 py-2 rounded-full border border-bg-border focus:border-accent-blue"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
            🔍
          </span>
        </div>
      </div>

      {/* FEATURED / READY-TO-DEPLOY TEMPLATES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <span>⚡ Deployable Agent Templates</span>
          </h2>
          <span className="text-xs text-text-muted">{templates.length} available</span>
        </div>

        {templates.length === 0 ? (
          <div className="card text-center py-8 bg-bg-card border border-bg-border text-text-muted text-xs">
            No agent templates available in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="card bg-bg-card border border-bg-border shadow-subtle-1 hover:border-accent-blue/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-lg font-bold text-accent-blue flex-shrink-0">
                        🤖
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-text-primary">{tpl.name}</h3>
                        <span className="text-[11px] font-mono text-accent-blue uppercase font-semibold">
                          {tpl.category}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono bg-bg-input px-2 py-0.5 rounded-full border border-bg-border text-text-muted">
                      {tpl.deploy_count || 0} deploys
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary line-clamp-2 mb-3 leading-relaxed">
                    {tpl.description || 'Autonomous trading & launch agent configured for Arc bonding curve markets.'}
                  </p>
                </div>

                <div className="pt-3 border-t border-bg-border/60 flex items-center justify-between text-xs">
                  <span className="text-text-muted text-[11px] font-mono">
                    Cap: {formatUsdc(tpl.daily_limit)}/day
                  </span>
                  <button
                    onClick={() => {
                      setDeployModalTemplate(tpl);
                      setCustomAgentName(`${tpl.name} Agent`);
                    }}
                    className="btn-primary text-xs px-3.5 py-1.5 rounded-full font-bold shadow-xs"
                  >
                    Deploy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MAIN TWO-COLUMN SECTION: LEADERBOARD & ALL ACTIVE AGENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* TOP AGENTS LEADERBOARD (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card bg-bg-card border border-bg-border shadow-subtle-1 sticky top-20">
            <div className="flex items-center justify-between border-b border-bg-border pb-3 mb-3">
              <h2 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                <span>🏆 Top Agents</span>
              </h2>
              <div className="flex gap-1 text-[11px] font-semibold">
                {(['launches', 'volume', 'tips'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setLeaderboardMetric(m)}
                    className={`px-2 py-1 rounded-md capitalize transition-colors ${
                      leaderboardMetric === m
                        ? 'bg-accent-blue text-white font-bold'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-6">
                No ranked agents yet. Be the first to deploy an agent!
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((agent, i) => (
                  <Link
                    key={agent.agent_id}
                    href={`/agents/${agent.agent_id}`}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-bg-hover transition-colors group"
                  >
                    <span
                      className={`font-bold font-mono text-xs w-4 text-center ${
                        i < 3 ? 'text-accent-blue font-extrabold text-sm' : 'text-text-muted'
                      }`}
                    >
                      #{i + 1}
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      🤖
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-text-primary truncate group-hover:text-accent-blue transition-colors">
                        {agent.name}
                      </div>
                      <div className="text-[10px] font-mono text-text-muted">
                        {leaderboardMetric === 'launches' && `${agent.confirmed_launches || 0} launches`}
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

        {/* ALL ACTIVE AGENTS GRID (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">
              All Deployed Agents
            </h2>
            <span className="text-xs text-text-muted">{total} active agents</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card bg-bg-card animate-pulse h-40 border border-bg-border" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="card text-center py-12 bg-bg-card border border-bg-border space-y-2">
              <div className="text-2xl">🤖</div>
              <div className="font-bold text-sm text-text-primary">No agents found</div>
              <p className="text-xs text-text-muted">Deploy an agent from the templates above to launch automated strategies.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {agents.map((agent) => (
                  <AgentCard key={agent.agent_id} agent={agent} />
                ))}
              </div>

              {/* PAGINATION */}
              {(hasPrev || hasMore) && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={!hasPrev}
                    className="btn-secondary text-xs px-3.5 py-1.5 rounded-full disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-text-muted font-mono">
                    Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={!hasMore}
                    className="btn-secondary text-xs px-3.5 py-1.5 rounded-full disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DEPLOYMENT MODAL */}
      {deployModalTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card bg-bg-card border border-bg-border max-w-md w-full p-6 space-y-4 shadow-subtle-3 rounded-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-bg-border pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-sm font-bold text-accent-blue">
                  🤖
                </div>
                <h3 className="font-bold text-base text-text-primary">
                  Deploy {deployModalTemplate.name}
                </h3>
              </div>
              <button
                onClick={() => setDeployModalTemplate(null)}
                className="text-text-muted hover:text-text-primary text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-text-secondary block">Agent Instance Name</label>
                <input
                  type="text"
                  value={customAgentName}
                  onChange={(e) => setCustomAgentName(e.target.value)}
                  placeholder="e.g. Trend Alpha Bot #1"
                  className="input text-xs font-medium"
                />
              </div>

              <div className="bg-bg-input p-3 rounded-xl border border-bg-border space-y-1">
                <div className="flex justify-between font-mono">
                  <span className="text-text-muted">Template Strategy</span>
                  <span className="font-bold text-accent-blue uppercase">{deployModalTemplate.category}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-text-muted">Daily Spending Cap</span>
                  <span className="font-bold text-text-primary">{formatUsdc(deployModalTemplate.daily_limit)} USDC</span>
                </div>
              </div>

              <p className="text-text-muted text-[11px] leading-relaxed">
                Deploying will register an autonomous agent wallet and generate an API access key for executing trading & launch strategies on Arc.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeployModalTemplate(null)}
                className="btn-secondary w-full py-2 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeployConfirm}
                disabled={deploying || authenticating}
                className="btn-primary w-full py-2 text-xs font-bold rounded-xl shadow-xs"
              >
                {deploying ? 'Deploying…' : 'Confirm Deployment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── REUSABLE AGENT CARD COMPONENT ─────────────────────────────────── */

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="card bg-bg-card border border-bg-border shadow-subtle-1 hover:border-accent-blue/50 transition-all flex flex-col justify-between group">
      <div>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-base font-bold text-accent-blue flex-shrink-0">
              🤖
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-text-primary group-hover:text-accent-blue transition-colors truncate">
                {agent.name}
              </h3>
              <div className="text-[11px] font-mono text-text-muted">
                {agent.wallet ? shortenAddress(agent.wallet) : 'Arc Deployer'}
              </div>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            <span className="w-1 h-1 rounded-full bg-emerald-500" />
            ACTIVE
          </span>
        </div>

        {agent.description && (
          <p className="text-xs text-text-secondary line-clamp-2 mb-3 leading-relaxed">
            {agent.description}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-1 bg-bg-input p-2 rounded-xl border border-bg-border/60 text-center font-mono">
          <div>
            <div className="text-[10px] text-text-muted">Launches</div>
            <div className="font-bold text-xs text-text-primary">
              {agent.confirmed_launches || agent.stats?.confirmed_launches || '0'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted">Trades</div>
            <div className="font-bold text-xs text-text-primary">
              {agent.total_trades || '0'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted">Spent</div>
            <div className="font-bold text-xs text-accent-blue">
              {formatUsdc(agent.total_spent || agent.stats?.total_spent || '0')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/agents/${agent.agent_id}`}
            className="btn-secondary w-full text-center py-1.5 text-xs font-bold rounded-xl"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
