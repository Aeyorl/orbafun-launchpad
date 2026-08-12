'use client';

import { useEffect, useState } from 'react';
import { ipfsToGateway } from '@/lib/utils';

interface TokenArtworkProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function TokenArtwork({ src, alt, className = '' }: TokenArtworkProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => setFailed(!src), [src]);

  return (
    <span className={`block overflow-hidden bg-bg-base border border-bg-border ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={failed ? '/orba-icon.svg' : ipfsToGateway(src)}
        alt={failed ? `${alt} fallback artwork` : alt}
        className={`h-full w-full ${failed ? 'object-contain p-1.5' : 'object-cover'}`}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
