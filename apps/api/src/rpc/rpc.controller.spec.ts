import { HttpException } from '@nestjs/common';
import { RpcController } from './rpc.controller';

describe('RpcController', () => {
  let controller: RpcController;
  let redis: { reserveFixedWindowQuota: jest.Mock };
  const httpRequest = { ip: '203.0.113.1', socket: {} } as any;

  beforeEach(() => {
    redis = { reserveFixedWindowQuota: jest.fn().mockResolvedValue(true) };
    controller = new RpcController(redis as any);
    jest.restoreAllMocks();
  });

  it('rejects oversized batches and non-whitelisted methods', async () => {
    const batch = Array.from({ length: 11 }, (_, id) => ({
      jsonrpc: '2.0', id, method: 'eth_chainId', params: [],
    }));
    await expect(controller.proxy(batch, httpRequest)).rejects.toThrow(HttpException);
    await expect(controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [],
    }, httpRequest)).rejects.toThrow(HttpException);
  });

  it('requires explicit bounded log ranges and valid emitter addresses', async () => {
    const request = (filter: any) => controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [filter],
    }, httpRequest);
    await expect(request({
      address: '0x1234', fromBlock: '0x1', toBlock: '0x2',
    })).rejects.toThrow('invalid address');
    await expect(request({
      address: `0x${'1'.repeat(40)}`, fromBlock: '0x1', toBlock: '0x10000',
    })).rejects.toThrow('block range');
    await expect(request({
      address: `0x${'1'.repeat(40)}`,
      blockHash: `0x${'2'.repeat(64)}`,
      fromBlock: '0x1',
    })).rejects.toThrow('cannot be combined');
  });

  it('forwards a valid request and parses its bounded response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x4cef72' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await expect(controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [],
    }, httpRequest)).resolves.toMatchObject({ result: '0x4cef72' });
    expect(redis.reserveFixedWindowQuota).toHaveBeenCalledWith(
      ['rpc:budget:203.0.113.1'], [1], [300], 60,
    );
  });

  it('rejects a response whose declared size exceeds the cap', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    }));

    await expect(controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [],
    }, httpRequest)).rejects.toThrow('RPC response exceeded');
  });

  it('caps execution-call count, calldata, and declared gas', async () => {
    const call = (overrides: Record<string, unknown> = {}) => ({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: `0x${'1'.repeat(40)}`, data: '0x', ...overrides }],
    });
    await expect(controller.proxy(Array.from({ length: 5 }, () => call()), httpRequest))
      .rejects.toThrow('at most 4 execution calls');
    await expect(controller.proxy(call({ data: `0x${'00'.repeat(16 * 1024 + 1)}` }), httpRequest))
      .rejects.toThrow('calldata');
    await expect(controller.proxy(call({ gas: '0x4c4b41' }), httpRequest))
      .rejects.toThrow('gas exceeds');
  });

  it('fails closed when weighted quota is rejected or unavailable', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] };
    redis.reserveFixedWindowQuota.mockResolvedValueOnce(false);
    await expect(controller.proxy(body, httpRequest)).rejects.toThrow('weighted rate limit');
    redis.reserveFixedWindowQuota.mockResolvedValueOnce(null);
    await expect(controller.proxy(body, httpRequest)).rejects.toThrow('quota service unavailable');
  });
});
