/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TokenCard } from '../TokenCard';
import type { Token } from '@/lib/api';

// Mock timeAgo for deterministic test output
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return {
    ...actual,
    timeAgo: () => '2m ago',
  };
});

// Clean up DOM between tests to avoid element accumulation
afterEach(() => {
  cleanup();
});

// ─── Mock Token Factory ─────────────────────────────────────────────────

function createMockToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 1,
    contract_address: '0x1234567890abcdef1234567890abcdef12345678',
    curve_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
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
    graduated_at: null,
    lp_burned: null,
    created_block: '100',
    created_tx_hash: '0xtxhash1234567890',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('TokenCard', () => {
  it('renders token name and symbol', () => {
    const token = createMockToken({ name: 'Arc Doge', symbol: 'ADOGE' });
    render(<TokenCard token={token} />);
    expect(screen.getByText('Arc Doge')).toBeInTheDocument();
    expect(screen.getByText('$ADOGE')).toBeInTheDocument();
  });

  it('renders market cap and 24h volume', () => {
    const token = createMockToken({ market_cap: '40000.000000', volume_24h: '10.000000' });
    render(<TokenCard token={token} />);
    expect(screen.getByText('$40.00K')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('shows "New" badge for tokens with 0% progress', () => {
    const token = createMockToken({ market_cap: '4000.000000' });
    render(<TokenCard token={token} />);
    const badges = screen.getAllByText('New');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Bonding" badge for tokens in mid-progress', () => {
    const token = createMockToken({ market_cap: '17000.000000' });
    render(<TokenCard token={token} />);
    const badges = screen.getAllByText('Bonding');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Near Grad" badge for tokens above 75%', () => {
    const token = createMockToken({ market_cap: '25000.000000' });
    render(<TokenCard token={token} />);
    // Badge text is "🔥 Near Grad" — use regex to match
    expect(screen.getByText(/Near Grad/)).toBeInTheDocument();
  });

  it('shows "Graduated" badge for graduated tokens', () => {
    const token = createMockToken({ status: 'graduated', market_cap: '30000.000000' });
    render(<TokenCard token={token} />);
    expect(screen.getByText(/Graduated/)).toBeInTheDocument();
  });

  it('renders token image when provided', () => {
    const token = createMockToken({ image: 'ipfs://QmTest123' });
    render(<TokenCard token={token} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'TEST');
    expect(img).toHaveAttribute('src', 'https://ipfs.io/ipfs/QmTest123');
  });

  it('renders emoji fallback when no image', () => {
    const token = createMockToken({ symbol: 'DOGE', image: null });
    render(<TokenCard token={token} />);
    expect(screen.getByText('🐶')).toBeInTheDocument();
  });

  it('shows remaining amount to graduation for ungraduated tokens', () => {
    const token = createMockToken({ market_cap: '10000.000000' });
    render(<TokenCard token={token} />);
    expect(screen.getByText(/\$20\.0K to \$30K DEX/)).toBeInTheDocument();
  });

  it('renders creator address (shortened)', () => {
    const token = createMockToken({
      creator_wallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    render(<TokenCard token={token} />);
    // The shortened address may be split across elements — use regex
    expect(screen.getByText(/0xdead\.\.\.beef/)).toBeInTheDocument();
  });

  it('renders time ago', () => {
    const token = createMockToken();
    render(<TokenCard token={token} />);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });

  it('has a link to the trade page', () => {
    const token = createMockToken({
      contract_address: '0x1234567890abcdef1234567890abcdef12345678',
    });
    render(<TokenCard token={token} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute(
      'href',
      '/trade/0x1234567890abcdef1234567890abcdef12345678',
    );
  });

  it('renders separate, non-nested trade and creator links', () => {
    const token = createMockToken();
    render(<TokenCard token={token} />);
    const tradeLink = screen.getByRole('link', { name: /Test Token/i });
    const creatorLink = screen.getByRole('link', { name: /0xdead/i });

    expect(tradeLink).toHaveAttribute('href', `/trade/${token.contract_address}`);
    expect(creatorLink).toHaveAttribute('href', `/profile/${token.creator_wallet}`);
    expect(tradeLink.contains(creatorLink)).toBe(false);
  });

  it('does not nest an agent badge link inside the trade link', () => {
    const token = createMockToken({
      is_agent: 'true',
      agent_uuid: 'agent-123',
      agent_name: 'Launch Bot',
    });
    render(<TokenCard token={token} />);

    expect(document.querySelectorAll('a a')).toHaveLength(0);
    expect(screen.getByTitle('Created by AI agent: Launch Bot')).toHaveTextContent('AI');
  });

  it('shows price change percentage', () => {
    const token = createMockToken({ market_cap: '8000.000000' });
    render(<TokenCard token={token} />);
    expect(screen.getByText('+100.00%')).toBeInTheDocument();
  });

  // Note: The component only shows positive percentage changes (mcap > $4K),
  // or defaults to 0% when mcap <= $4K. Negative percentages are not rendered.

  it('renders the progress bar', () => {
    const token = createMockToken({ market_cap: '17000.000000' });
    render(<TokenCard token={token} />);
    const progressBars = document.querySelectorAll('.h-full.transition-all');
    expect(progressBars.length).toBeGreaterThan(0);
  });
});
