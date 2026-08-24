/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenCard } from '../TokenCard';
import type { Token } from '@/lib/api';

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return { ...actual, timeAgo: () => '2m ago' };
});

afterEach(cleanup);

function createMockToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 1,
    contract_address: '0x1234567890abcdef1234567890abcdef12345678',
    curve_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    factory_address: '0x1111111111111111111111111111111111111111',
    transfer_policy: 'uncapped',
    amm_pair_address: null,
    creator_wallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token',
    image: null,
    price: '0.000004',
    market_cap: '4000.000000',
    volume_24h: '5.000000',
    real_usdc: '0',
    tokens_sold: '0',
    creator_fees_accrued: '0',
    protocol_fees_accrued: '0',
    status: 'active',
    is_agent: 'false',
    agent_name: null,
    agent_uuid: null,
    graduated_at: null,
    lp_burned: null,
    created_block: '100',
    created_tx_hash: '0xtxhash1234567890',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('TokenCard', () => {
  it('renders the image-first card identity and market signal', () => {
    render(<TokenCard token={createMockToken({ name: 'Arc Doge', symbol: 'ADOGE', market_cap: '8000.000000' })} />);

    expect(screen.getByText('Arc Doge')).toBeInTheDocument();
    expect(screen.getByText('$ADOGE')).toBeInTheDocument();
    expect(screen.getByText('$8.00K')).toBeInTheDocument();
    expect(screen.getByText('+100.0%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Arc Doge token artwork' })).toBeInTheDocument();
  });

  it.each([
    [{ market_cap: '4000.000000' }, 'New signal'],
    [{ market_cap: '17000.000000' }, 'Blooming'],
    [{ market_cap: '25000.000000' }, 'Nearly there'],
    [{ status: 'graduated', market_cap: '30000.000000' }, 'Graduated'],
  ] as const)('shows the correct lifecycle signal', (overrides, label) => {
    render(<TokenCard token={createMockToken(overrides)} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('uses the supplied token image when present', () => {
    render(<TokenCard token={createMockToken({ image: 'ipfs://QmTest123' })} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://gateway.pinata.cloud/ipfs/QmTest123');
  });

  it('tries alternate IPFS gateways before generic artwork', () => {
    render(<TokenCard token={createMockToken({ image: 'ipfs://QmTest123' })} />);
    const artwork = screen.getByRole('img');

    fireEvent.error(artwork);
    expect(artwork).toHaveAttribute('src', 'https://dweb.link/ipfs/QmTest123');
    fireEvent.error(artwork);
    expect(artwork).toHaveAttribute('src', 'https://ipfs.io/ipfs/QmTest123');
    fireEvent.error(artwork);
    expect(artwork.getAttribute('src')).toMatch(/^\/token-board-lab\//);
  });

  it('shows the compact creator and age metadata', () => {
    render(<TokenCard token={createMockToken()} />);
    expect(screen.getByText(/0xdead\.\.\.beef/)).toBeInTheDocument();
    expect(screen.getByText('2m')).toBeInTheDocument();
  });

  it('opens a quick look with volume and the market link', async () => {
    const user = userEvent.setup();
    const token = createMockToken({ volume_24h: '10.000000' });
    render(<TokenCard token={token} />);

    await user.click(screen.getByRole('button', { name: /Open Test Token/i }));

    expect(screen.getByRole('dialog', { name: 'Test Token quick look' })).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open market/i })).toHaveAttribute('href', `/trade/${token.contract_address}`);
  });

  it('closes the quick look with Escape', async () => {
    const user = userEvent.setup();
    render(<TokenCard token={createMockToken()} />);
    await user.click(screen.getByRole('button', { name: /Open Test Token/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exposes bonding progress to assistive technology', () => {
    render(<TokenCard token={createMockToken({ market_cap: '17000.000000' })} />);
    expect(screen.getByLabelText(/bonded/)).toBeInTheDocument();
  });
});
