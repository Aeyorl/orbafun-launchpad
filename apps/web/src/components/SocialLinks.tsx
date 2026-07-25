'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, TokenMetadata } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';

/**
 * Sanitize a URL for safe use as an href attribute.
 * Only allows http:// and https:// schemes — rejects javascript:, data:, etc.
 * This is defense-in-depth; the API also validates URL schemes server-side.
 */
function safeHref(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    // Not a valid URL — could be a bare handle, check below
  }
  return null;
}

/**
 * SocialLinks — displays a token's social links (website, twitter, telegram,
 * discord) and, if the connected wallet is the token creator, shows an "Edit"
 * button to add/update them via the off-chain metadata API.
 */
export function SocialLinks({ tokenAddress, creatorWallet }: { tokenAddress: string; creatorWallet: string }) {
  const { address } = useAccount();
  const { getAuthToken, authenticate } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<TokenMetadata>>({});

  const isCreator = address && address.toLowerCase() === creatorWallet.toLowerCase();

  const { data: meta } = useQuery({
    queryKey: ['token-metadata', tokenAddress],
    queryFn: () => api.getTokenMetadata(tokenAddress),
    staleTime: 30_000,
  });

  const hasLinks = meta && (meta.website || meta.twitter || meta.telegram || meta.discord);

  const startEdit = () => {
    setForm({
      website: meta?.website || '',
      twitter: meta?.twitter || '',
      telegram: meta?.telegram || '',
      discord: meta?.discord || '',
      description: meta?.description || '',
    });
    setEditing(true);
  };

  const save = async () => {
    if (!address) return;
    // Ensure authenticated
    let token = getAuthToken();
    if (!token) {
      try {
        await authenticate();
        token = getAuthToken();
      } catch {
        toast.error('Authentication required to update social links');
        return;
      }
    }
    setSaving(true);
    try {
      await api.setTokenMetadata(tokenAddress, address, form, token);
      await queryClient.invalidateQueries({ queryKey: ['token-metadata', tokenAddress] });
      toast.success('Social links updated');
      setEditing(false);
    } catch (err) {
      toast.error('Failed to update social links');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-3">Edit Social Links</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="social-website" className="text-xs text-text-muted block mb-1">Website</label>
            <input
              id="social-website"
              className="input-field"
              placeholder="https://example.com"
              value={form.website || ''}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="social-twitter" className="text-xs text-text-muted block mb-1">Twitter / X</label>
            <input
              id="social-twitter"
              className="input-field"
              placeholder="handle (without @)"
              value={form.twitter || ''}
              onChange={(e) => setForm({ ...form, twitter: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="social-telegram" className="text-xs text-text-muted block mb-1">Telegram</label>
            <input
              id="social-telegram"
              className="input-field"
              placeholder="https://t.me/yourgroup"
              value={form.telegram || ''}
              onChange={(e) => setForm({ ...form, telegram: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="social-discord" className="text-xs text-text-muted block mb-1">Discord</label>
            <input
              id="social-discord"
              className="input-field"
              placeholder="https://discord.gg/invite"
              value={form.discord || ''}
              onChange={(e) => setForm({ ...form, discord: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="social-description" className="text-xs text-text-muted block mb-1">Description</label>
            <textarea
              id="social-description"
              className="input-field"
              rows={3}
              maxLength={500}
              placeholder="Tell people about your token"
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} aria-disabled={saving} className="btn-primary text-sm flex-1">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Socials</h3>
        {isCreator && (
          <button onClick={startEdit} className="text-xs text-accent-green hover:underline">
            {hasLinks ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>
      {hasLinks ? (
        <div className="flex flex-wrap gap-2">
          {meta?.website && safeHref(meta.website) && (
            <a
              href={safeHref(meta.website)!}
              target="_blank"
              rel="noopener noreferrer"
              className="badge-blue hover:brightness-125 transition"
              aria-label="Website (opens in new tab)"
            >
              🌐 Website <span className="sr-only">(opens in new tab)</span>
            </a>
          )}
          {meta?.twitter && (
            <a
              href={`https://x.com/${meta.twitter.replace(/^@/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="badge-blue hover:brightness-125 transition"
              aria-label={`Twitter @${meta.twitter.replace(/^@/, '')} (opens in new tab)`}
            >
              𝕏 @{meta.twitter.replace(/^@/, '')} <span className="sr-only">(opens in new tab)</span>
            </a>
          )}
          {meta?.telegram && (
            <a
              href={meta.telegram.startsWith('http') ? (safeHref(meta.telegram) || '#') : `https://t.me/${meta.telegram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="badge-blue hover:brightness-125 transition"
              aria-label="Telegram (opens in new tab)"
            >
              ✈️ Telegram <span className="sr-only">(opens in new tab)</span>
            </a>
          )}
          {meta?.discord && safeHref(meta.discord || '') && (
            <a
              href={safeHref(meta.discord!)!}
              target="_blank"
              rel="noopener noreferrer"
              className="badge-blue hover:brightness-125 transition"
              aria-label="Discord (opens in new tab)"
            >
              🎮 Discord <span className="sr-only">(opens in new tab)</span>
            </a>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          {isCreator ? 'Add social links so people can verify and follow your token.' : 'No social links yet.'}
        </p>
      )}
      {meta?.description && meta.description !== '' && (
        <p className="text-sm text-text-secondary mt-3">{meta.description}</p>
      )}
    </div>
  );
}
