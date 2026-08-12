/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketFlowCard } from '../trading/MarketFlowCard';

const { getMarketFlow } = vi.hoisted(() => ({ getMarketFlow: vi.fn() }));

getMarketFlow.mockResolvedValue({
  window: '24h',
  price_change_pct: '4.25',
  buy_count: 10,
  sell_count: 2,
  buy_volume_usdc: '8000000',
  sell_volume_usdc: '2000000',
  unique_buyers: 7,
  unique_sellers: 2,
  current_market_cap: '6610',
  all_time_high: '7000',
});

vi.mock('@/lib/api', () => ({ api: { getMarketFlow } }));

afterEach(cleanup);

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MarketFlowCard tokenAddress="0xtoken" />
    </QueryClientProvider>,
  );
}

describe('MarketFlowCard', () => {
  it('shows direction with labels as well as color', async () => {
    renderCard();
    expect(await screen.findByText('BUY 80%')).toBeInTheDocument();
    expect(screen.getByText('SELL 20%')).toBeInTheDocument();
    expect(screen.getByText(/trade size, ordering, and available liquidity/i)).toBeInTheDocument();
  });

  it('loads the selected timeframe', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('tab', { name: '1h' }));
    expect(getMarketFlow).toHaveBeenLastCalledWith('0xtoken', '1h');
  });
});
