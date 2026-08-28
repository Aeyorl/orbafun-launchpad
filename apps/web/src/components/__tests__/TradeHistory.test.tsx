/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Trade } from '@/lib/api';
import { TradeHistory } from '../TradeHistory';

vi.mock('@/lib/config', () => ({ ARC_EXPLORER_URL: 'https://testnet.arcscan.app' }));
vi.mock('@/lib/api', () => ({
  api: { getTokenTrades: vi.fn() },
}));
vi.mock('@/lib/utils', () => ({
  formatUsdc: () => '$2.04',
  formatTokens: () => '368.92K',
  shortenAddress: () => '0xdead…beef',
  timeAgo: () => '2d ago',
}));

afterEach(cleanup);

const trade: Trade = {
  id: 1,
  token_id: 1,
  wallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  type: 'buy',
  usdc_amount: '2043262',
  token_amount: '368924350000000000000000',
  price: '0.000004',
  market_cap_after: '4200',
  real_usdc_after: '2043262',
  tokens_sold_after: '368924350000000000000000',
  tx_hash: '0xabc123',
  block_number: '100',
  log_index: 0,
  timestamp: new Date().toISOString(),
  wallet_tier: 'fish',
  wallet_tier_label: 'Fish',
  wallet_tier_calculated_at: new Date().toISOString(),
};

describe('TradeHistory', () => {
  it('uses a stacked, wrapping row structure on mobile', () => {
    render(<TradeHistory initialTrades={[trade]} tokenAddress="0xtoken" />);

    expect(screen.getByTestId('trade-history-row')).toHaveClass(
      'grid',
      'gap-2',
      'sm:grid-cols-[minmax(0,1fr)_auto]',
    );
    expect(screen.getByTestId('trade-history-meta')).toHaveClass('flex-wrap', 'sm:flex-nowrap');
    expect(screen.getByText('Fish')).toHaveClass('shrink-0', 'whitespace-nowrap');
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('keeps the transaction explorer link accessible on touch layouts', () => {
    render(<TradeHistory initialTrades={[trade]} tokenAddress="0xtoken" />);

    expect(screen.getByRole('link', { name: 'View transaction on ArcScan' })).toHaveAttribute(
      'href',
      'https://testnet.arcscan.app/tx/0xabc123',
    );
  });

  it('preserves the borderless embedded layout', () => {
    const { container } = render(
      <TradeHistory initialTrades={[trade]} tokenAddress="0xtoken" embedded />,
    );

    expect(container.firstElementChild).not.toHaveClass('card');
  });
});
