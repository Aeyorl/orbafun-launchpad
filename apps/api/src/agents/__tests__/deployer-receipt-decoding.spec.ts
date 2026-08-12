import { DeployerService } from '../deployer.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encodeAbiParameters, keccak256, toBytes } = require('viem');

const TX_HASH = `0x${'ab'.repeat(32)}`;
const FACTORY = '0xf09fc443d4f0f217f1b65d112b5fb8928a4ff09e';
const TOKEN = '0x1111111111111111111111111111111111111111';
const CURVE = '0x2222222222222222222222222222222222222222';
const CREATOR = '0x3333333333333333333333333333333333333333';

function topic(signature: string): string {
  return keccak256(toBytes(signature));
}

function addressTopic(address: string): string {
  return `0x${address.slice(2).padStart(64, '0')}`;
}

function build(receipt: any) {
  const service = new (DeployerService as any)({});
  service.publicClient = {
    getTransactionReceipt: jest.fn().mockResolvedValue(receipt),
  };
  return service as DeployerService;
}

describe('DeployerService receipt event decoding', () => {
  it('recovers launch token and curve addresses from the real TokenCreated event', async () => {
    const service = build({
      status: 'success',
      gasUsed: 91n,
      logs: [{
        address: FACTORY,
        topics: [
          topic('TokenCreated(address,address,address,string,string,string,uint256)'),
          addressTopic(TOKEN),
          addressTopic(CURVE),
          addressTopic(CREATOR),
        ],
        data: encodeAbiParameters(
          [
            { type: 'string' },
            { type: 'string' },
            { type: 'string' },
            { type: 'uint256' },
          ],
          ['Orb', 'ORB', 'ipfs://orb', 123n],
        ),
      }],
    });

    await expect((service as any).inspectTransaction(TX_HASH, {
      operation: 'launch',
      payload: {},
    })).resolves.toEqual({
      status: 'success',
      txHash: TX_HASH,
      gasUsed: 91n,
      tokenAddress: TOKEN,
      curveAddress: CURVE,
    });
  });

  it('recovers the actual buy token output from the curve BuyV2 event', async () => {
    const actualTokensOut = 4_200_000_000_000_000_000n;
    const service = build({
      status: 'success',
      gasUsed: 101n,
      logs: [{
        address: CURVE,
        topics: [
          topic('BuyV2(address,uint256,uint256,uint256,uint256,uint256)'),
          addressTopic(CREATOR),
        ],
        data: encodeAbiParameters(
          Array.from({ length: 5 }, () => ({ type: 'uint256' })),
          [1_000_000n, 10_000n, 990_000n, actualTokensOut, 235n],
        ),
      }],
    });

    await expect((service as any).inspectTransaction(TX_HASH, {
      operation: 'buy',
      payload: { curveAddress: CURVE, usdcAmount: '1000000' },
    })).resolves.toEqual({
      status: 'success',
      txHash: TX_HASH,
      gasUsed: 101n,
      tokenAmount: actualTokensOut,
    });
  });

  it('recovers the actual sell USDC output from the curve SellV2 event', async () => {
    const actualUsdcOut = 765_432n;
    const service = build({
      status: 'success',
      gasUsed: 111n,
      logs: [{
        address: CURVE,
        topics: [
          topic('SellV2(address,uint256,uint256,uint256,uint256,uint256)'),
          addressTopic(CREATOR),
        ],
        data: encodeAbiParameters(
          Array.from({ length: 5 }, () => ({ type: 'uint256' })),
          [4_200_000_000_000_000_000n, 773_163n, 7_731n, actualUsdcOut, 230n],
        ),
      }],
    });

    await expect((service as any).inspectTransaction(TX_HASH, {
      operation: 'sell',
      payload: { curveAddress: CURVE, tokenAmount: '4200000000000000000' },
    })).resolves.toEqual({
      status: 'success',
      txHash: TX_HASH,
      gasUsed: 111n,
      usdcAmount: actualUsdcOut,
    });
  });
});
