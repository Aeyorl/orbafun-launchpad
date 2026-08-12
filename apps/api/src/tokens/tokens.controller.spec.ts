import { NotFoundException } from '@nestjs/common';
import { TokensController } from './tokens.controller';

describe('TokensController public factory isolation', () => {
  const legacyToken = '0x0000000000000000000000000000000000000001';

  it('returns 404 for a token outside the public factory scope', async () => {
    const tokens = {
      getTokenByAddress: jest.fn(async () => null),
    };
    const controller = new TokensController(tokens as any, {} as any);

    await expect(controller.getToken(legacyToken)).rejects.toBeInstanceOf(NotFoundException);
    expect(tokens.getTokenByAddress).toHaveBeenCalledWith(legacyToken);
  });

  it('blocks derived endpoints before querying legacy-token data', async () => {
    const tokens = {
      getTokenByAddress: jest.fn(async () => null),
      getTokenTrades: jest.fn(),
      getTokenHolders: jest.fn(),
    };
    const candles = { getCandles: jest.fn() };
    const controller = new TokensController(tokens as any, candles as any);

    await expect(controller.getTokenTrades(legacyToken)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.getTokenHolders(legacyToken)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.getCandles(legacyToken)).rejects.toBeInstanceOf(NotFoundException);
    expect(tokens.getTokenTrades).not.toHaveBeenCalled();
    expect(tokens.getTokenHolders).not.toHaveBeenCalled();
    expect(candles.getCandles).not.toHaveBeenCalled();
  });
});
