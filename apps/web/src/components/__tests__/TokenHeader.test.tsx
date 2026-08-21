/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Token, TokenMetadata } from '@/lib/api';
import { TokenHeader } from '../trading/TokenHeader';

vi.mock('@/components/FavoriteButton', () => ({
  FavoriteButton: () => <button type="button">Watch</button>,
}));

vi.mock('@/components/ShareButton', () => ({
  ShareButton: () => <button type="button">Share token</button>,
}));

vi.mock('@/components/AgentBadge', () => ({ AgentBadge: () => null }));
vi.mock('@/components/TokenArtwork', () => ({
  TokenArtwork: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

afterEach(cleanup);

const token: Token = {
  id: 1,
  contract_address: '0x1234567890abcdef1234567890abcdef12345678',
  curve_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  factory_address: null,
  transfer_policy: 'uncapped',
  amm_pair_address: null,
  creator_wallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  name: 'Orba Test',
  symbol: '$ORBA',
  description: null,
  image: null,
  price: '0.00225355',
  market_cap: '5680',
  volume_24h: '7300',
  real_usdc: '0',
  tokens_sold: '0',
  creator_fees_accrued: '0',
  protocol_fees_accrued: '0',
  status: 'active',
  graduated_at: null,
  lp_burned: null,
  created_block: '1',
  created_tx_hash: '0xabc',
  created_at: new Date().toISOString(),
  is_agent: 'false',
  agent_name: null,
  agent_uuid: null,
};

const metadata: TokenMetadata = {
  token_address: token.contract_address,
  website: 'orba.fun',
  twitter: '@orbafun',
  telegram: 'orbafun',
  discord: 'https://discord.gg/orba',
  description: null,
  banner: null,
};

describe('TokenHeader', () => {
  it('makes the actual token price the dominant fixed-decimal metric', () => {
    render(<TokenHeader token={token} metadata={metadata} change24h={{ diff: 20, pct: 1.2, isPositive: true }} totalHolders={12595} />);

    expect(screen.getAllByText('$0.00225355').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$ORBA').length).toBeGreaterThan(0);
    expect(screen.queryByText('$$ORBA')).not.toBeInTheDocument();
    expect(screen.getAllByText('12,595 holders').length).toBeGreaterThan(0);
  });

  it('links real social metadata and normalizes handles and bare domains', () => {
    render(<TokenHeader token={token} metadata={metadata} change24h={{ diff: 0, pct: 0, isPositive: true }} totalHolders={3} />);

    expect(screen.getAllByRole('link', { name: /X \/ Twitter/ })[0]).toHaveAttribute('href', 'https://x.com/orbafun');
    expect(screen.getAllByRole('link', { name: /Telegram/ })[0]).toHaveAttribute('href', 'https://t.me/orbafun');
    expect(screen.getAllByRole('link', { name: /Discord/ })[0]).toHaveAttribute('href', 'https://discord.gg/orba');
    expect(screen.getAllByRole('link', { name: /Website/ })[0]).toHaveAttribute('href', 'https://orba.fun/');
  });

  it('keeps X and Website visible but disabled when metadata is missing', () => {
    render(<TokenHeader token={token} change24h={{ diff: 0, pct: 0, isPositive: true }} totalHolders={0} />);

    expect(screen.getAllByLabelText('X / Twitter not provided').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Website not provided').length).toBeGreaterThan(0);
  });
});
