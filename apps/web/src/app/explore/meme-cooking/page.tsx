import type { Metadata } from 'next';
import Link from 'next/link';
import { filters, getCatalog, statusOf, wrappedNearDeposit } from '../../../components/meme-cooking-data';
import { MemeCookingCard } from '../../../components/MemeCookingCard';

export const metadata: Metadata = { title: 'Meme.cooking Market | Orba' };

const pageSize = 24;

export default async function MemeCookingMarket({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const filter = filters.find(([key]) => key === params.status)?.[0] ?? 'all';
  const requestedPage = Number(params.page);
  const listings = await getCatalog().catch(() => null);
  const search = query.toLowerCase();
  const now = Date.now();
  const matches = (listings ?? []).filter((item) =>
    (filter === 'all' || statusOf(item, now) === filter) &&
    [item.name, item.symbol, item.token_id, item.owner, String(item.meme_id)]
      .some((value) => value?.toLowerCase().includes(search))
  );
  if (params.sort === 'deposits') matches.sort((first, second) => {
    const a = wrappedNearDeposit(first) ?? 0n;
    const b = wrappedNearDeposit(second) ?? 0n;
    return a === b ? second.meme_id - first.meme_id : a > b ? -1 : 1;
  });
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;

  function pageUrl(number: number) {
    return '/explore/meme-cooking?' + new URLSearchParams({ q: query, status: filter, sort: params.sort === 'deposits' ? 'deposits' : 'newest', page: String(number) });
  }

  return <main className="mx-auto min-h-[70vh] max-w-6xl space-y-6 px-5 py-12 md:px-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-4xl font-semibold">Meme.cooking market</h1>
      <div className="flex gap-4 text-sm text-accent-blue">
        <Link href="/settlement" className="underline">Check refunds and claims</Link>
      </div>
    </div>
    <p className="text-text-secondary">Browse Meme.cooking auctions and launches on NEAR mainnet.</p>
    <form action="/explore/meme-cooking" className="flex flex-wrap gap-3">
      <input className="input min-w-0 flex-1" name="q" defaultValue={query} maxLength={100}
        aria-label="Search Meme.cooking listings" placeholder="Search by name, ticker or account" />
      <select className="input" name="status" defaultValue={filter} aria-label="Auction status">
        {filters.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select className="input" name="sort" defaultValue={params.sort === 'deposits' ? 'deposits' : 'newest'} aria-label="Sort auctions">
        <option value="newest">Newest</option>
        <option value="deposits">Most wNEAR deposited</option>
      </select>
      <button className="btn-primary" type="submit">Search</button>
    </form>
    {listings === null ? <p role="status" className="card">The Meme.cooking catalog is temporarily unavailable.</p> : <>
      <p className="text-sm text-text-secondary">{matches.length.toLocaleString('en-US')} listings</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.slice((page - 1) * pageSize, page * pageSize).map((listing) => {
          return <MemeCookingCard key={listing.meme_id} listing={listing} now={now} />;
        })}
      </div>
      {!matches.length && <p className="card">No matching auctions.</p>}
      {pageCount > 1 && <nav aria-label="Catalog pages" className="flex items-center gap-4">
        {page > 1 && <Link href={pageUrl(page - 1)} prefetch={false} className="text-accent-blue underline">Previous</Link>}
        <span>Page {page} of {pageCount}</span>
        {page < pageCount && <Link href={pageUrl(page + 1)} prefetch={false} className="text-accent-blue underline">Next</Link>}
      </nav>}
    </>}
  </main>;
}
