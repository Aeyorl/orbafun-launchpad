'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DiscordLogo,
  GlobeSimple,
  PencilSimple,
  TelegramLogo,
  XLogo,
} from '@phosphor-icons/react';

import { api, TokenMetadata } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';

function safeHref(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    // Bare handles are normalized by the individual social link renderers.
  }
  return null;
}

export function SocialLinks({
  tokenAddress,
  creatorWallet,
  variant = 'card',
  hideTwitter = false,
}: {
  tokenAddress: string;
  creatorWallet: string;
  variant?: 'card' | 'inline';
  hideTwitter?: boolean;
}) {
  const { address } = useAccount();
  const { getAuthToken, authenticate } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<TokenMetadata>>({});

  const isCreator = address?.toLowerCase() === creatorWallet.toLowerCase();
  const { data: meta } = useQuery({
    queryKey: ['token-metadata', tokenAddress],
    queryFn: () => api.getTokenMetadata(tokenAddress),
    staleTime: 30_000,
  });

  const hasLinks = Boolean(meta && (meta.website || meta.twitter || meta.telegram || meta.discord));

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
    } catch (error) {
      toast.error('Failed to update social links');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className={variant === 'inline' ? 'w-full rounded-lg border border-bg-border bg-bg-input p-4' : 'card'}>
        <h3 className="mb-3 font-semibold">Edit token profile</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <SocialInput label="Website" value={form.website || ''} placeholder="https://example.com" onChange={(website) => setForm({ ...form, website })} />
          <SocialInput label="X / Twitter" value={form.twitter || ''} placeholder="handle" onChange={(twitter) => setForm({ ...form, twitter })} />
          <SocialInput label="Telegram" value={form.telegram || ''} placeholder="https://t.me/group" onChange={(telegram) => setForm({ ...form, telegram })} />
          <SocialInput label="Discord" value={form.discord || ''} placeholder="https://discord.gg/invite" onChange={(discord) => setForm({ ...form, discord })} />
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-text-muted">About</span>
            <textarea
              className="input-field"
              rows={3}
              maxLength={500}
              placeholder="Tell people about this token"
              value={form.description || ''}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const linkClass = variant === 'inline'
    ? 'inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-accent-blue'
    : 'badge-blue hover:brightness-125 transition';

  const content = (
    <>
      {hasLinks ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {meta?.website && safeHref(meta.website) && (
            <a href={safeHref(meta.website)!} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <GlobeSimple size={15} weight="bold" aria-hidden="true" /> Website
            </a>
          )}
          {meta?.twitter && !hideTwitter && (
            <a href={`https://x.com/${meta.twitter.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <XLogo size={15} weight="bold" aria-hidden="true" /> X
            </a>
          )}
          {meta?.telegram && (
            <a
              href={meta.telegram.startsWith('http') ? (safeHref(meta.telegram) || '#') : `https://t.me/${meta.telegram}`}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <TelegramLogo size={15} weight="bold" aria-hidden="true" /> Telegram
            </a>
          )}
          {meta?.discord && safeHref(meta.discord) && (
            <a href={safeHref(meta.discord)!} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <DiscordLogo size={15} weight="bold" aria-hidden="true" /> Discord
            </a>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-muted">
          {isCreator ? 'Add links so traders can verify this token.' : 'No social links yet.'}
        </p>
      )}
      {isCreator && (
        <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-blue hover:underline">
          <PencilSimple size={14} weight="bold" aria-hidden="true" />
          {hasLinks ? 'Edit links' : 'Add links'}
        </button>
      )}
    </>
  );

  if (variant === 'inline') {
    return <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">{content}</div>;
  }

  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Socials</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">{content}</div>
      {meta?.description && <p className="mt-3 text-sm text-text-secondary">{meta.description}</p>}
    </div>
  );
}

function SocialInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs text-text-muted">{label}</span>
      <input className="input-field" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
