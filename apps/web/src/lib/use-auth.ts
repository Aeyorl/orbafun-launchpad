'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { API_URL } from './config';

const TOKEN_KEY = 'orbafun_auth_token';
const WALLET_KEY = 'orbafun_auth_wallet';
const TOKEN_EXPIRY_KEY = 'orbafun_auth_expires';

/**
 * useAuth — wallet signature authentication hook.
 *
 * Flow:
 *   1. User connects wallet
 *   2. call authenticate() — gets nonce from API, signs message, verifies
 *   3. Token stored in localStorage and available via getAuthToken()
 *   4. Token auto-clears on expiry or wallet disconnect
 *
 * The token is sent in the `x-auth-token` header for write requests
 * (posting messages, favorites, token metadata).
 */
export function useAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The wallet address associated with the stored token.
  const [authedWallet, setAuthedWallet] = useState<string | null>(null);

  // Check if we have a valid token on mount and when address changes.
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedWallet = localStorage.getItem(WALLET_KEY);
    const storedExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (storedToken && storedWallet && storedExpiry) {
      const expiry = parseInt(storedExpiry, 10);
      if (Date.now() < expiry) {
        if (storedWallet.toLowerCase() === address?.toLowerCase()) {
          setAuthedWallet(storedWallet);
          return;
        }
      }
      // Token expired or wallet mismatch — clear it.
      clearToken();
    }
    setAuthedWallet(null);
  }, [address]);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    setAuthedWallet(null);
  }, []);

  const authenticate = useCallback(async () => {
    if (!address) {
      setError('Connect your wallet first');
      return;
    }
    setAuthenticating(true);
    setError(null);
    try {
      // 1. Get nonce from API
      const nonceRes = await fetch(`${API_URL}/auth/nonce`);
      if (!nonceRes.ok) {
        throw new Error(`Failed to get nonce: ${nonceRes.status}`);
      }
      const { nonce } = await nonceRes.json();

      // 2. Construct SIWE-like message
      const message = constructAuthMessage(nonce, address);

      // 3. Sign with wallet
      const signature = await signMessageAsync({ message });

      // 4. Verify with API
      const verifyRes = await fetch(`${API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.message || `Verification failed: ${verifyRes.status}`);
      }
      const { token, wallet, expires } = await verifyRes.json();

      // 5. Store token
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(WALLET_KEY, wallet);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expires));
      setAuthedWallet(wallet);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
      throw err;
    } finally {
      setAuthenticating(false);
    }
  }, [address, signMessageAsync]);

  const getAuthToken = useCallback((): string | null => {
    if (!authedWallet) return null;
    return localStorage.getItem(TOKEN_KEY);
  }, [authedWallet]);

  return {
    authenticate,
    clearToken,
    getAuthToken,
    authedWallet,
    authenticating,
    error,
    isAuthenticated: !!authedWallet && authedWallet.toLowerCase() === address?.toLowerCase(),
  };
}

/**
 * Construct a SIWE-like message for the user to sign.
 * Includes the domain, wallet address, nonce, and expiry.
 */
function constructAuthMessage(nonce: string, address: string): string {
  const domain = typeof window !== 'undefined' ? window.location.host : 'localhost';
  const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const issuedAt = new Date().toISOString();
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Orba',
    '',
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: 5042002`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}
