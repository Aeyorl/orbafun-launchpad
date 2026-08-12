import { isAddress } from 'viem';

export const HARDENED_ARC_TESTNET_FACTORY =
  '0xf09fc443d4f0f217f1b65d112b5fb8928a4ff09e';

function parseAddressList(name: string, raw: string | undefined): string[] {
  const addresses = (raw || '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  if (addresses.length === 0) {
    throw new Error(`${name} must contain at least one factory address`);
  }
  for (const address of addresses) {
    if (!isAddress(address)) {
      throw new Error(`${name} contains an invalid factory address`);
    }
  }
  return Array.from(new Set(addresses));
}

/** Factories whose tokens may be returned by any public application surface. */
export function getPublicFactoryAddresses(): string[] {
  const configured = process.env.PUBLIC_TOKEN_FACTORY_ADDRESSES;
  if (!configured && process.env.NODE_ENV === 'test') {
    return [HARDENED_ARC_TESTNET_FACTORY];
  }
  return parseAddressList('PUBLIC_TOKEN_FACTORY_ADDRESSES', configured);
}

/** Factories trusted as event emitters by the Arc poller. */
export function getIndexedFactoryAddresses(): string[] {
  const configured = process.env.TOKEN_FACTORY_ADDRESSES;
  if (!configured && process.env.NODE_ENV === 'test') {
    return [HARDENED_ARC_TESTNET_FACTORY];
  }
  return parseAddressList('TOKEN_FACTORY_ADDRESSES', configured);
}

export function publicFactoryClause(alias: string, parameter: number): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) {
    throw new Error('Unsafe SQL alias');
  }
  return `LOWER(${alias}.factory_address) = ANY($${parameter}::text[])`;
}

