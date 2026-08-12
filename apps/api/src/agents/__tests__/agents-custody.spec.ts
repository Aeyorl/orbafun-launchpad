import { BadRequestException } from '@nestjs/common';
import { AgentsService } from '../agents.service';

describe('AgentsService custody isolation', () => {
  const tokenAddress = '0x0000000000000000000000000000000000000011';
  const curveAddress = '0x0000000000000000000000000000000000000022';
  const agent = { id: 7, agentId: 'agent-7', name: 'Agent Seven' };

  it('rejects a sell when only another agent owns the shared-wallet inventory', async () => {
    const client = {
      query: jest.fn(async (text: string) => {
        if (text.includes('FROM agents') && text.includes('FOR UPDATE')) {
          return { rows: [{ id: agent.id, active: true }], rowCount: 1 };
        }
        if (text.includes('AS available_amount')) {
          // The deployer wallet may hold this token, but this agent bought none.
          return { rows: [{ available_amount: '0' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const db = {
      queryOne: jest.fn(async () => ({ curve_address: curveAddress })),
      connect: jest.fn(async () => client),
    };
    const deployer = {
      isConfigured: jest.fn(() => true),
      getTokenBalance: jest.fn(async () => 1000n),
      sellTokens: jest.fn(),
    };
    const service = new AgentsService(
      db as any,
      deployer as any,
      {} as any,
      {} as any,
      { finalizeSuccess: jest.fn() } as any,
    );

    await expect(service.sellTokens(agent, tokenAddress, 100n)).rejects.toThrow(
      BadRequestException,
    );

    expect(deployer.getTokenBalance).not.toHaveBeenCalled();
    expect(deployer.sellTokens).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
