'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Legacy /coin/[address] page redirecting to the new trading terminal at /trade/[address].
 */
export default function CoinPageRedirect() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  useEffect(() => {
    if (address) {
      router.replace(`/trade/${address.toLowerCase()}`);
    }
  }, [address, router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <div className="inline-block w-8 h-8 border-3 border-accent-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Redirecting to trading terminal…</p>
      </div>
    </div>
  );
}
