import { WebsocketGateway } from './websocket.gateway';

describe('WebsocketGateway public factory isolation', () => {
  const token = '0x0000000000000000000000000000000000000001';

  function harness(visible: boolean) {
    const redis = { subscribe: jest.fn() };
    const db = { queryOne: jest.fn(async () => ({ visible })) };
    const gateway = new WebsocketGateway(redis as any, db as any);
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as any;
    return { gateway, db, to, emit };
  }

  it('rejects legacy token room subscriptions', async () => {
    const { gateway, db } = harness(false);
    const client = { join: jest.fn() };

    await gateway.handleJoin(client as any, `token:${token}`);

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('factory_address'),
      expect.arrayContaining([token]),
    );
    expect(client.join).not.toHaveBeenCalled();
  });

  it('does not relay legacy token events to global or token rooms', async () => {
    const { gateway, to, emit } = harness(false);

    await (gateway as any).relayVisibleEvent(JSON.stringify({
      type: 'NEW_BUY',
      tokenAddress: token,
    }));

    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('allows hardened-scope token rooms', async () => {
    const { gateway } = harness(true);
    const client = { join: jest.fn(async () => undefined) };

    await gateway.handleJoin(client as any, `token:${token.toUpperCase()}`);

    expect(client.join).toHaveBeenCalledWith(`token:${token}`);
  });
});
