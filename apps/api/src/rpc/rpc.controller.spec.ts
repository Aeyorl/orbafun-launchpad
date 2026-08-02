import { HttpException } from '@nestjs/common';
import { RpcController } from './rpc.controller';

describe('RpcController', () => {
  let controller: RpcController;

  beforeEach(() => {
    controller = new RpcController();
    jest.restoreAllMocks();
  });

  it('rejects oversized batches and non-whitelisted methods', async () => {
    const batch = Array.from({ length: 21 }, (_, id) => ({
      jsonrpc: '2.0', id, method: 'eth_chainId', params: [],
    }));
    await expect(controller.proxy(batch)).rejects.toThrow(HttpException);
    await expect(controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [],
    })).rejects.toThrow(HttpException);
  });

  it('requires explicit bounded log ranges and valid emitter addresses', async () => {
    const request = (filter: any) => controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [filter],
    });
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
    })).resolves.toMatchObject({ result: '0x4cef72' });
  });

  it('rejects a response whose declared size exceeds the cap', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    }));

    await expect(controller.proxy({
      jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [],
    })).rejects.toThrow('RPC response exceeded');
  });
});
