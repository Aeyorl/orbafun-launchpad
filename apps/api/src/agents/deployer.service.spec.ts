import { extractBuyTokensOut } from './deployer.service';

describe('extractBuyTokensOut', () => {
  const curve = '0x1111111111111111111111111111111111111111';
  const buyer = '0x2222222222222222222222222222222222222222';
  const topic =
    '0x' + buyer.slice(2).padStart(64, '0');

  function word(value: bigint) {
    return value.toString(16).padStart(64, '0');
  }

  it('returns receipt-authoritative BuyV2 tokensOut instead of a quote', () => {
    const tokensOut = 123_456_789n;
    const eventTopic = require('viem').keccak256(
      require('viem').toHex('BuyV2(address,uint256,uint256,uint256,uint256,uint256)'),
    );
    const logs = [{
      address: curve,
      topics: [eventTopic, topic],
      data: `0x${word(100n)}${word(1n)}${word(99n)}${word(tokensOut)}${word(5n)}`,
    }];

    expect(extractBuyTokensOut(logs, curve, buyer)).toBe(tokensOut);
  });

  it('fails closed when the expected BuyV2 event is absent', () => {
    expect(() => extractBuyTokensOut([], curve, buyer)).toThrow(
      'Authoritative BuyV2 event not found',
    );
  });
});
