'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { LinkSimple } from '@phosphor-icons/react';

/**
 * ShareButton — copies the current coin page URL to clipboard and offers
 * native share (on mobile) + a Twitter/X intent link. The OG image is
 * auto-rendered by Next.js at /coin/[address]/opengraph-image, so any
 * link shared to social platforms will show a rich preview card with the
 * token name, market cap, and bonding curve progress.
 */
export function ShareButton({ tokenName, tokenSymbol }: { tokenName: string; tokenSymbol: string }) {
  const [open, setOpen] = useState(false);

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const tweetText = `Check out $${tokenSymbol} on Orba — ${url}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
      setOpen(false);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${tokenName} ($${tokenSymbol}) — Orba`,
          text: `Trade $${tokenSymbol} on Orba`,
          url,
        });
        setOpen(false);
      } catch {
        // user cancelled — no action needed
      }
    } else {
      copyLink();
    }
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary text-sm px-2 py-1"
        aria-label="Share this token"
        aria-expanded={open}
      >
        <LinkSimple size={16} aria-hidden="true" />
      </button>
      {open && (
        <>
          {/* click-away overlay */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 card p-2 min-w-[160px] space-y-1">
            <button
              onClick={nativeShare}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors"
            >
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? 'Share…' : 'Copy link'}
            </button>
            <button
              onClick={copyLink}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors"
            >
              Copy link
            </button>
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors"
              onClick={() => setOpen(false)}
            >
              Post on X
            </a>
          </div>
        </>
      )}
    </div>
  );
}
