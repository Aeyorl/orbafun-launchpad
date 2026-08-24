import { describe, expect, it, vi } from 'vitest';
import {
  recoverLaunchMetadataAuth,
  saveLaunchMetadataWithRetry,
  validateLaunchMetadata,
} from '../launch-metadata';

describe('launch metadata', () => {
  it('treats a description-only launch as metadata that must be saved', () => {
    const result = validateLaunchMetadata({ description: '  Built for Arc.  ' });

    expect(result.error).toBeNull();
    expect(result.metadata).toEqual({
      description: 'Built for Arc.',
      banner: undefined,
      website: undefined,
      twitter: undefined,
      telegram: undefined,
      discord: undefined,
    });
    expect(Object.values(result.metadata).some(Boolean)).toBe(true);
  });

  it.each([
    ['orba_fun', 'orba_fun'],
    ['@orba_fun', 'orba_fun'],
    ['https://x.com/orba_fun', 'orba_fun'],
    ['https://www.twitter.com/orba_fun', 'orba_fun'],
  ])('canonicalizes supported Twitter input %s', (input, expected) => {
    expect(validateLaunchMetadata({ twitter: input })).toMatchObject({
      error: null,
      metadata: { twitter: expected },
    });
  });

  it('returns a field-level error before submission for an off-domain profile URL', () => {
    const result = validateLaunchMetadata({ twitter: 'https://example.com/orba_fun' });

    expect(result.metadata).toEqual({});
    expect(result.error).toContain('X / Twitter');
  });

  it('retries an indexing delay and then returns the saved metadata', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce({ status: 404 })
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValue({ twitter: 'orba_fun' });
    const waitFor = vi.fn().mockResolvedValue(undefined);

    await expect(saveLaunchMetadataWithRetry(save, waitFor)).resolves.toEqual({
      twitter: 'orba_fun',
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(waitFor).toHaveBeenNthCalledWith(1, 1_500);
    expect(waitFor).toHaveBeenNthCalledWith(2, 3_000);
  });

  it('stops immediately on a non-retryable metadata error', async () => {
    const error = { status: 400 };
    const save = vi.fn().mockRejectedValue(error);
    const waitFor = vi.fn().mockResolvedValue(undefined);

    await expect(saveLaunchMetadataWithRetry(save, waitFor)).rejects.toBe(error);
    expect(save).toHaveBeenCalledOnce();
    expect(waitFor).not.toHaveBeenCalled();
  });

  it('reports authentication recovery failure instead of attempting a save', async () => {
    const getAuthToken = vi.fn().mockReturnValue(null);
    const authenticate = vi.fn().mockResolvedValue(undefined);

    await expect(
      recoverLaunchMetadataAuth(getAuthToken, authenticate),
    ).rejects.toThrow('Wallet authentication did not complete');
    expect(authenticate).toHaveBeenCalledOnce();
    expect(getAuthToken).toHaveBeenCalledTimes(2);
  });
});
