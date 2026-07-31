'use client';

import Link from 'next/link';

interface AgentBadgeProps {
  /** The agent's UUID (agent_id from the agents table) — used as the link target */
  agentUuid: string | null | undefined;
  /** Optional: show the agent name as a tooltip or inline */
  agentName?: string | null;
  /** Render as a link unless the badge already sits inside another link. */
  linkToAgent?: boolean;
}

/**
 * AgentBadge — a small inline badge that appears on token cards and headers
 * for tokens launched by an AI agent. Links to the agent's profile page.
 *
 * Only renders when `agentUuid` is provided (i.e. the token is agent-launched).
 */
export function AgentBadge({ agentUuid, agentName, linkToAgent = true }: AgentBadgeProps) {
  if (!agentUuid) return null;

  const title = agentName ? `Created by AI agent: ${agentName}` : 'AI-created token';
  const className = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold
    bg-indigo-500/10 text-indigo-600 dark:text-indigo-400
    border border-indigo-500/20 flex-shrink-0
    hover:bg-indigo-500/20 hover:border-indigo-500/30
    transition-colors leading-none`;
  const badge = (
    <>
      <span className="text-[11px] leading-none">🤖</span>
      <span>AI</span>
    </>
  );

  if (!linkToAgent) {
    return <span title={title} className={className}>{badge}</span>;
  }

  return (
    <Link
      href={`/agents/${agentUuid}`}
      title={title}
      className={className}
    >
      {badge}
    </Link>
  );
}
