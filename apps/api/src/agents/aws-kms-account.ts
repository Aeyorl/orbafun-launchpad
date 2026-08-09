import { GetPublicKeyCommand, KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { createPublicKey } from 'crypto';
import {
  bytesToHex,
  keccak256,
  recoverAddress,
  serializeTransaction,
} from 'viem';
import { publicKeyToAddress, toAccount } from 'viem/accounts';

const SECP256K1_ORDER = BigInt(
  '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
);

type KmsClientLike = Pick<KMSClient, 'send'>;

function readDerLength(bytes: Uint8Array, offset: number): [number, number] {
  const first = bytes[offset];
  if (first === undefined) throw new Error('Invalid DER signature length');
  if ((first & 0x80) === 0) return [first, offset + 1];
  const count = first & 0x7f;
  if (count === 0 || count > 2) throw new Error('Unsupported DER signature length');
  let length = 0;
  for (let i = 0; i < count; i++) {
    const value = bytes[offset + 1 + i];
    if (value === undefined) throw new Error('Truncated DER signature length');
    length = (length << 8) | value;
  }
  return [length, offset + 1 + count];
}

function readDerInteger(bytes: Uint8Array, offset: number): [bigint, number] {
  if (bytes[offset] !== 0x02) throw new Error('Invalid DER integer');
  const [length, valueOffset] = readDerLength(bytes, offset + 1);
  if (length === 0 || valueOffset + length > bytes.length) {
    throw new Error('Truncated DER integer');
  }
  return [BigInt(bytesToHex(bytes.slice(valueOffset, valueOffset + length))), valueOffset + length];
}

export function parseKmsDerSignature(signature: Uint8Array): { r: bigint; s: bigint } {
  if (signature[0] !== 0x30) throw new Error('Invalid DER signature sequence');
  const [sequenceLength, sequenceOffset] = readDerLength(signature, 1);
  if (sequenceOffset + sequenceLength !== signature.length) {
    throw new Error('Invalid DER signature size');
  }
  const [r, sOffset] = readDerInteger(signature, sequenceOffset);
  const [rawS, endOffset] = readDerInteger(signature, sOffset);
  if (endOffset !== signature.length || r <= 0n || rawS <= 0n) {
    throw new Error('Invalid DER signature values');
  }
  const s = rawS > SECP256K1_ORDER / 2n ? SECP256K1_ORDER - rawS : rawS;
  return { r, s };
}

function bigintToHex32(value: bigint): `0x${string}` {
  if (value <= 0n || value >= SECP256K1_ORDER) {
    throw new Error('KMS signature scalar is outside secp256k1 range');
  }
  return `0x${value.toString(16).padStart(64, '0')}`;
}

function base64UrlToHex(value: string): string {
  return Buffer.from(value, 'base64url').toString('hex').padStart(64, '0');
}

export async function createAwsKmsAccount(options: {
  keyId: string;
  expectedAddress: string;
  region?: string;
  client?: KmsClientLike;
}) {
  const client = options.client || new KMSClient({ region: options.region });
  const publicKeyResponse = await client.send(new GetPublicKeyCommand({ KeyId: options.keyId }));
  if (
    !publicKeyResponse.PublicKey ||
    publicKeyResponse.KeySpec !== 'ECC_SECG_P256K1' ||
    publicKeyResponse.KeyUsage !== 'SIGN_VERIFY' ||
    !publicKeyResponse.SigningAlgorithms?.includes('ECDSA_SHA_256')
  ) {
    throw new Error('AWS KMS key must be ECC_SECG_P256K1 with SIGN_VERIFY usage');
  }

  const keyObject = createPublicKey({
    key: Buffer.from(publicKeyResponse.PublicKey),
    format: 'der',
    type: 'spki',
  });
  const jwk = keyObject.export({ format: 'jwk' });
  if (!jwk.x || !jwk.y) throw new Error('AWS KMS public key has no EC coordinates');
  const address = publicKeyToAddress(
    `0x04${base64UrlToHex(jwk.x)}${base64UrlToHex(jwk.y)}`,
  );
  if (address.toLowerCase() !== options.expectedAddress.toLowerCase()) {
    throw new Error('AWS KMS key address does not match AWS_KMS_EXPECTED_ADDRESS');
  }

  return toAccount({
    address,
    async signTransaction(transaction: any) {
      const unsigned = serializeTransaction(transaction);
      const hash = keccak256(unsigned);
      const response = await client.send(
        new SignCommand({
          KeyId: options.keyId,
          Message: Buffer.from(hash.slice(2), 'hex'),
          MessageType: 'DIGEST',
          SigningAlgorithm: 'ECDSA_SHA_256',
        }),
      );
      if (!response.Signature) throw new Error('AWS KMS returned no signature');
      const { r, s } = parseKmsDerSignature(response.Signature);
      const signatureBase = { r: bigintToHex32(r), s: bigintToHex32(s) };
      for (const yParity of [0, 1] as const) {
        const recovered = await recoverAddress({
          hash,
          signature: { ...signatureBase, yParity },
        });
        if (recovered.toLowerCase() === address.toLowerCase()) {
          return serializeTransaction(transaction, { ...signatureBase, yParity });
        }
      }
      throw new Error('AWS KMS signature does not recover to the configured address');
    },
    async signMessage() {
      throw new Error('AWS KMS deployer is restricted to transaction signing');
    },
    async signTypedData() {
      throw new Error('AWS KMS deployer is restricted to transaction signing');
    },
  });
}
