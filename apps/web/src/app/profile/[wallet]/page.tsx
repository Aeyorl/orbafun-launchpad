'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { TokenCard } from '@/components/TokenCard';
import { ReferralPanel } from '@/components/ReferralPanel';
import { formatUsdc, shortenAddress } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams();
  const wallet = params.wallet as string;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user', wallet],
    queryFn: () => api.getUserProfile(wallet),
    enabled: !!wallet,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="card animate-pulse h-32" />
        <div className="card animate-pulse h-64" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-2">User not found</h1>
        <p className="text-text-secondary mb-4">
          This wallet hasn&apos;t launched any tokens or made any trades.
        </p>
        <Link href="/explore" className="btn-secondary">
          ← Back to Explore
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile header */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-green to-accent-blue flex items-center justify-center text-2xl font-bold">
            {shortenAddress(profile.wallet).slice(0, 2)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{shortenAddress(profile.wallet)}</h1>
            <p className="text-sm text-text-muted">
              Joined {new Date(profile.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <Stat label="Tokens launched" value={String(profile.tokens_launched)} />
          <Stat label="Total trades" value={String(profile.trade_stats.total_trades)} />
          <Stat
            label="Buys"
            value={String(profile.trade_stats.total_buys)}
          />
          <Stat
            label="Sells"
            value={String(profile.trade_stats.total_sells)}
          />
        </div>
        <div className="mt-2">
          <Stat
            label="Total volume"
            value={formatUsdc(profile.total_volume_usdc)}
            full
          />
        </div>
      </div>

      {/* Launched tokens */}
      <div>
        <h2 className="text-xl font-bold mb-4">Launched Tokens</h2>
        {profile.launched_tokens.tokens.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {profile.launched_tokens.tokens.map((token) => (
              <TokenCard key={token.contract_address} token={token} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-8 text-text-muted">
            <p>No tokens launched yet.</p>
            <Link href="/launch" className="btn-primary mt-3 inline-block">
              Launch your first token →
            </Link>
          </div>
        )}
      </div>

      {/* Referral panel */}
      <ReferralPanel wallet={wallet} />
    </div>
  );
}

function Stat({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={`bg-bg-input rounded-lg p-3 ${full ? '' : ''}`}>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="font-bold text-lg tabular-nums">{value}</div>
    </div>
  );
}
