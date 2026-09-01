'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './use-auth';
import { api } from './api';

/**
 * useReferral — captures the ?ref=<wallet-or-referral-code> query param on first visit,
 * stores it in localStorage, and attributes the referral to the API once
 * the user authenticates (connects wallet + signs in).
 *
 * Flow:
 *   1. User visits https://orba.fun/?ref=mason-7k3p (shared link)
 *   2. This hook stores the code in localStorage as 'orbafun_referrer'
 *   3. When the user authenticates (useAuth returns a token), the hook
 *      calls POST /referrals/attribute with the stored code.
 *   4. On success (or conflict), the referrer is cleared from localStorage.
 *
 * First-click-wins: if the wallet was already attributed to someone else,
 * the API returns 409 Conflict and we silently clear the stored referrer.
 */
const REFERRER_KEY = 'orbafun_referrer';

export function useReferral() {
  const { getAuthToken, isAuthenticated, authedWallet } = useAuth();
  const [referrer, setReferrer] = useState<string | null>(null);
  const [attributed, setAttributed] = useState(false);

  // Capture ?ref= on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check URL first.
    const params = new URLSearchParams(window.location.search);
    const refFromUrl = params.get('ref');
    const normalized = refFromUrl?.trim().toLowerCase();
    const isWallet = !!normalized && /^0x[a-f0-9]{40}$/.test(normalized);
    const isReferralCode =
      !!normalized && /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(normalized);
    if (normalized && (isWallet || isReferralCode)) {
      localStorage.setItem(REFERRER_KEY, normalized);
      setReferrer(normalized);
      // Clean the URL (remove ?ref= so it doesn't get re-shared with the
      // user's own referrer when they copy the link).
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
      return;
    }

    // Fall back to stored referrer (from a previous visit).
    const stored = localStorage.getItem(REFERRER_KEY);
    if (stored) setReferrer(stored);
  }, []);

  // Attribute when authenticated.
  const attribute = useCallback(async () => {
    if (!referrer || !authedWallet || !isAuthenticated) return;
    // Don't attribute to yourself.
    if (referrer === authedWallet.toLowerCase()) return;

    const token = getAuthToken();
    try {
      await api.attributeReferral(referrer, authedWallet, token);
      setAttributed(true);
      localStorage.removeItem(REFERRER_KEY);
      setReferrer(null);
    } catch (err: any) {
      // 409 Conflict = already attributed to someone else. Clear and move on.
      if (err?.message?.includes('already') || err?.message?.includes('409')) {
        localStorage.removeItem(REFERRER_KEY);
        setReferrer(null);
      }
      // Other errors: leave the referrer in localStorage for retry.
    }
  }, [referrer, authedWallet, isAuthenticated, getAuthToken]);

  useEffect(() => {
    if (isAuthenticated && authedWallet && referrer && !attributed) {
      attribute();
    }
  }, [isAuthenticated, authedWallet, referrer, attributed, attribute]);

  return { referrer, attributed, attribute };
}
