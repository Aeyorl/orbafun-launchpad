'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { ipfsToGateway } from '@/lib/utils';
import { useAuth } from '@/lib/use-auth';


/**
 * ImageUploader — drag-and-drop or click-to-upload image component.
 *
 * Uploads to the API's /upload/image endpoint, which pins to Pinata IPFS.
 * Returns an `ipfs://<cid>` URI to the parent via the `onUploaded` callback.
 *
 * If the upload service is not configured (PINATA_JWT missing), falls back
 * to a URL text input so users can paste an existing image URL.
 *
 * Props:
 *  - value: current image URI (ipfs://... or https://...)
 *  - onChange: called with the new URI whenever it changes
 *  - symbol: used for the emoji fallback preview
 *  - label: optional override for the field label (default "Token Logo")
 *  - shape: "round" (default, square avatar) or "wide" (banner cover preview)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — matches the backend limit
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function ImageUploader({
  value,
  onChange,
  symbol,
  label = 'Token Logo',
  shape = 'round',
  onUploadingChange,
}: {
  value: string;
  onChange: (uri: string) => void;
  symbol?: string;
  label?: string;
  shape?: 'round' | 'wide';
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploadEnabled, setUploadEnabled] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const { authenticate, getAuthToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards against the preview-sync useEffect overwriting the local blob URL
  // while an IPFS upload is in progress. Without this, uploading a PFP can
  // clobber the banner preview (and vice versa) because the parent re-renders
  // both ImageUploader instances when either one calls onChange.
  const isUploadingRef = useRef(false);
  // Track the current blob URL so we can revoke it on cleanup or replacement
  // instead of immediately in the upload handler (mobile browsers reclaim
  // revoked blob URLs when the app is backgrounded).
  const blobUrlRef = useRef<string | null>(null);

  // Check if the upload service is available.
  useEffect(() => {
    fetch(`${API_URL}/upload/status`)
      .then((r) => r.json())
      .then((d) => setUploadEnabled(d.enabled))
      .catch(() => setUploadEnabled(false));
  }, []);

  // Build a display URL for the preview from the current value.
  // Skip if an upload is in-flight — the local blob preview is more current.
  useEffect(() => {
    if (isUploadingRef.current) return;
    if (!value) {
      setPreview(null);
      return;
    }
    setPreview(ipfsToGateway(value));
  }, [value]);

  // Revoke stale blob URLs on unmount.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_SIZE) {
        setError('File too large (max 5 MB)');
        return;
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setError('Please select a PNG, JPEG, GIF, or WebP image');
        return;
      }

      // Revoke previous blob URL before creating a new one.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }

      // Show local preview immediately.
      const localUrl = URL.createObjectURL(file);
      blobUrlRef.current = localUrl;
      setPreview(localUrl);

      isUploadingRef.current = true;
      setUploading(true);
      onUploadingChange?.(true);
      try {
        let authToken = getAuthToken();
        if (!authToken) {
          await authenticate();
          authToken = getAuthToken();
        }
        if (!authToken) throw new Error('Wallet authentication is required to upload');

        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${API_URL}/upload/image`, {
          method: 'POST',
          headers: { 'x-auth-token': authToken },
          body: form,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        onChange(data.uri);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
        setPreview(null);
        // Revoke on error since we won't need this preview.
        if (blobUrlRef.current === localUrl) {
          URL.revokeObjectURL(localUrl);
          blobUrlRef.current = null;
        }
      } finally {
        isUploadingRef.current = false;
        setUploading(false);
        onUploadingChange?.(false);
        // Note: we do NOT revoke the blob URL here — mobile browsers reclaim
        // revoked URLs when backgrounded, causing the preview to vanish.
        // Cleanup happens on unmount or when a new file replaces it.
      }
    },
    [authenticate, getAuthToken, onChange, onUploadingChange],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // Upload service not available — fall back to URL input.
  if (uploadEnabled === false) {
    return (
      <div>
        <label htmlFor={`${label}-url-input`} className="text-sm font-medium mb-1 block">
          {label} URL <span className="text-text-muted">(optional)</span>
        </label>
        <input
          id={`${label}-url-input`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ipfs://... or https://..."
          className="input"
        />
        <p className="text-xs text-text-muted mt-1">
          IPFS URI or direct image URL. Image upload is not configured on the
          server — paste a URL instead.
        </p>
        {preview && (
          <div className="mt-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className={
                shape === 'wide'
                  ? 'w-24 h-12 object-cover bg-bg-input border border-bg-border'
                  : 'w-12 h-12 rounded-full object-cover bg-bg-input'
              }
              onError={() => setPreview(null)}
            />
            <span className="text-xs text-text-muted">Preview</span>
          </div>
        )}
      </div>
    );
  }

  // Still checking availability — show a neutral state.
  if (uploadEnabled === null) {
    return (
      <div>
        <label className="text-sm font-medium mb-1 block">
          {label} <span className="text-text-muted">(optional)</span>
        </label>
        <div className="input-field h-32 flex items-center justify-center text-text-muted text-sm">
          Checking upload availability…
        </div>
      </div>
    );
  }

  // Upload is available — show drag-and-drop zone.
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">
        {label} <span className="text-text-muted">(optional)</span>
      </label>

      {preview ? (
        // Show preview with change/remove buttons.
        <div className={`flex items-center gap-4 ${shape === 'wide' ? 'flex-col items-stretch' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={label}
            className={
              shape === 'wide'
                ? 'w-full h-32 object-cover bg-bg-input border border-bg-border'
                : 'w-20 h-20 rounded-full object-cover bg-bg-input border border-bg-border'
            }
            onError={() => setPreview(null)}
          />
          <div className="flex-1 space-y-2">
            <p className="text-xs text-text-muted">
              {uploading ? 'Uploading to IPFS…' : 'Uploaded ✓'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary text-xs px-3 py-1"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setPreview(null);
                }}
                disabled={uploading}
                className="btn-secondary text-xs px-3 py-1"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Drop zone — a <button> for keyboard accessibility (Enter/Space activate).
        <button
          type="button"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`input-field h-32 flex flex-col items-center justify-center cursor-pointer transition-colors text-left ${
            dragOver
              ? 'border-accent-green bg-accent-green/5'
              : 'hover:border-accent-green/30 hover:bg-bg-hover'
          }`}
          aria-label={`Upload ${label.toLowerCase()} — click or drag a file`}
        >
          <UploadSimple size={28} className="mb-2" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            {dragOver ? 'Drop image here' : 'Click or drag to upload'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            PNG, JPEG, GIF, WebP · max 5 MB
          </p>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = ''; // allow re-uploading the same file
        }}
        className="hidden"
      />

      {uploading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <span className="inline-block w-3 h-3 border-2 border-accent-green border-t-transparent rounded-full animate-spin" />
          Uploading to IPFS…
        </div>
      )}
      {error && (
        <p className="text-xs text-accent-red mt-2">{error}</p>
      )}
    </div>
  );
}
