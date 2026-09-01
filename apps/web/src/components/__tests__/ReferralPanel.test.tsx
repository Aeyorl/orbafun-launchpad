// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReferralPanel } from '../ReferralPanel';

const mocks = vi.hoisted(() => ({
  wallet: '0x0000000000000000000000000000000000000011',
  getReferralStats: vi.fn(),
  getReferredWallets: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: mocks.wallet }),
}));

vi.mock('@/lib/use-auth', () => ({
  useAuth: () => ({
    authenticate: vi.fn(),
    authenticating: false,
    getAuthToken: () => 'token',
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getReferralStats: mocks.getReferralStats,
    getReferredWallets: mocks.getReferredWallets,
  },
}));

describe('ReferralPanel', () => {
  it('separates the editable profile name from the permanent referral code', async () => {
    mocks.getReferralStats.mockResolvedValue({
      wallet: mocks.wallet,
      total_referred: 0,
      active_referred: 0,
      total_volume_usdc: '0',
      reward_earned_usdc: '0',
      referral_code: 'mason-7k3p',
      referral_slug: 'mason-7k3p',
      partner_codes: [],
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ReferralPanel
          wallet={mocks.wallet}
          username="Mason"
          referralCode="mason-7k3p"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Profile name')).toBeInTheDocument();
    expect(screen.getByText('Permanent referral code')).toBeInTheDocument();
    expect(
      screen.getByText(/It never changes when you rename your profile/),
    ).toBeInTheDocument();
    expect(screen.getByText(/\?ref=mason-7k3p/)).toBeInTheDocument();
    expect(await screen.findByText('Total Referred')).toBeInTheDocument();
  });
});
