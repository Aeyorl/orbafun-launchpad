import { filters, imageUrl, statusOf, wrappedNearDeposit, type Listing } from './meme-cooking-data';
import { MemeCookingImage } from './MemeCookingImage';
import { units } from '../app/settlement/data';

export function MemeCookingCard({ listing, now }: { listing: Listing; now: number }) {
  const status = statusOf(listing, now);
  const image = imageUrl(listing.image);
  const deposit = wrappedNearDeposit(listing);
  const statusLabel = filters.find(([key]) => key === status)?.[1];
  return <a href={'https://meme.cooking/meme/' + listing.meme_id}
    className="card block hover:border-accent-blue">
    <div className="flex items-start gap-3">
      <MemeCookingImage src={image} symbol={listing.symbol}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg-base" />
      <div className="min-w-0">
        <h3 className="break-words text-lg font-semibold">{listing.name} <span className="text-text-secondary">${listing.symbol}</span></h3>
        <p className="break-all text-xs text-text-secondary">{listing.owner}</p>
      </div>
    </div>
    <p className="mt-3 text-sm font-medium text-accent-blue">{statusLabel}</p>
    {listing.description && <p className="mt-1 line-clamp-2 break-words text-sm text-text-secondary">{listing.description}</p>}
    {deposit !== null && <p className="mt-3 break-all text-sm">
      Deposited · {units(deposit.toString(), 24)} wNEAR
    </p>}
  </a>;
}
