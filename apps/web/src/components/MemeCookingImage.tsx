'use client';

import { useState } from 'react';

export function MemeCookingImage({ src, symbol, className, eager = false }: {
  src: string | null;
  symbol: string;
  className: string;
  eager?: boolean;
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return <div className={className} aria-hidden="true">
    <span className="absolute inset-0 grid place-items-center font-semibold text-accent-blue">{symbol[0]}</span>
    {src && failedSrc !== src && <img key={src} src={src} alt="" loading={eager ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer" onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)}
      className={'absolute inset-0 h-full w-full object-cover ' + (loadedSrc === src ? '' : 'opacity-0')} />}
  </div>;
}
