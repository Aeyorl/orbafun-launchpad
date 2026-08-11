import { classifyWallet, classifyWalletForRanking } from './wallet-intelligence';

const usdc = (value: bigint) => value * 1_000_000n;

describe('Orba wallet tier classification', () => {
  it.each([
    [0n, 'shrimp'],
    [250n, 'fish'],
    [2_500n, 'dolphin'],
    [10_000n, 'whale'],
  ] as const)('classifies portfolio value %s USDC as %s', (portfolio, expected) => {
    expect(classifyWallet({
      portfolioValueMicroUsdc: usdc(portfolio),
      volume30dMicroUsdc: 0n,
      largestTradeMicroUsdc: 0n,
      confirmedTradeCount: 0,
    })).toBe(expected);
  });

  it('requires three trades for a volume promotion beyond fish', () => {
    const inputs = {
      portfolioValueMicroUsdc: 0n,
      volume30dMicroUsdc: usdc(50_000n),
      largestTradeMicroUsdc: 0n,
    };
    expect(classifyWallet({ ...inputs, confirmedTradeCount: 2 })).toBe('fish');
    expect(classifyWallet({ ...inputs, confirmedTradeCount: 3 })).toBe('whale');
  });

  it('allows fish classification from a single verified large trade', () => {
    expect(classifyWallet({
      portfolioValueMicroUsdc: 0n,
      volume30dMicroUsdc: 0n,
      largestTradeMicroUsdc: usdc(100n),
      confirmedTradeCount: 1,
    })).toBe('fish');
  });

  it('does not promote a wallet flagged for suspicious activity', () => {
    expect(classifyWalletForRanking({
      portfolioValueMicroUsdc: usdc(100_000n),
      volume30dMicroUsdc: usdc(1_000_000n),
      largestTradeMicroUsdc: usdc(50_000n),
      confirmedTradeCount: 100,
    }, true)).toBe('shrimp');
  });
});
