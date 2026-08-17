import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const LEGACY_TOKEN = '0x24797f2c26b35d811c985c7c3c96d7c823c7cc3b';
const HARDENED_TOKEN = '0xa97c5e4ad40dee778b71976ebb131c9356c59bfa';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('token route visibility boundary', () => {
  it('permits the Reown services required by WalletConnect', async () => {
    const response = await proxy(new NextRequest('https://www.orba.fun/'));
    const csp = response.headers.get('Content-Security-Policy');

    expect(csp).toContain('https://fonts.reown.com');
    expect(csp).toContain('wss://relay.walletconnect.com');
    expect(csp).toContain('wss://relay.walletconnect.org');
    expect(csp).toContain('https://pulse.walletconnect.org');
    expect(csp).toContain('https://api.web3modal.org');
    expect(csp).toContain('https://verify.walletconnect.org');
  });

  it.each(['coin', 'trade'])('returns 404 for a hidden token on /%s', async (route) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(
      new NextRequest(`https://www.orba.fun/${route}/${LEGACY_TOKEN}`),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000/tokens/${LEGACY_TOKEN}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('allows a visible hardened token route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    const response = await proxy(
      new NextRequest(`https://www.orba.fun/trade/${HARDENED_TOKEN}`),
    );

    expect(response.status).toBe(200);
  });

  it('returns 503 instead of exposing an unverified token when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));

    const response = await proxy(
      new NextRequest(`https://www.orba.fun/trade/${LEGACY_TOKEN}`),
    );

    expect(response.status).toBe(503);
  });
});
