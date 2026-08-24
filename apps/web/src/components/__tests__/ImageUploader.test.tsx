/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ImageUploader } from '../ImageUploader';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:local-preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ImageUploader', () => {
  it('keeps the local preview visible after a successful IPFS upload', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/upload/status')) {
        return { ok: true, json: async () => ({ enabled: true }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ uri: 'ipfs://QmUploadedImage' }),
      } as Response;
    }));

    function ControlledUploader() {
      const [value, setValue] = useState('');
      return (
        <ImageUploader
          value={value}
          onChange={(uri) => {
            setValue(uri);
            onChange(uri);
          }}
          label="Upload Avatar"
        />
      );
    }

    const { container } = render(<ControlledUploader />);
    await screen.findByRole('button', { name: /upload token image/i });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['image'], 'avatar.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('ipfs://QmUploadedImage'));
    expect(screen.getByRole('img', { name: 'Upload Avatar' }))
      .toHaveAttribute('src', 'blob:local-preview');
  });

  it('tries alternate gateways when a restored IPFS preview fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true }),
    }) as Response));

    render(
      <ImageUploader
        value="ipfs://QmExistingImage"
        onChange={vi.fn()}
        label="Upload Avatar"
      />,
    );

    const preview = await screen.findByRole('img', { name: 'Upload Avatar' });
    expect(preview).toHaveAttribute(
      'src',
      'https://gateway.pinata.cloud/ipfs/QmExistingImage',
    );
    fireEvent.error(preview);
    expect(preview).toHaveAttribute('src', 'https://dweb.link/ipfs/QmExistingImage');
    fireEvent.error(preview);
    expect(preview).toHaveAttribute('src', 'https://ipfs.io/ipfs/QmExistingImage');
  });
});
