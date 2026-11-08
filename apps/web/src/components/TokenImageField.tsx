'use client';

import { useState } from 'react';

const api = process.env.NODE_ENV === 'development'
  ? process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001'
  : '';

export function imageHref(value: string) {
  const cid = /^ipfs:\/\/([a-zA-Z0-9]{46,120})$/.exec(value)?.[1];
  return cid ? `https://ipfs.io/ipfs/${cid}` : value;
}

export function TokenImageField({ value, onChange, onBusy }: {
  value: string;
  onChange: (value: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = imageHref(value.trim());

  async function upload(file: File) {
    setError('');
    if (file.size > 1024 * 1024) {
      setError('Choose an image under 1 MB.');
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      const response = await fetch(`${api}/api/images`, {
        method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' },
      });
      if (!response.ok) {
        if (response.status === 415) throw new Error('Choose a PNG, JPEG, GIF, or WebP image.');
        if (response.status === 507) throw new Error('Upload storage is full. Use an HTTPS or IPFS link.');
        throw new Error('Image upload failed. Try again or use a link.');
      }
      const { path } = await response.json() as { path: string };
      onChange(new URL(path, api || window.location.origin).href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Image upload failed.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return <fieldset className="space-y-2">
    <legend>Token image <span className="text-text-secondary">(optional)</span></legend>
    <label className="block text-sm">
      {busy ? 'Uploading image…' : 'Upload an image from your device'}
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={busy}
        className="mt-1 block w-full text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }} />
    </label>
    <label className="block text-sm">Or use an image link
      <input className="input mt-1 w-full" value={value} disabled={busy} maxLength={500}
        placeholder="https:// or ipfs://" onChange={(event) => onChange(event.target.value)} />
    </label>
    {preview.startsWith('https://') && <img src={preview} alt="Token image preview" referrerPolicy="no-referrer" className="h-20 w-20 rounded-lg object-cover" />}
    {error && <p role="status" className="text-sm text-accent-red">{error}</p>}
  </fieldset>;
}
