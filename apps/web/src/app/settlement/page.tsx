import type { Metadata } from 'next';
import { lookupSettlement, units, validAccount } from './data';

export const metadata: Metadata = { title: 'Auction recovery | Orba' };

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[]; page?: string }>;
}) {
  const { account: query, page } = await searchParams;
  const pageNumber = Number(page);
  const requestedPage = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const account = typeof query === 'string' ? query.trim() : '';
  const invalid = query !== undefined && !validAccount(account);
  const result = account && !invalid ? await lookupSettlement(account, requestedPage) : null;
  const profileUrl = 'https://meme.cooking/profile/' + encodeURIComponent(account);

  return <main className="mx-auto min-h-[70vh] max-w-4xl space-y-6 px-5 py-12 md:px-8">
    <h1 className="text-4xl font-semibold">Auction recovery</h1>
    <p className="text-text-secondary">Check Meme.cooking refunds and token claims on NEAR mainnet.</p>
    <form action="/settlement" className="card space-y-3">
      <label htmlFor="account" className="block text-sm font-semibold">NEAR account</label>
      <div className="flex flex-wrap gap-3">
        <input id="account" name="account" defaultValue={account} maxLength={64} required
          className="input min-w-0 flex-1" placeholder="example.near" autoCapitalize="none" spellCheck={false} />
        <button type="submit" className="btn-primary">Check account</button>
      </div>
      {invalid && <p role="alert">Enter a valid NEAR account ID.</p>}
      {!account && <a href="/settlement?account=mushka1487.tg" className="text-sm text-accent-blue underline">Try a public example</a>}
    </form>
    {result && <>
      <div className="space-y-1 text-sm text-text-secondary" role="status">
        <p className="break-all font-semibold text-text-primary">{account}</p>
        <p>{result.block ? 'Verified at NEAR block ' + result.block.toLocaleString('en-US') : 'Live contract verification unavailable. Try again shortly.'}</p>
        {result.historyUnavailable && <p>Indexed auction history is unavailable.</p>}
      </div>
      {!result.rows.length && result.block && !result.historyUnavailable && <p className="card">No auction participation found.</p>}
      {result.rows.map(({ id, auction, status, balance, claim, action }) => <article key={id} className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-xl font-semibold">{auction?.name ?? 'Auction'} <span className="text-sm text-text-secondary">#{id}</span></h2>
          <p className={action ? 'font-semibold text-accent-blue' : 'text-text-secondary'}>{status}</p>
        </div>
        {balance !== null && auction?.deposit_token_id === 'wrap.near' && <p className="break-all">
          {action === 'withdraw' ? 'Refund principal' : 'Recorded deposit'} · {units(balance, 24)} wNEAR
        </p>}
        {claim !== null && auction && BigInt(claim) > 0n && <p className="break-all">
          Claimable · {units(claim, auction.decimals)} {auction.symbol}
        </p>}
        <div className="flex flex-wrap items-center gap-4">
          {action && <a href={profileUrl} className="btn-primary">{action === 'withdraw' ? 'Withdraw' : 'Claim'} on Meme.cooking</a>}
          <a href={'https://meme.cooking/meme/' + id} className="text-sm text-accent-blue underline">View auction</a>
        </div>
      </article>)}
      {result.pageCount > 1 && <nav aria-label="Auction results pages" className="flex items-center gap-4">
        {result.page > 1 && <a className="text-accent-blue underline" href={'/settlement?account=' + encodeURIComponent(account) + '&page=' + (result.page - 1)}>Previous</a>}
        <span>Page {result.page} of {result.pageCount}</span>
        {result.page < result.pageCount && <a className="text-accent-blue underline" href={'/settlement?account=' + encodeURIComponent(account) + '&page=' + (result.page + 1)}>Next</a>}
      </nav>}
    </>}
  </main>;
}
