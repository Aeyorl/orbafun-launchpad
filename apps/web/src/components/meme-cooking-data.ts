export type Listing = {
  meme_id: number;
  name: string;
  symbol: string;
  description: string | null;
  image: string | null;
  owner: string;
  token_id: string | null;
  pool_id: number | null;
  is_finalized: boolean;
  end_timestamp_ms: number | null;
  deposit_token_id: string;
  total_deposit: string | null;
};

export const filters = [
  ['all', 'All'],
  ['open', 'Open'],
  ['launched', 'Launched'],
  ['failed', 'Failed'],
  ['settling', 'Awaiting settlement'],
] as const;

let catalog: Promise<Listing[]> | undefined;
let expires = 0;

export function getCatalog() {
  if (catalog && Date.now() < expires) return catalog;
  expires = Date.now() + 60_000;
  // The complete catalog exceeds the Next.js per-response cache limit.
  catalog = fetch('https://api.meme.cooking/meme?order_by=meme_id&order_by_direction=desc', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  }).then(async (response) => {
    if (!response.ok) throw new Error('Meme.cooking catalog unavailable');
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid Meme.cooking catalog');
    return rows as Listing[];
  }).catch((error) => {
    expires = 0;
    throw error;
  });
  return catalog;
}

export function statusOf(listing: Listing, now: number) {
  if (listing.token_id && listing.pool_id != null) return 'launched';
  if (listing.is_finalized && !listing.token_id && listing.pool_id == null) return 'failed';
  if (listing.is_finalized || (listing.end_timestamp_ms != null && listing.end_timestamp_ms <= now)) return 'settling';
  return 'open';
}

export function imageUrl(image: string | null) {
  if (!image) return null;
  if (/^https:\/\//i.test(image)) return image;
  const cid = image.replace(/^ipfs:\/\//, '');
  return /^[a-z0-9]{46,100}$/i.test(cid) ? 'https://gateway.pinata.cloud/ipfs/' + cid : null;
}

export function wrappedNearDeposit(listing: Listing) {
  return listing.deposit_token_id === 'wrap.near' && /^\d+$/.test(listing.total_deposit ?? '')
    ? BigInt(listing.total_deposit!) : null;
}
