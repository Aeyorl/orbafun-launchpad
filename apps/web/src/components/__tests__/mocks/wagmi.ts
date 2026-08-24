import { vi } from 'vitest';

/**
 * Mutable reference object — test files reassign `.current` between tests
 * to change what the wagmi mock returns. The mock factory (in TradePanel's
 * vi.mock) reads from this reference, so reassignment takes effect.
 */
export const mockWagmiStateRef: {
  current: ReturnType<typeof createMockWagmi>;
} = { current: createMockWagmi() };

/**
 * Factory for creating a mock wagmi module with overridable return values.
 *
 * Each call creates a fresh mock object with independent vi.fn() instances.
 */
export function createMockWagmi(overrides: {
  isConnected?: boolean;
  address?: `0x${string}`;
  chainId?: number;
  balanceValue?: bigint;
  balanceDecimals?: number;
  tokenBalance?: bigint;
  usdcAllowance?: bigint;
  tokenAllowance?: bigint;
  quote?: bigint;
  maxWallet?: bigint;
  isPending?: boolean;
  isConfirming?: boolean;
  isSuccess?: boolean;
  isSwitching?: boolean;
  shouldConfirm?: boolean;
  txHash?: `0x${string}`;
  atomicStatus?: 'supported' | 'ready' | 'unsupported';
  atomicError?: unknown;
  atomicResult?: {
    atomic: boolean;
    status: 'success' | 'failure' | 'pending' | undefined;
    statusCode?: number;
    receipts?: Array<{ transactionHash: `0x${string}` }>;
  };
  isAtomicPending?: boolean;
} = {}) {
  const {
    isConnected = true,
    address = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    chainId = 5042002,
    balanceValue = 100_000_000_000_000_000_000n,
    balanceDecimals = 18,
    tokenBalance = 1_000_000_000_000_000_000_000n,
    usdcAllowance = 0n,
    tokenAllowance = 0n,
    quote = 500_000_000_000_000_000_000n,
    maxWallet = 40_000_000n * 10n ** 18n,
    isPending = false,
    isConfirming = false,
    isSuccess = false,
    isSwitching = false,
    shouldConfirm = true,
    txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`,
    atomicStatus = 'unsupported',
    atomicError,
    atomicResult = {
      atomic: true,
      status: 'success',
      statusCode: 200,
      receipts: [{ transactionHash: txHash }],
    },
    isAtomicPending = false,
  } = overrides;

  const mockWriteContract = vi.fn();
  const mockSwitchChain = vi.fn();
  const mockConnect = vi.fn();
  const mockReset = vi.fn();
  const mockRefetch = vi.fn().mockResolvedValue(undefined);
  const mockSendCallsSyncAsync = atomicError
    ? vi.fn().mockRejectedValue(atomicError)
    : vi.fn().mockResolvedValue(atomicResult);

  return {
    createConfig: vi.fn(() => ({})),
    http: vi.fn(() => ({})),
    fallback: vi.fn((transports: unknown[]) => transports[0]),
    useAccount: () => ({
      address: isConnected ? address : undefined,
      isConnected,
      isConnecting: false,
      isReconnecting: false,
      isDisconnected: !isConnected,
      chainId,
      chain: isConnected ? { id: chainId } : undefined,
      status: isConnected ? 'connected' : 'disconnected',
    }),
    useBalance: () => ({
      data: { value: balanceValue, decimals: balanceDecimals, symbol: 'USDC', formatted: '100.0' },
      refetch: mockRefetch,
      isLoading: false,
      isError: false,
      error: null,
    }),
    useReadContract: ({ functionName }: { functionName: string }) => {
      const dataMap: Record<string, bigint | undefined> = {
        balanceOf: tokenBalance,
        allowance: functionName === 'allowance' ? usdcAllowance : tokenAllowance,
        quoteBuy: quote,
        quoteSell: quote / 2n,
        maxWallet,
      };
      return {
        data: dataMap[functionName] ?? dataMap.quoteBuy,
        refetch: mockRefetch,
        isLoading: false,
        isError: false,
        error: null,
      };
    },
    useWriteContract: () => ({
      writeContract: mockWriteContract,
      data: shouldConfirm ? txHash : undefined,
      isPending,
      isError: false,
      error: null,
      reset: mockReset,
    }),
    useWaitForTransactionReceipt: () => ({
      data: isSuccess ? { transactionHash: txHash } : undefined,
      isLoading: isConfirming,
      isSuccess,
      isError: false,
      error: null,
    }),
    useSwitchChain: () => ({
      switchChain: mockSwitchChain,
      isPending: isSwitching,
      error: null,
      chains: [{ id: 5042002 }],
    }),
    useConnect: () => ({
      connect: mockConnect,
      isPending: false,
      error: null,
      connectors: [],
    }),
    useConnectors: () => [
      { id: 'injected', name: 'Injected', type: 'injected' as const },
      { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' as const },
    ],
    useDisconnect: () => ({ disconnect: vi.fn() }),
    useCapabilities: () => ({
      data: { atomic: { status: atomicStatus } },
      isLoading: false,
      isError: false,
      error: null,
    }),
    useSendCallsSync: () => ({
      sendCallsSyncAsync: mockSendCallsSyncAsync,
      isPending: isAtomicPending,
      isError: false,
      error: null,
      reset: vi.fn(),
    }),
  };
}
