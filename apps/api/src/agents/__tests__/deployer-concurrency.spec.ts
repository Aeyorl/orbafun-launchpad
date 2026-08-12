import { DeployerService } from '../deployer.service';

describe('DeployerService shared signer serialization', () => {
  it.each([
    ['launchToken', ['Name', 'SYM', 'image', 'description']],
    ['buyTokens', ['0x0000000000000000000000000000000000000001', 1n, 1n]],
    ['sellTokens', [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      1n,
      1n,
    ]],
    ['approveTokenFactory', []],
  ])('holds a PostgreSQL advisory transaction lock around %s', async (method, args) => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const db = {
      transaction: jest.fn(async (callback: (c: typeof client) => Promise<unknown>) => callback(client)),
    };
    const service = new (DeployerService as any)(db);
    const unlocked = `${method}Unlocked`;
    service[unlocked] = jest.fn().mockResolvedValue({ ok: true });

    await service[method](...args);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [expect.any(Number)],
    );
    expect(service[unlocked]).toHaveBeenCalledWith(
      ...args,
      ...(method === 'approveTokenFactory' ? [] : [undefined]),
    );
  });
});
