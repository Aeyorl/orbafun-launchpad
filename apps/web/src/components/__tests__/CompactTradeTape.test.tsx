/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CompactTradeTape } from '../trading/CompactTradeTape';
import type { Trade } from '@/lib/api';

afterEach(cleanup);

const trade = (type: 'buy' | 'sell', index: number): Trade => ({
  id: index,
  token_id: 1,
  wallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  type,
  usdc_amount: '1000000',
  token_amount: '250000000000000000000000',
  price: '0.000004',
  market_cap_after: '4000',
  real_usdc_after: '1000000',
  tokens_sold_after: '250000000000000000000000',
  tx_hash: `0x${index}`,
  block_number: String(index),
  log_index: index,
  timestamp: new Date().toISOString(),
  wallet_tier: null,
  wallet_tier_label: null,
  wallet_tier_calculated_at: null,
});

describe('CompactTradeTape', () => {
  it('labels buys and sells and limits the first-viewport tape to ten rows', () => {
    const trades = Array.from({ length: 12 }, (_, index) => trade(index % 2 ? 'sell' : 'buy', index));
    render(<CompactTradeTape trades={trades} symbol="ORB" />);

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getAllByText('BUY')).toHaveLength(5);
    expect(screen.getAllByText('SELL')).toHaveLength(5);
  });

  it('provides a purposeful zero-data state', () => {
    render(<CompactTradeTape trades={[]} symbol="ORB" />);
    expect(screen.getByText(/first confirmed buy or sell/i)).toBeInTheDocument();
  });
});
