'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '@/lib/config';
import { useReferral } from '@/lib/use-referral';
import { useState } from 'react';

function ReferralAttributionListener() {
  // Mounts the referral hook site-wide so ?ref= is captured on any page.
  useReferral();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 10_000, // 10s — matches API cache TTL
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ReferralAttributionListener />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
