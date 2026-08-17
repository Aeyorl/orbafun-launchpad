/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradePanel } from '../TradePanel';
import { createMockWagmi as _createMock } from './mocks/wagmi';
import type { Token } from '@/lib/api';

// ─── Wagmi mock using vi.hoisted ───────────────────────────────────────
// vi.hoisted runs before vi.mock, so we can define the ref and wrappers
// that the hoisted vi.mock factory will use.
const { mockWagmiRef, createWagmiMockModule } = vi.hoisted(() => {
  const fn = vi.fn;
  const ref: { current: ReturnType<typeof _createMock> } = {
    current: fn(() => ({}) as unknown as ReturnType<typeof _createMock>),
  };

  /**
   * Build the mock module object. Each hook is a function wrapper that
   * delegates to the current ref value, so reassigning ref.current
   * between tests reconfigures all hooks.
   */
  function buildModule() {
    return {
      createConfig: fn(() => ({})),
      http: fn(() => ({})),
      fallback: fn((t: unknown[]) => t[0]),
      useAccount:      (...a: unknown[]) => (ref.current as any).useAccount?.(...a) ?? { isConnected: false },
      useBalance:      (...a: unknown[]) => (ref.current as any).useBalance?.(...a) ?? {},
      useReadContract: (...a: unknown[]) => (ref.current as any).useReadContract?.(a[0] as any) ?? {},
      useWriteContract: (...a: unknown[]) => (ref.current as any).useWriteContract?.(...a) ?? {},
      useWaitForTransactionReceipt: (...a: unknown[]) => (ref.current as any).useWaitForTransactionReceipt?.(...a) ?? {},
      useSwitchChain:  (...a: unknown[]) => (ref.current as any).useSwitchChain?.(...a) ?? {},
      useConnect:      (...a: unknown[]) => (ref.current as any).useConnect?.(...a) ?? {},
      useConnectors:   (...a: unknown[]) => (ref.current as any).useConnectors?.(...a) ?? [],
      useDisconnect:   (...a: unknown[]) => (ref.current as any).useDisconnect?.(...a) ?? {},
    };
  }

  return { mockWagmiRef: ref, createWagmiMockModule: buildModule };
});

vi.mock('wagmi', () => createWagmiMockModule());

vi.mock('@/lib/use-arc-receipt', () => ({
  useArcReceiptFallback: () => ({ confirmed: false, failed: false, isLoading: false }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  success: vi.fn(),
  error: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────

function createMockToken(overrides: Partial<Token> = {}): Token {
  return {
    id: 1,
    contract_address: '0x1234567890abcdef1234567890abcdef12345678',
    curve_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    factory_address: '0x1111111111111111111111111111111111111111',
    transfer_policy: 'uncapped',
    amm_pair_address: null,
    creator_wallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    name: 'Arc Doge',
    symbol: 'ADOGE',
    description: 'The arc doge token',
    image: null,
    price: '0.000004',
    market_cap: '10000.000000',
    volume_24h: '5000000',
    real_usdc: '5000000',
    tokens_sold: '5000000000000000000000',
    creator_fees_accrued: '50000',
    protocol_fees_accrued: '50000',
    status: 'active',
    graduated_at: null,
    lp_burned: null,
    created_block: '100',
    created_tx_hash: '0xtxhash1234567890',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function updateWagmiMock(overrides: Parameters<typeof _createMock>[0] = {}) {
  mockWagmiRef.current = _createMock(overrides) as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('TradePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWagmiMock({ isConnected: true });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Disconnected state', () => {
    beforeEach(() => {
      updateWagmiMock({ isConnected: false });
    });

    it('shows Connect Wallet button when not connected', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });
  });

  describe('Wrong network state', () => {
    beforeEach(() => {
      updateWagmiMock({ isConnected: true, chainId: 1 });
    });

    it('shows switch network button on wrong chain', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByText(/Switch to Arc Testnet/)).toBeInTheDocument();
    });
  });

  describe('Connected state', () => {
    it('shows Buy tab as default', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      const buyTab = screen.getByRole('tab', { name: /BUY/i });
      expect(buyTab).toBeInTheDocument();
      expect(buyTab).toHaveAttribute('aria-selected', 'true');
    });

    it('allows switching between Buy and Sell tabs', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      const sellTab = screen.getByRole('tab', { name: /SELL/i });
      fireEvent.click(sellTab);
      expect(sellTab).toHaveAttribute('aria-selected', 'true');
      const buyTab = screen.getByRole('tab', { name: /BUY/i });
      expect(buyTab).toHaveAttribute('aria-selected', 'false');
    });

    it('shows amount input field', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    });

    it('shows Enter amount button when no amount entered', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByText('Enter amount')).toBeInTheDocument();
    });

    it('keeps the primary action outside the scrolling form region', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);

      const actionFooter = screen.getByTestId('trade-panel-action-footer');
      const scrollRegion = screen.getByTestId('trade-panel-scroll-region');
      const primaryAction = screen.getByRole('button', { name: 'Enter amount' });

      expect(actionFooter).toContainElement(primaryAction);
      expect(scrollRegion).not.toContainElement(primaryAction);
    });

    it('shows price impact and fee information', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByText('Price impact')).toBeInTheDocument();
      expect(screen.getByText('Trading fee')).toBeInTheDocument();
      expect(screen.getByText('1.0%')).toBeInTheDocument();
    });

    it('shows bonding curve progress', () => {
      renderWithProviders(
        <TradePanel token={createMockToken({ market_cap: '15000.000000' })} />,
      );
      expect(screen.getByText(/→ \$30\.0K MC graduation/)).toBeInTheDocument();
    });

    it('shows MAX button for percentage balance', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      const maxBtns = screen.getAllByText('MAX');
      expect(maxBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('keeps a native USDC reserve for gas when MAX is selected', () => {
      updateWagmiMock({ balanceValue: 100n * 10n ** 18n });
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.click(screen.getAllByText('MAX')[0]);
      expect(screen.getByPlaceholderText('0.00')).toHaveValue(99.99);
    });

    it('shows balance display', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByText(/Balance/)).toBeInTheDocument();
    });

    it('blocks a legacy-token buy that exceeds its on-chain max wallet', () => {
      updateWagmiMock({
        tokenBalance: 900n * 10n ** 18n,
        quote: 200n * 10n ** 18n,
        maxWallet: 1_000n * 10n ** 18n,
      });
      renderWithProviders(
        <TradePanel token={createMockToken({ transfer_policy: 'legacy_capped' })} />,
      );
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      expect(screen.getByText('Reduce buy — legacy wallet limit')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('limits a wallet to 4%');
    });
  });

  describe('Graduated state', () => {
    it('keeps the buy and sell terminal available for graduated tokens', () => {
      const token = createMockToken({
        status: 'graduated',
        amm_pair_address: '0xammpair1234567890',
      });
      renderWithProviders(<TradePanel token={token} />);
      expect(screen.getByRole('tab', { name: 'BUY' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'SELL' })).toBeInTheDocument();
    });

    it('does not replace the terminal with the legacy explorer-only graduation card', () => {
      renderWithProviders(
        <TradePanel token={createMockToken({ status: 'graduated' })} />,
      );
      expect(screen.queryByText('Token Graduated to DEX')).not.toBeInTheDocument();
      expect(screen.queryByText(/View AMM Pair on ArcScan/)).not.toBeInTheDocument();
    });
  });

  describe('Advanced settings', () => {
    it('shows slippage settings when advanced is toggled', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.click(screen.getByText('Advanced Settings'));
      expect(screen.getByText('Slippage tolerance')).toBeInTheDocument();
      // There are multiple elements with "1%" (display + selected button)
      const pctMatches = screen.getAllByText(/1\s*%/);
      expect(pctMatches.length).toBeGreaterThanOrEqual(1);
    });

    it('shows execution network in advanced settings', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.click(screen.getByText('Advanced Settings'));
      expect(screen.getByText('Arc Testnet (5042002)')).toBeInTheDocument();
    });
  });

  // ─── Approval flow ──────────────────────────────────────────────────────

  describe('Approval flow', () => {
    it('requires resetting a broader legacy allowance to the exact trade amount', () => {
      updateWagmiMock({
        isConnected: true,
        usdcAllowance: (1n << 256n) - 1n,
      });
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      expect(screen.getByText('Approve 10 USDC (1 of 2)')).toBeInTheDocument();
    });

    beforeEach(() => {
      updateWagmiMock({ isConnected: true, usdcAllowance: 0n });
    });

    it('shows the exact one-time USDC approval on buy with insufficient allowance', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      expect(screen.getByTestId('trade-panel-action-footer')).toContainElement(
        screen.getByText('Approve 10 USDC (1 of 2)'),
      );
    });

    it('shows the exact one-time token approval on sell with insufficient allowance', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.click(screen.getByRole('tab', { name: /SELL/i }));
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '1000' },
      });
      expect(screen.getByTestId('trade-panel-action-footer')).toContainElement(
        screen.getByText('Approve 1000 ADOGE (1 of 2)'),
      );
    });

    it('explains the wallet spending-cap screen before opening it', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      expect(
        screen.getByText(/Why your wallet says “Spending cap”/),
      ).toBeInTheDocument();
      expect(screen.getByText(/authorizes exactly/)).toHaveTextContent('10 USDC');
      expect(screen.getByText(/never requests unlimited approval/)).toBeInTheDocument();
    });

    it('shows Approving in wallet… when approval tx is pending', () => {
      updateWagmiMock({
        isConnected: true,
        usdcAllowance: 0n,
        isPending: true,
      });
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      expect(
        screen.getByText(/Step 1\/2: Approving in wallet/),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
      expect(screen.getByRole('tab', { name: /SELL/i })).toBeDisabled();
    });

    it('opens the buy confirmation after the approval receipt succeeds', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      updateWagmiMock({
        isConnected: true,
        shouldConfirm: false,
        usdcAllowance: 0n,
        isSuccess: false,
      });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TradePanel token={createMockToken()} />
        </QueryClientProvider>,
      );
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      fireEvent.click(screen.getByText('Approve 10 USDC (1 of 2)'));

      updateWagmiMock({
        isConnected: true,
        shouldConfirm: true,
        usdcAllowance: 0n,
        isSuccess: true,
      });
      const tradeWrite = mockWagmiRef.current.useWriteContract().writeContract;
      rerender(
        <QueryClientProvider client={queryClient}>
          <TradePanel token={createMockToken()} />
        </QueryClientProvider>,
      );

      expect(
        await screen.findByText('Step 2/2: Opening trade confirmation…'),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(tradeWrite).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: 'buy',
            args: [10_000_000n, 495_000_000_000_000_000_000n],
            chainId: 5042002,
          }),
        );
      });
    });
  });

  // ─── Insufficient balance ───────────────────────────────────────────────

  describe('Insufficient balance', () => {
    beforeEach(() => {
      updateWagmiMock({
        isConnected: true,
        usdcAllowance: 10_000_000n,
        // Tiny balances so any amount triggers insufficient
        balanceValue: 1n,
        tokenBalance: 1n,
      });
    });

    it('shows Insufficient USDC balance when buy amount exceeds wallet', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });
      expect(
        screen.getByText('Insufficient USDC balance'),
      ).toBeInTheDocument();
    });

    it('shows Insufficient ADOGE balance when sell amount exceeds tokens', () => {
      renderWithProviders(<TradePanel token={createMockToken()} />);
      fireEvent.click(screen.getByRole('tab', { name: /SELL/i }));
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '1000' },
      });
      expect(
        screen.getByText('Insufficient ADOGE balance'),
      ).toBeInTheDocument();
    });
  });

  // ─── Transaction confirmation ───────────────────────────────────────────

  describe('Transaction confirmation', () => {
    beforeEach(() => {
      // shouldConfirm: false so txHash isn't pre-set on mount
      updateWagmiMock({
        isConnected: true,
        shouldConfirm: false,
        usdcAllowance: 10_000_000n,
      });
    });

    it('shows Confirming approval… after clicking approve', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      // Start with no confirming so the approve button is clickable
      updateWagmiMock({
        isConnected: true,
        shouldConfirm: false,
        usdcAllowance: 0n,
        isConfirming: false,
      });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TradePanel token={createMockToken()} />
        </QueryClientProvider>,
      );
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });

      // Click approve → txAction becomes 'approve'
      fireEvent.click(screen.getByText('Approve 10 USDC (1 of 2)'));

      // Now switch mock to confirming state and re-render
      updateWagmiMock({
        isConnected: true,
        shouldConfirm: true,
        usdcAllowance: 0n,
        isConfirming: true,
      });
      rerender(
        <QueryClientProvider client={queryClient}>
          <TradePanel token={createMockToken()} />
        </QueryClientProvider>,
      );

      expect(
        screen.getByText('Step 1/2: Confirming approval…'),
      ).toBeInTheDocument();
    });

    it('shows Confirming trade on Arc… after clicking trade', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      updateWagmiMock({
        isConnected: true,
        shouldConfirm: false,
        usdcAllowance: 10_000_000n,
        isConfirming: false,
      });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <TradePanel token={createMockToken()} />
        </QueryClientProvider>,
      );
      fireEvent.change(screen.getByPlaceholderText('0.00'), {
        target: { value: '10' },
      });

      // No approval needed → click trade button → txAction becomes 'trade'
      fireEvent.click(screen.getByText('BUY ADOGE'));

      // Switch to confirming state
      updateWagmiMock({
        isConnected: true,
        shouldConfirm: true,
        usdcAllowance: 10_000_000n,
        isConfirming: true,
      });
      rerender(
        <QueryClientProvider client={queryClient}>
          <TradePanel token={createMockToken()} />
        </QueryClientProvider>,
      );

      expect(
        screen.getByText('Step 2/2: Confirming trade on Arc…'),
      ).toBeInTheDocument();
    });

    it('shows success state when transaction is confirmed', () => {
      updateWagmiMock({
        isConnected: true,
        usdcAllowance: 1_000_000_000_000_000n,
        isSuccess: true,
      });
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(screen.getByText('✓ Bought $ADOGE')).toBeInTheDocument();
    });

    it('shows Confirming on Arc blockchain text when receipt is pending', () => {
      updateWagmiMock({
        isConnected: true,
        usdcAllowance: 1_000_000_000_000_000n,
        isConfirming: true,
        isSuccess: false,
      });
      renderWithProviders(<TradePanel token={createMockToken()} />);
      expect(
        screen.getByText(/Confirming on Arc blockchain/),
      ).toBeInTheDocument();
    });
  });
});
