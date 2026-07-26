import { API_URL } from './config';

// API client for the NestJS backend.
// All requests go through this — centralizes error handling and base URL.

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Build headers for an authenticated write request.
 * Uses x-auth-token (wallet signature auth) if available.
 * Falls back to x-wallet for testnet/dev when AUTH_ALLOW_INSECURE=true.
 */
function authHeaders(authToken?: string | null, wallet?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['x-auth-token'] = authToken;
  } else if (wallet) {
    // Fallback for testnet when AUTH_ALLOW_INSECURE=true on the API
    headers['x-wallet'] = wallet;
  }
  return headers;
}

export interface Token {
  id: number;
  contract_address: string;
  curve_address: string;
  amm_pair_address: string | null;
  creator_wallet: string;
  name: string;
  symbol: string;
  description: string | null;
  image: string | null;
  price: string;
  market_cap: string;
  volume_24h: string;
  real_usdc: string;
  tokens_sold: string;
  creator_fees_accrued: string;
  protocol_fees_accrued: string;
  status: string;
  graduated_at: string | null;
  lp_burned: string | null;
  created_block: string;
  created_tx_hash: string;
  created_at: string;
}

export interface Trade {
  id: number;
  token_id: number;
  wallet: string;
  type: string;
  usdc_amount: string;
  token_amount: string;
  price: string;
  market_cap_after: string;
  real_usdc_after: string;
  tokens_sold_after: string;
  tx_hash: string;
  block_number: string;
  log_index: number;
  timestamp: string;
}

export interface TokenListResponse {
  tokens: Token[];
  total: number;
}

export interface TradeListResponse {
  trades: Trade[];
  total: number;
}

export interface Holder {
  wallet: string;
  balance: string;       // 18-dec token amount (as string)
  percentage: string;    // 0-100
}

export interface HolderListResponse {
  holders: Holder[];
  total: number;
}

export interface Message {
  id: number;
  token_id: number;
  wallet: string;
  content: string;
  tx_hash: string | null;
  created_at: string;
}

export interface MessageListResponse {
  messages: Message[];
  hasMore: boolean;
}

export interface TokenMetadata {
  token_address: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  description: string | null;
  banner: string | null;
}

export interface UserProfile {
  wallet: string;
  username: string | null;
  avatar: string | null;
  tokens_launched: number;
  total_volume_usdc: string;
  created_at: string;
  launched_tokens: TokenListResponse;
  trade_stats: {
    total_trades: number;
    total_buys: number;
    total_sells: number;
    total_usdc_volume: string;
  };
}

export type SortOption = 'newest' | 'market_cap' | 'volume';
export type StatusFilter = 'active' | 'graduated' | 'all';

export const api = {
  // Tokens
  getStats: async (): Promise<{
    total_tokens: number;
    active_tokens: number;
    graduated_tokens: number;
    volume_24h: string;
  }> => {
    const res = await fetch(`${API_URL}/tokens/stats`, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`getStats failed: ${res.status}`);
    return res.json();
  },

  listTokens: (params: {
    sort?: SortOption;
    status?: StatusFilter;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.sort) qs.set('sort', params.sort);
    if (params.status) qs.set('status', params.status);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.search) qs.set('search', params.search);
    return fetchApi<TokenListResponse>(`/tokens?${qs.toString()}`);
  },

  getToken: (address: string) =>
    fetchApi<Token>(`/tokens/${address.toLowerCase()}`),

  getTokenTrades: (
    address: string,
    params: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}
  ) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.order) qs.set('order', params.order);
    return fetchApi<TradeListResponse>(
      `/tokens/${address.toLowerCase()}/trades?${qs.toString()}`
    );
  },

  getTokenHolders: (address: string, limit = 20) =>
    fetchApi<HolderListResponse>(
      `/tokens/${address.toLowerCase()}/holders?limit=${limit}`
    ),

  // Token metadata (social links, website, description)
  getTokenMetadata: async (address: string): Promise<TokenMetadata> => {
    const res = await fetch(`${API_URL}/tokens/${address.toLowerCase()}/metadata`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`getTokenMetadata failed: ${res.status}`);
    return res.json();
  },

  setTokenMetadata: async (
    address: string,
    wallet: string,
    input: Partial<TokenMetadata>,
    authToken?: string | null,
  ): Promise<TokenMetadata> => {
    const res = await fetch(`${API_URL}/tokens/${address.toLowerCase()}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(authToken, wallet) },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`setTokenMetadata failed: ${res.status}`);
    return res.json();
  },

  // Messages (per-token chat)
  getMessages: (address: string, limit = 50, before?: number) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    if (before) qs.set('before', String(before));
    return fetchApi<MessageListResponse>(
      `/tokens/${address.toLowerCase()}/messages?${qs.toString()}`
    );
  },

  postMessage: (address: string, wallet: string, content: string, txHash?: string, authToken?: string | null) =>
    fetchApi<Message>(`/tokens/${address.toLowerCase()}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, txHash }),
      headers: authHeaders(authToken, wallet),
    }),

  // Favorites (watchlist)
  listFavorites: (wallet: string, limit = 20, offset = 0, authToken?: string | null) =>
    fetchApi<{ tokens: Token[]; total: number }>(
      `/favorites?limit=${limit}&offset=${offset}`,
      { headers: authHeaders(authToken, wallet) }
    ),

  addFavorite: (wallet: string, tokenAddress: string, authToken?: string | null) =>
    fetchApi<any>(`/favorites/${tokenAddress.toLowerCase()}`, {
      method: 'POST',
      headers: authHeaders(authToken, wallet),
    }),

  removeFavorite: (wallet: string, tokenAddress: string, authToken?: string | null) =>
    fetchApi<{ removed: boolean }>(`/favorites/${tokenAddress.toLowerCase()}`, {
      method: 'DELETE',
      headers: authHeaders(authToken, wallet),
    }),

  checkFavorite: (wallet: string, tokenAddress: string, authToken?: string | null) =>
    fetchApi<{ favorited: boolean }>(`/favorites/${tokenAddress.toLowerCase()}`, {
      headers: authHeaders(authToken, wallet),
    }),

  // Users
  getUserProfile: (wallet: string) =>
    fetchApi<UserProfile>(`/users/${wallet.toLowerCase()}`),

  // Leaderboard
  getLeaderboard: (type: 'top_creators' | 'top_gainers' | 'top_volume', limit = 20) =>
    fetchApi<any[]>(`/leaderboard?type=${type}&limit=${limit}`),

  // Agents
  listAgents: (limit = 20, offset = 0, search?: string) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));
    if (search) qs.set('search', search);
    return fetchApi<{ agents: Agent[]; total: number }>(`/agents?${qs.toString()}`);
  },

  getAgent: (agentId: string) =>
    fetchApi<Agent>(`/agents/${agentId}`),

  getAgentLaunches: (agentId: string, limit = 20, offset = 0) =>
    fetchApi<{ launches: AgentLaunch[]; total: number }>(
      `/agents/${agentId}/launches?limit=${limit}&offset=${offset}`,
    ),

  // Agent templates (marketplace)
  listTemplates: (limit = 20, offset = 0, category?: string) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));
    if (category) qs.set('category', category);
    return fetchApi<{ templates: AgentTemplate[]; total: number }>(`/agents/templates?${qs.toString()}`);
  },

  getTemplate: (id: number) =>
    fetchApi<AgentTemplate>(`/agents/templates/${id}`),

  /**
   * Self-serve deploy — any authenticated wallet can deploy an agent from a
   * template. The authenticated wallet becomes the agent's owner. Uses the
   * /deploy-self endpoint (AuthGuard, not AdminGuard).
   */
  deployTemplate: (id: number, overrides?: { name?: string; description?: string }, authToken?: string | null, wallet?: string) =>
    fetchApi<{ agentId: string; apiKey: string; name: string }>(
      `/agents/templates/${id}/deploy-self`,
      {
        method: 'POST',
        body: JSON.stringify(overrides || {}),
        headers: authHeaders(authToken, wallet),
      },
    ),

  /** Admin-only deploy (legacy endpoint, kept for platform operators). */
  deployTemplateAdmin: (id: number, overrides?: { name?: string; description?: string }, authToken?: string | null, wallet?: string) =>
    fetchApi<{ agentId: string; apiKey: string; name: string }>(
      `/agents/templates/${id}/deploy`,
      {
        method: 'POST',
        body: JSON.stringify(overrides || {}),
        headers: authHeaders(authToken, wallet),
      },
    ),

  /** List agents deployed by the authenticated wallet (self-serve). */
  listMyDeployedAgents: (limit = 20, offset = 0, authToken?: string | null, wallet?: string) =>
    fetchApi<{ agents: DeployedAgent[]; total: number }>(
      `/agents/me/deployed?limit=${limit}&offset=${offset}`,
      { headers: authHeaders(authToken, wallet) },
    ),

  /** Toggle the autonomous executor on/off for an agent the caller owns. */
  toggleExecutor: (agentId: string, authToken?: string | null, wallet?: string) =>
    fetchApi<{ executorEnabled: boolean }>(
      `/agents/${agentId}/executor/toggle`,
      { method: 'POST', headers: authHeaders(authToken, wallet) },
    ),

  /** Get executor cooldown state + run counts for an agent (public). */
  getExecutorState: (agentId: string) =>
    fetchApi<{ executorEnabled: boolean; state: ExecutorStateEntry[] }>(
      `/agents/${agentId}/executor/state`,
    ),

  // Agent leaderboard
  getAgentLeaderboard: (metric: 'launches' | 'volume' | 'tips', limit = 10) =>
    fetchApi<{ metric: string; agents: Agent[] }>(`/agents/leaderboard?metric=${metric}&limit=${limit}`),

  // Agent tips
  getAgentTips: (agentId: string, limit = 20, offset = 0) =>
    fetchApi<{ tips: AgentTip[]; total: number; total_amount: string }>(
      `/agents/${agentId}/tips?limit=${limit}&offset=${offset}`,
    ),

  // Agent activity feed (unified timeline: launches + trades + tips)
  getAgentActivity: (agentId: string, limit = 20, offset = 0) =>
    fetchApi<{ activities: AgentActivity[]; total: number }>(
      `/agents/${agentId}/activity?limit=${limit}&offset=${offset}`,
    ),

  tipAgent: (agentId: string, amount: string, wallet: string, message?: string, txHash?: string, authToken?: string | null) =>
    fetchApi<AgentTip>(`/agents/${agentId}/tip`, {
      method: 'POST',
      body: JSON.stringify({ amount, message, txHash }),
      headers: authHeaders(authToken, wallet),
    }),

  // Referrals
  attributeReferral: (referrerWallet: string, wallet: string, authToken?: string | null) =>
    fetchApi<{ attributed: boolean; referrer_wallet: string; already: boolean }>(`/referrals/attribute`, {
      method: 'POST',
      body: JSON.stringify({ referrerWallet }),
      headers: authHeaders(authToken, wallet),
    }),

  getReferralStats: (wallet: string) =>
    fetchApi<{
      wallet: string;
      total_referred: number;
      active_referred: number;
      total_volume_usdc: string;
      reward_earned_usdc: string;
    }>(`/referrals/${wallet.toLowerCase()}`),

  getReferredWallets: (wallet: string, limit = 20, offset = 0) =>
    fetchApi<{
      referrals: Array<{
        referred_wallet: string;
        trade_count: number;
        total_volume_usdc: string;
        reward_earned_usdc: string;
        attributed_at: string;
        first_token_address: string | null;
      }>;
      total: number;
    }>(`/referrals/${wallet.toLowerCase()}/referred?limit=${limit}&offset=${offset}`),

  getReferrer: (wallet: string) =>
    fetchApi<{ referrer_wallet: string | null; attributed_at: string | null }>(
      `/referrals/${wallet.toLowerCase()}/referrer`,
    ),

  getTopReferrers: (limit = 20) =>
    fetchApi<Array<{
      referrer_wallet: string;
      total_referred: number;
      total_volume_usdc: string;
      reward_earned_usdc: string;
    }>>(`/referrals/leaderboard/top?limit=${limit}`),
};

export interface AgentTemplate {
  id: number;
  name: string;
  description: string | null;
  category: string;
  creator_wallet: string | null;
  daily_limit: string;
  monthly_limit: string;
  deploy_count: number;
  created_at: string;
}

export interface AgentTip {
  id: number;
  from_wallet: string;
  amount: string;
  tx_hash: string | null;
  message: string | null;
  created_at: string;
}

export interface AgentActivity {
  activity_type: 'launch' | 'trade' | 'tip';
  created_at: string;
  payload: {
    // Launch
    token_address?: string;
    name?: string;
    symbol?: string;
    image?: string | null;
    tx_hash?: string;
    status?: string;
    fee_paid?: string;
    // Trade
    trade_type?: 'buy' | 'sell';
    usdc_amount?: string;
    token_amount?: string;
    // Tip
    from_wallet?: string;
    amount?: string;
    message?: string | null;
  };
}

export interface AgentLaunch {
  token_address: string;
  tx_hash: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string | null;
  status: string;
  created_at: string;
  price: string | null;
  market_cap: string | null;
  token_status: string | null;
  real_usdc: string | null;
  tokens_sold: string | null;
}

export interface Agent {
  agent_id: string;
  name: string;
  description: string | null;
  wallet: string | null;
  owner_wallet?: string | null;
  daily_limit: string;
  monthly_limit: string;
  executor_enabled?: boolean;
  active: boolean;
  created_at: string;
  stats?: {
    total_launches: number;
    confirmed_launches: number;
    total_spent: string;
  };
  total_launches?: string;
  confirmed_launches?: string;
  total_spent?: string;
  total_trades?: string;
  total_volume?: string;
  total_tips?: string;
  metric_value?: string;
}

/** Agent deployed by the current user via self-serve deploy (GET /agents/me/deployed). */
export interface DeployedAgent {
  agent_id: string;
  name: string;
  description: string | null;
  wallet: string | null;
  daily_limit: string;
  monthly_limit: string;
  executor_enabled: boolean;
  active: boolean;
  created_at: string;
  launch_count: string;
  trade_count: string;
}

export interface ExecutorStateEntry {
  action: 'launch' | 'buy' | 'sell' | 'post';
  last_run_at: string | null;
  last_tx_hash: string | null;
  run_count: number;
  fail_count: number;
  last_error: string | null;
  updated_at: string;
}
