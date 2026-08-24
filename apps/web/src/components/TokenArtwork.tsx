'use client';

import { useState } from 'react';
import { ipfsGatewayUrls } from '@/lib/utils';

interface TokenArtworkProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function TokenArtwork({ src, alt, className = '' }: TokenArtworkProps) {
  const [imageAttempt, setImageAttempt] = useState<{ src: string | null | undefined; index: number }>({
    src,
    index: 0,
  });
  const sources = ipfsGatewayUrls(src);
  const sourceIndex = imageAttempt.src === src ? imageAttempt.index : 0;
  const failed = sourceIndex >= sources.length;

  return (
    <span className={`block overflow-hidden bg-bg-base border border-bg-border ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={failed ? '/orba-icon.svg' : sources[sourceIndex]}
        alt={failed ? `${alt} fallback artwork` : alt}
        className={`h-full w-full ${failed ? 'object-contain p-1.5' : 'object-cover'}`}
        onError={() => {
          if (!failed) setImageAttempt({ src, index: sourceIndex + 1 });
        }}
      />
    </span>
  );
}
