import {
  HARDENED_ARC_TESTNET_FACTORY,
  getIndexedFactoryAddresses,
  getPublicFactoryAddresses,
  publicFactoryClause,
} from './factory-scope';

describe('factory scope', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES;
    delete process.env.TOKEN_FACTORY_ADDRESSES;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('defaults tests to the hardened factory only', () => {
    expect(getPublicFactoryAddresses()).toEqual([HARDENED_ARC_TESTNET_FACTORY]);
    expect(getIndexedFactoryAddresses()).toEqual([HARDENED_ARC_TESTNET_FACTORY]);
  });

  it('normalizes and deduplicates configured addresses', () => {
    process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES =
      '0xF09FC443D4f0F217F1B65d112b5fB8928a4ff09E,0xf09fc443d4f0f217f1b65d112b5fb8928a4ff09e';
    expect(getPublicFactoryAddresses()).toEqual([HARDENED_ARC_TESTNET_FACTORY]);
  });

  it('fails closed outside tests when no public scope is configured', () => {
    process.env.NODE_ENV = 'production';
    expect(() => getPublicFactoryAddresses()).toThrow(
      'PUBLIC_TOKEN_FACTORY_ADDRESSES must contain at least one factory address',
    );
  });

  it('rejects invalid addresses and unsafe SQL aliases', () => {
    process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES = 'not-an-address';
    expect(() => getPublicFactoryAddresses()).toThrow('invalid factory address');
    expect(() => publicFactoryClause('t; DROP TABLE tokens', 1)).toThrow('Unsafe SQL alias');
  });
});
