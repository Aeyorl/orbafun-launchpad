import { createPublicClient, formatUnits, http, parseAbi } from 'viem';
import { API_URL, ARC_CHAIN, ARC_RPC_URLS } from './config';

// API client for the NestJS backend.
// All requests go through this — centralizes error handling and base URL.

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  factory_address: string | null;
  transfer_policy: 'legacy_capped' | 'uncapped';
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
  // Agent-launched token attributes
  is_agent: string;       // 'true' or 'false' — whether this token was launched by an AI agent
  agent_name: string | null;  // The agent's display name, if agent-launched
  agent_uuid: string | null;  // The agent's public UUID, if agent-launched
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
  wallet_tier: WalletTierSnapshot['key'] | null;
  wallet_tier_label: string | null;
  wallet_tier_calculated_at: string | null;
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
  last_activity_at: string;
  buy_count: number;
  sell_count: number;
  wallet_tier: WalletTierSnapshot['key'] | null;
  wallet_tier_label: string | null;
  wallet_tier_calculated_at: string | null;
}

export type MarketFlowWindow = '5m' | '1h' | '6h' | '24h';

export interface MarketFlow {
  window: MarketFlowWindow;
  price_change_pct: string;
  buy_count: number;
  sell_count: number;
  buy_volume_usdc: string;
  sell_volume_usdc: string;
  unique_buyers: number;
  unique_sellers: number;
  current_market_cap: string;
  all_time_high: string;
}

export interface HolderListResponse {
  holders: Holder[];
  total: number;
}

export interface RecentActivity {
  type: 'buy' | 'sell';
  wallet: string;
  usdc_amount: string;
  token_amount: string;
  tx_hash: string;
  block_number: string;
  log_index: number;
  timestamp: string;
  token_address: string;
  token_name: string;
  token_symbol: string;
  wallet_tier: WalletTierSnapshot['key'] | null;
  wallet_tier_label: string | null;
  wallet_tier_calculated_at: string | null;
}

export interface OhlcvCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleTimeframe = '10s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface Message {
  id: number;
  token_id: number;
  wallet: string;
  content: string;
  tx_hash: string | null;
  created_at: string;
  // Agent message attribution — populated when the message was posted by an AI agent
  is_agent_message?: boolean;
  agent_name?: string | null;
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
  banner: string | null;
}

export interface UserHolding {
  token: Token;
  balance: string;
  value_usdc: string;
  total_bought_usdc: string;
  total_sold_usdc: string;
  remaining_cost_usdc: string;
  realized_pnl_usdc: string;
  unrealized_pnl_usdc: string;
  total_pnl_usdc: string;
  roi_pct: string | null;
  basis_status: 'complete' | 'incomplete';
}

export interface UserHoldingsResponse {
  holdings: UserHolding[];
  total_value_usdc: string;
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

export interface UserPnlResponse {
  wallet: string;
  period: '7d' | '30d' | 'all';
  period_semantics: 'realized_events_in_period' | 'all_time_position_accounting';
  currency: 'USDC';
  amount_unit: 'micro_usdc';
  realized_pnl: string;
  unrealized_pnl: string | null;
  total_pnl: string | null;
  realized_roi_pct: string | null;
  unrealized_roi_pct: string | null;
  total_roi_pct: string | null;
  portfolio_value: string;
  remaining_cost_basis: string;
  total_bought: string;
  total_sold: string;
  buy_count: number;
  sell_count: number;
  open_positions: number;
  closed_positions: number;
  profitable_closed_positions: number;
  basis_status: 'complete' | 'incomplete';
  basis_scope: 'indexed_orba_trades';
  calculated_at: string;
}

export interface WalletTierSnapshot {
  key: 'shrimp' | 'fish' | 'dolphin' | 'whale';
  label: string;
  basis: 'orba_activity';
  calculated_at: string;
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

  getRecentActivity: (limit = 12) =>
    fetchApi<{ activity: RecentActivity[] }>(`/tokens/activity/recent?limit=${limit}`),

  listTokens: (params: {
    sort?: SortOption;
    status?: StatusFilter;
    is_agent?: string;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.sort) qs.set('sort', params.sort);
    if (params.status) qs.set('status', params.status);
    if (params.is_agent) qs.set('is_agent', params.is_agent);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.search) qs.set('search', params.search);
    return fetchApi<TokenListResponse>(`/tokens?${qs.toString()}`);
  },

  getToken: async (address: string): Promise<Token | null> => {
    try {
      const res = await fetchApi<Token>(`/tokens/${address.toLowerCase()}`);
      if (res && res.contract_address) return res;
    } catch (err) {
      console.warn(`[api] getToken API call for ${address} failed, attempting on-chain fallback:`, err);
    }
    // Direct on-chain fallback via Arc RPC — reads contract state directly from blockchain
    return await fetchTokenOnChainFallback(address);
  },

  getTokenTrades: async (
    address: string,
    params: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {}
  ): Promise<TradeListResponse> => {
    try {
      const qs = new URLSearchParams();
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.offset) qs.set('offset', String(params.offset));
      if (params.order) qs.set('order', params.order);
      return await fetchApi<TradeListResponse>(
        `/tokens/${address.toLowerCase()}/trades?${qs.toString()}`
      );
    } catch {
      return { trades: [], total: 0 };
    }
  },

  getTokenHolders: (address: string, limit = 20) =>
    fetchApi<HolderListResponse>(
      `/tokens/${address.toLowerCase()}/holders?limit=${limit}`
    ),

  getMarketFlow: (address: string, window: MarketFlowWindow = '24h') =>
    fetchApi<MarketFlow>(
      `/tokens/${address.toLowerCase()}/market-flow?window=${window}`
    ),

  getCandles: async (
    address: string,
    timeframe: CandleTimeframe = '5m',
    mode: 'price' | 'mcap' = 'price',
    limit = 500,
  ): Promise<OhlcvCandle[]> => {
    try {
      const qs = new URLSearchParams({
        timeframe,
        mode,
        limit: String(limit),
      });
      return await fetchApi<OhlcvCandle[]>(
        `/tokens/${address.toLowerCase()}/candles?${qs.toString()}`
      );
    } catch {
      return [];
    }
  },

  // Editable token metadata (social links, website, artwork)
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
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new ApiError(error.message || `setTokenMetadata failed: ${res.status}`, res.status);
    }
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

  getUserPnl: (wallet: string, period: '7d' | '30d' | 'all' = 'all') =>
    fetchApi<UserPnlResponse>(`/users/${wallet.toLowerCase()}/pnl?period=${period}`),

  getUserHoldings: (wallet: string) =>
    fetchApi<UserHoldingsResponse>(`/users/${wallet.toLowerCase()}/holdings`),

  getWalletTier: (wallet: string) =>
    fetchApi<WalletTierSnapshot>(`/users/${wallet.toLowerCase()}/tier`),

  // Leaderboard
  getLeaderboard: (type: 'top_creators' | 'top_gainers' | 'top_volume' | 'market_cap' | 'new', limit = 20) =>
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

const fallbackClient = createPublicClient({
  chain: ARC_CHAIN,
  transport: http(ARC_RPC_URLS[0]),
});

async function fetchTokenOnChainFallback(address: string): Promise<Token | null> {
  try {
    const tokenAddr = address.toLowerCase() as `0x${string}`;
    const tokenAbi = parseAbi([
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function bondingCurve() view returns (address)',
      'function maxWallet() view returns (uint256)',
    ]);
    const [name, symbol, curveAddress] = await Promise.all([
      fallbackClient.readContract({ address: tokenAddr, abi: tokenAbi, functionName: 'name' }),
      fallbackClient.readContract({ address: tokenAddr, abi: tokenAbi, functionName: 'symbol' }),
      fallbackClient.readContract({ address: tokenAddr, abi: tokenAbi, functionName: 'bondingCurve' }),
    ]);
    let transferPolicy: Token['transfer_policy'] = 'uncapped';
    try {
      await fallbackClient.readContract({
        address: tokenAddr,
        abi: tokenAbi,
        functionName: 'maxWallet',
      });
      transferPolicy = 'legacy_capped';
    } catch {
      // New token bytecode intentionally omits maxWallet().
    }

    let price = '0.000004';
    let marketCap = '4000.000000';
    let realUsdc = '0';
    let tokensSold = '0';
    let graduated = false;

    if (curveAddress && curveAddress !== '0x0000000000000000000000000000000000000000') {
      try {
        const curveAbi = parseAbi([
          'function price() view returns (uint256)',
          'function marketCap() view returns (uint256)',
          'function realUsdc() view returns (uint256)',
          'function tokensSold() view returns (uint256)',
          'function graduated() view returns (bool)',
        ]);
        const [rawPrice, rawMc, rawUsdc, rawSold, isGrad] = await Promise.all([
          fallbackClient.readContract({ address: curveAddress, abi: curveAbi, functionName: 'price' }),
          fallbackClient.readContract({ address: curveAddress, abi: curveAbi, functionName: 'marketCap' }),
          fallbackClient.readContract({ address: curveAddress, abi: curveAbi, functionName: 'realUsdc' }),
          fallbackClient.readContract({ address: curveAddress, abi: curveAbi, functionName: 'tokensSold' }),
          fallbackClient.readContract({ address: curveAddress, abi: curveAbi, functionName: 'graduated' }),
        ]);
        // BondingCurve.price() is USD per token scaled by 1e18.
        price = formatUnits(rawPrice, 18);
        marketCap = (Number(rawMc) / 1e6).toFixed(6);
        realUsdc = rawUsdc.toString();
        tokensSold = rawSold.toString();
        graduated = isGrad;
      } catch (err) {
        console.warn(`[api] Curve read failed for ${curveAddress}:`, err);
      }
    }

    return {
      id: Date.now(),
      contract_address: tokenAddr,
      curve_address: (curveAddress || tokenAddr).toLowerCase(),
      factory_address: null,
      transfer_policy: transferPolicy,
      amm_pair_address: null,
      creator_wallet: '0x0000000000000000000000000000000000000000',
      name,
      symbol,
      description: null,
      image: null,
      price,
      market_cap: marketCap,
      volume_24h: '0.000000',
      real_usdc: realUsdc,
      tokens_sold: tokensSold,
      creator_fees_accrued: '0',
      protocol_fees_accrued: '0',
      status: graduated ? 'graduated' : 'active',
      is_agent: 'false',
      agent_name: null,
      agent_uuid: null,
      graduated_at: null,
      lp_burned: null,
      created_block: '0',
      created_tx_hash: '',
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[api] On-chain token fallback failed for ${address}:`, err);
    return null;
  }
}
