import { BadRequestException, ConflictException } from '@nestjs/common';
import { TipService } from '../tip.service';

describe('TipService', () => {
  const fromWallet = '0x0000000000000000000000000000000000000001';
  const recipientWallet = '0x0000000000000000000000000000000000000002';
  const txHash = `0x${'a'.repeat(64)}`;
  const agent = { id: 7, name: 'Agent', wallet: recipientWallet };

  const db = {
    queryOne: jest.fn(),
    queryRows: jest.fn(),
  };
  const deployer = {
    getAddress: jest.fn(() => recipientWallet),
    verifyUsdcTransfer: jest.fn(),
  };
  let service: TipService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TipService(db as any, deployer as any);
  });

  it('rejects a tip when its on-chain transfer cannot be verified', async () => {
    db.queryOne.mockResolvedValueOnce(agent).mockResolvedValueOnce(null);
    deployer.verifyUsdcTransfer.mockResolvedValue(false);

    await expect(
      service.tipAgent('agent-1', fromWallet, 1_000_000n, txHash),
    ).rejects.toThrow(BadRequestException);

    expect(deployer.verifyUsdcTransfer).toHaveBeenCalledWith(
      txHash,
      fromWallet,
      recipientWallet,
      1_000_000n,
    );
    expect(db.queryOne).toHaveBeenCalledTimes(2);
  });

  it('rejects replay of a transaction hash before verification', async () => {
    db.queryOne.mockResolvedValueOnce(agent).mockResolvedValueOnce({ id: 99 });

    await expect(
      service.tipAgent('agent-1', fromWallet, 1_000_000n, txHash),
    ).rejects.toThrow(ConflictException);

    expect(deployer.verifyUsdcTransfer).not.toHaveBeenCalled();
  });

  it('stores only a successfully verified tip', async () => {
    const inserted = { id: 10, verified: true, tx_hash: txHash };
    db.queryOne
      .mockResolvedValueOnce(agent)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(inserted);
    deployer.verifyUsdcTransfer.mockResolvedValue(true);

    await expect(
      service.tipAgent('agent-1', fromWallet, 1_000_000n, txHash, 'thanks'),
    ).resolves.toEqual(inserted);

    const insertCall = db.queryOne.mock.calls[2];
    expect(insertCall[0]).toContain('verified)');
    expect(insertCall[0]).toContain('true)');
  });
});
