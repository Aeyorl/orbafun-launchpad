'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { API_URL, ARC_CHAIN_ID } from './config';

let activeToken: string | null = null;
let activeWallet: string | null = null;
let activeExpiry = 0;

/**
 * Wallet-signature authentication. The bearer token is kept in memory only,
 * so a page reload requires a fresh signature and Web Storage cannot leak it.
 */
export function useAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authedWallet, setAuthedWallet] = useState<string | null>(null);

  const clearToken = useCallback(() => {
    activeToken = null;
    activeWallet = null;
    activeExpiry = 0;
    setAuthedWallet(null);
  }, []);

  useEffect(() => {
    if (
      activeToken && activeWallet && Date.now() < activeExpiry &&
      activeWallet.toLowerCase() === address?.toLowerCase()
    ) {
      setAuthedWallet(activeWallet);
      return;
    }
    if (activeToken) clearToken();
    setAuthedWallet(null);
  }, [address, clearToken]);

  const authenticate = useCallback(async () => {
    if (!address) {
      setError('Connect your wallet first');
      return;
    }
    setAuthenticating(true);
    setError(null);
    try {
      const nonceRes = await fetch(`${API_URL}/auth/nonce`);
      if (!nonceRes.ok) throw new Error(`Failed to get nonce: ${nonceRes.status}`);
      const { nonce } = await nonceRes.json();

      const message = constructAuthMessage(nonce, address);
      const signature = await signMessageAsync({ message });
      const verifyRes = await fetch(`${API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const response = await verifyRes.json().catch(() => ({}));
        throw new Error(response.message || `Verification failed: ${verifyRes.status}`);
      }

      const { token, wallet, expires } = await verifyRes.json();
      activeToken = token;
      activeWallet = wallet;
      activeExpiry = expires;
      setAuthedWallet(wallet);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      throw err;
    } finally {
      setAuthenticating(false);
    }
  }, [address, signMessageAsync]);

  const getAuthToken = useCallback((): string | null => {
    if (!authedWallet || Date.now() >= activeExpiry) {
      if (activeToken) clearToken();
      return null;
    }
    return activeToken;
  }, [authedWallet, clearToken]);

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

function constructAuthMessage(nonce: string, address: string): string {
  const domain = typeof window !== 'undefined' ? window.location.host : 'localhost';
  const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Orba',
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${ARC_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
  ].join('\n');
}
