const api = 'https://api.meme.cooking';
const rpc = process.env.MEME_COOKING_NEAR_RPC_URL || 'https://near.drpc.org';
const contract = 'meme-cooking.near';
const limit = 20;

type Auction = {
  name: string;
  symbol: string;
  decimals: number;
  deposit_token_id: string;
  end_timestamp_ms: number | null;
  is_finalized: boolean;
  token_id: string | null;
  pool_id: number | null;
};
type Profile = { deposited: { meme_id: number }[] };
type Account = { deposits: [number, string][] };
type Row = {
  id: number;
  auction: Auction | null;
  status: string;
  balance: string | null;
  claim: string | null;
  action: 'withdraw' | 'claim' | null;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(api + path, { next: { revalidate: 30 }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error('Auction API unavailable');
  return response.json();
}

async function view<T>(method: string, args: object, block?: string) {
  const response = await fetch(rpc, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(6500),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'orba-settlement', method: 'query',
      params: {
        request_type: 'call_function', account_id: contract, method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        ...(block ? { block_id: block } : { finality: 'final' }),
      },
    }),
  });
  if (!response.ok) throw new Error('NEAR RPC unavailable');
  const { result } = await response.json();
  if (!Array.isArray(result?.result) || !result.block_hash) throw new Error('NEAR view failed');
  return {
    value: JSON.parse(Buffer.from(result.result).toString('utf8')) as T,
    block: result.block_hash as string,
    height: result.block_height as number,
  };
}

export function validAccount(account: string) {
  return account.length >= 2 && account.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(account);
}

export function units(raw: string, decimals: number) {
  const digits = raw.padStart(decimals + 1, '0');
  if (!decimals) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return digits.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}

export async function lookupSettlement(accountId: string, requestedPage: number) {
  const [account, profile] = await Promise.all([
    view<Account | null>('get_account', { account_id: accountId }).catch(() => null),
    get<Profile>('/profile/' + encodeURIComponent(accountId)).catch(() => null),
  ]);
  const unclaimed = account
    ? await view<number[]>('get_unclaimed', { account_id: accountId }, account.block).catch(() => null)
    : null;
  const deposits = new Map(account?.value?.deposits ?? []);
  const pending = new Set(unclaimed?.value ?? []);
  const ids = [...new Set([
    ...pending,
    ...deposits.keys(),
    ...(profile?.deposited ?? []).map((row) => row.meme_id).sort((a, b) => b - a),
  ])].filter((id) => Number.isSafeInteger(id) && id >= 0);

  const pageCount = Math.max(1, Math.ceil(ids.length / limit));
  const page = Math.min(requestedPage, pageCount);
  const pageIds = ids.slice((page - 1) * limit, page * limit);
  const rows: Row[] = [];
  for (let i = 0; i < pageIds.length; i += 5) {
    const group = await Promise.all(pageIds.slice(i, i + 5).map(async (id): Promise<Row> => {
      const result = await get<{ meme: Auction | null }>('/meme/' + id).catch(() => null);
      const auction = result?.meme ?? null;
      const balance = account ? deposits.get(id) ?? '0' : null;
      const row: Row = { id, auction, balance, claim: null, action: null, status: 'Auction outcome unavailable' };
      if (!auction) return row;
      if (!auction.is_finalized) {
        row.status = auction.end_timestamp_ms && auction.end_timestamp_ms <= Date.now()
          ? 'Awaiting finalization' : 'Auction open';
        return row;
      }
      if (!auction.token_id && auction.pool_id === null) {
        if (balance === null || (BigInt(balance) > 0n && !unclaimed)) row.status = 'Failed launch · refund status unavailable';
        else if (BigInt(balance) > 0n && pending.has(id)) {
          row.status = 'Refund available';
          row.action = 'withdraw';
        } else row.status = BigInt(balance) > 0n ? 'Failed launch · deposit recorded' : 'Failed launch · no deposit remaining';
        return row;
      }
      row.status = 'Launched · claim status unavailable';
      if (account && auction.token_id && auction.pool_id !== null) {
        const claim = await view<string>('get_claimable', { account_id: accountId, meme_id: id }, account.block).catch(() => null);
        if (claim && typeof claim.value === 'string' && /^\d+$/.test(claim.value)) {
          row.claim = claim.value;
          row.action = BigInt(claim.value) > 0n ? 'claim' : null;
          row.status = row.action ? 'Tokens ready to claim' : 'Launched · no tokens to claim';
        }
      }
      return row;
    }));
    rows.push(...group);
  }
  return {
    rows: rows.sort((a, b) => Number(!!b.action) - Number(!!a.action) || b.id - a.id),
    block: account?.height,
    historyUnavailable: !profile,
    page,
    pageCount,
  };
}
