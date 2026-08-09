import { createPublicKey } from 'crypto';
import { sign, privateKeyToAccount } from 'viem/accounts';
import { bytesToHex, recoverTransactionAddress } from 'viem';
import { createAwsKmsAccount, parseKmsDerSignature } from './aws-kms-account';

const PRIVATE_KEY = `0x${'1'.padStart(64, '0')}` as const;
const localAccount = privateKeyToAccount(PRIVATE_KEY);

function derInteger(hex: string): Buffer {
  let value = Buffer.from(hex.slice(2).padStart(64, '0'), 'hex');
  while (value.length > 1 && value[0] === 0) value = value.subarray(1);
  if ((value[0] & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
  return Buffer.concat([Buffer.from([0x02, value.length]), value]);
}

function derSignature(r: string, s: string): Uint8Array {
  const body = Buffer.concat([derInteger(r), derInteger(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function spkiPublicKey(): Buffer {
  const publicKey = localAccount.publicKey.slice(4);
  const x = Buffer.from(publicKey.slice(0, 64), 'hex').toString('base64url');
  const y = Buffer.from(publicKey.slice(64), 'hex').toString('base64url');
  return createPublicKey({
    key: { kty: 'EC', crv: 'secp256k1', x, y },
    format: 'jwk',
  }).export({ format: 'der', type: 'spki' });
}

describe('AWS KMS deployer account', () => {
  it('signs the exact transaction digest and recovers the configured address', async () => {
    const client = {
      send: jest.fn(async (command: any) => {
        if (command.constructor.name === 'GetPublicKeyCommand') {
          return {
            PublicKey: spkiPublicKey(),
            KeySpec: 'ECC_SECG_P256K1',
            KeyUsage: 'SIGN_VERIFY',
            SigningAlgorithms: ['ECDSA_SHA_256'],
          };
        }
        expect(command.input.MessageType).toBe('DIGEST');
        expect(command.input.SigningAlgorithm).toBe('ECDSA_SHA_256');
        const signature = await sign({
          hash: bytesToHex(command.input.Message),
          privateKey: PRIVATE_KEY,
        });
        return { Signature: derSignature(signature.r, signature.s) };
      }),
    };
    const account = await createAwsKmsAccount({
      keyId: 'alias/orba-agent-signer',
      expectedAddress: localAccount.address,
      client: client as any,
    });
    const serialized = await account.signTransaction({
      chainId: 5_042_002,
      nonce: 1,
      gas: 21_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      to: '0x0000000000000000000000000000000000000001',
      value: 1n,
      type: 'eip1559',
    });

    await expect(
      recoverTransactionAddress({ serializedTransaction: serialized as any }),
    ).resolves.toBe(localAccount.address);
  });

  it('rejects a KMS key whose derived address is not explicitly approved', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({
        PublicKey: spkiPublicKey(),
        KeySpec: 'ECC_SECG_P256K1',
        KeyUsage: 'SIGN_VERIFY',
        SigningAlgorithms: ['ECDSA_SHA_256'],
      }),
    };
    await expect(
      createAwsKmsAccount({
        keyId: 'alias/wrong-key',
        expectedAddress: '0x0000000000000000000000000000000000000001',
        client: client as any,
      }),
    ).rejects.toThrow('does not match AWS_KMS_EXPECTED_ADDRESS');
  });

  it('rejects malformed DER signatures', () => {
    expect(() => parseKmsDerSignature(Uint8Array.from([0x30, 0x01, 0x00]))).toThrow();
  });
});
