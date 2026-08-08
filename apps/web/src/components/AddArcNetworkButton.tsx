'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { useState } from 'react';
import { ARC_CHAIN_ID, ARC_NETWORK_NAME } from '@/lib/config';

/**
 * AddArcNetworkButton — adds the Arc testnet network to the user's wallet
 * via EIP-3085 (wallet_addEthereumChain). Uses wagmi's useSwitchChain,
 * which calls wallet_addEthereumChain under the hood when the chain isn't
 * already in the wallet, then switches to it.
 *
 * Renders as a compact button below the Orba description in the footer.
 * If no wallet is connected, shows a disabled state with a tooltip.
 */
export function AddArcNetworkButton() {
  const { isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const handleAdd = async () => {
    setError(null);
    try {
      await switchChain(
        { chainId: ARC_CHAIN_ID },
        {
          onError: (err) => {
            setError(err.message || 'Failed to add network');
          },
          onSuccess: () => {
            setAdded(true);
            setTimeout(() => setAdded(false), 3000);
          },
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add network');
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={handleAdd}
        disabled={!isConnected || isPending}
        className="btn-secondary text-xs px-3 py-1.5 w-full sm:w-auto inline-flex items-center justify-center gap-2"
        title={
          !isConnected
            ? 'Connect your wallet first to add the Arc network'
            : `Add ${ARC_NETWORK_NAME} to your wallet (EIP-3085)`
        }
      >
        {/* Arc orb icon — small inline SVG so it works without asset loading */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 220 220"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <circle cx="110" cy="110" r="80" fill="#2775CA" />
          <path
            d="M 52 145 Q 90 145 99 120 T 124 90 Q 141 74 172 74"
            fill="none"
            stroke="#ffffff"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="172" cy="74" r="7" fill="#ffffff" />
        </svg>
        {isPending
          ? 'Adding…'
          : added
            ? 'Added ✓'
            : 'Add Arc Network'}
      </button>
      {!isConnected && (
        <p className="text-text-muted text-[10px] mt-1.5">
          Connect wallet to add Arc automatically
        </p>
      )}
      {error && (
        <p className="text-accent-red text-[10px] mt-1.5">{error}</p>
      )}
    </div>
  );
}
