import { TokenMetadataService } from './token-metadata.service';

describe('TokenMetadataService', () => {
  const tokenAddress = '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';
  const creatorWallet = '0x1111111111111111111111111111111111111111';
  const db = { queryOne: jest.fn() };
  let service: TokenMetadataService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenMetadataService(db as never);
    db.queryOne.mockResolvedValueOnce({ creator_wallet: creatorWallet });
  });

  it.each([
    ['orba_fun', 'orba_fun'],
    ['@orba_fun', 'orba_fun'],
    ['https://x.com/orba_fun', 'orba_fun'],
    ['https://www.twitter.com/orba_fun', 'orba_fun'],
  ])('stores Twitter input %s as canonical handle', async (input, canonical) => {
    const saved = {
      token_address: tokenAddress.toLowerCase(),
      website: null,
      twitter: canonical,
      telegram: null,
      discord: null,
      description: null,
      banner: null,
      updated_at: new Date().toISOString(),
    };
    db.queryOne.mockResolvedValueOnce(saved);

    await expect(
      service.setMetadata(tokenAddress, creatorWallet, { twitter: input }),
    ).resolves.toEqual(saved);

    expect(db.queryOne.mock.calls[1][1]).toEqual([
      tokenAddress.toLowerCase(),
      null,
      canonical,
      null,
      null,
      null,
      null,
    ]);
  });

  it.each([
    'https://example.com/orba_fun',
    'https://x.com/orba_fun/status/123',
    'https://x.com/orba_fun?ref=unsafe',
    'javascript:alert(1)',
  ])('rejects unsafe or off-profile Twitter input %s', async (twitter) => {
    await expect(
      service.setMetadata(tokenAddress, creatorWallet, { twitter }),
    ).rejects.toThrow('Twitter must be a handle');
    expect(db.queryOne).toHaveBeenCalledTimes(1);
  });

  it('persists a trimmed description in the metadata upsert', async () => {
    const saved = {
      token_address: tokenAddress.toLowerCase(),
      website: null,
      twitter: null,
      telegram: null,
      discord: null,
      description: 'A coin for Arc builders.',
      banner: null,
      updated_at: new Date().toISOString(),
    };
    db.queryOne.mockResolvedValueOnce(saved);

    await service.setMetadata(tokenAddress, creatorWallet, {
      description: '  A coin for Arc builders.  ',
    });

    expect(db.queryOne.mock.calls[1][1]).toEqual([
      tokenAddress.toLowerCase(),
      null,
      null,
      null,
      null,
      'A coin for Arc builders.',
      null,
    ]);
  });
});
