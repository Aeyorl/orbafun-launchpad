/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Token } from '@/lib/api';
import { TokenHeader } from '../trading/TokenHeader';

const queryData = vi.hoisted(() => ({ twitter: null as string | null }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'token-metadata' ? { twitter: queryData.twitter } : undefined,
  }),
}));

vi.mock('@/components/AgentBadge', () => ({ AgentBadge: () => null }));
vi.mock('@/components/FavoriteButton', () => ({ FavoriteButton: () => null }));
vi.mock('@/components/SocialLinks', () => ({ SocialLinks: () => null }));
vi.mock('@/components/WalletBadge', () => ({ WalletBadge: () => null }));

const token: Token = {
  id: 1,
  contract_address: '0x8f77a0131cfb6b64240ff47848b3430a08c9274e',
  curve_address: '0x0000000000000000000000000000000000000001',
  factory_address: null,
  transfer_policy: 'uncapped',
  amm_pair_address: null,
  creator_wallet: '0x0000000000000000000000000000000000000002',
  name: 'Test token',
  symbol: 'TEST',
  description: null,
  image: null,
  price: '0.000004',
  market_cap: '4000',
  volume_24h: '0',
  real_usdc: '1000000',
  tokens_sold: '0',
  creator_fees_accrued: '0',
  protocol_fees_accrued: '0',
  status: 'bonding',
  graduated_at: null,
  lp_burned: null,
  created_block: '1',
  created_tx_hash: '0x1',
  created_at: new Date().toISOString(),
  is_agent: 'false',
  agent_name: null,
  agent_uuid: null,
};

describe('TokenHeader', () => {
  afterEach(() => {
    queryData.twitter = null;
    cleanup();
  });

  it('shows market cap and token price together', () => {
    render(
      <TokenHeader
        token={token}
        change24h={{ diff: 0, pct: 0, isPositive: true }}
        totalHolders={0}
      />,
    );

    expect(screen.getAllByText('$4K')).toHaveLength(2);
    expect(screen.getAllByText('$4.0000e-6')).toHaveLength(2);
  });

  it('places the token X profile in the metadata pill when one is configured', () => {
    queryData.twitter = 'https://x.com/orba_fun';

    render(
      <TokenHeader
        token={token}
        change24h={{ diff: 0, pct: 0, isPositive: true }}
        totalHolders={0}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open @orba_fun on X' })).toHaveAttribute('href', 'https://x.com/orba_fun');
    expect(screen.queryByText('0x0000...0002')).not.toBeInTheDocument();
  });
});
