interface AgentBadgeProps {
  /** The agent's UUID (agent_id from the agents table) — used as the link target */
  agentUuid: string | null | undefined;
  /** Optional: show the agent name as a tooltip or inline */
  agentName?: string | null;
  /** Render as a link unless the badge already sits inside another link. */
  linkToAgent?: boolean;
}

/** Agent presentation is deliberately hidden until the feature is relaunched. */
export function AgentBadge(_props: AgentBadgeProps) {
  return null;
}
