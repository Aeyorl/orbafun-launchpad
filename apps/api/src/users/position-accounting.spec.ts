import {
  calculatePositionUpdate,
  PositionState,
} from './position-accounting';

const zeroState = (): PositionState => ({
  quantityBaseUnits: 0n,
  remainingCostMicroUsdc: 0n,
  costOfTokensSoldMicroUsdc: 0n,
  netSaleProceedsMicroUsdc: 0n,
  realizedPnlMicroUsdc: 0n,
  totalBoughtMicroUsdc: 0n,
  totalSoldMicroUsdc: 0n,
  buyCount: 0,
  sellCount: 0,
  basisStatus: 'complete',
});

describe('weighted-average position accounting', () => {
  it('records a buy as quantity and fee-inclusive acquisition cost', () => {
    const result = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 10n, grossMicroUsdc: 1_000_000n, netMicroUsdc: 990_000n,
    });
    expect(result.quantityBaseUnits).toBe(10n);
    expect(result.remainingCostMicroUsdc).toBe(1_000_000n);
    expect(result.realizedPnlMicroUsdc).toBe(0n);
  });

  it('allocates average cost on a partial sale at a profit', () => {
    const bought = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 100n, grossMicroUsdc: 1_000n, netMicroUsdc: 990n,
    });
    const sold = calculatePositionUpdate(bought, {
      type: 'sell', tokenAmountBaseUnits: 40n, grossMicroUsdc: 800n, netMicroUsdc: 792n,
    });
    expect(sold.allocatedCostMicroUsdc).toBe(400n);
    expect(sold.realizedPnlIncrementMicroUsdc).toBe(392n);
    expect(sold.remainingCostMicroUsdc).toBe(600n);
  });

  it('records a partial sale at a loss', () => {
    const bought = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 100n, grossMicroUsdc: 1_000n, netMicroUsdc: 990n,
    });
    const sold = calculatePositionUpdate(bought, {
      type: 'sell', tokenAmountBaseUnits: 25n, grossMicroUsdc: 100n, netMicroUsdc: 99n,
    });
    expect(sold.realizedPnlIncrementMicroUsdc).toBe(-151n);
  });

  it('uses weighted average after buys at different prices', () => {
    const first = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 100n, grossMicroUsdc: 1_000n, netMicroUsdc: 990n,
    });
    const second = calculatePositionUpdate(first, {
      type: 'buy', tokenAmountBaseUnits: 50n, grossMicroUsdc: 1_000n, netMicroUsdc: 990n,
    });
    const sold = calculatePositionUpdate(second, {
      type: 'sell', tokenAmountBaseUnits: 75n, grossMicroUsdc: 1_500n, netMicroUsdc: 1_485n,
    });
    expect(sold.allocatedCostMicroUsdc).toBe(1_000n);
    expect(sold.remainingCostMicroUsdc).toBe(1_000n);
  });

  it('normalizes all remaining cost on a full close', () => {
    const bought = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 3n, grossMicroUsdc: 10n, netMicroUsdc: 9n,
    });
    const sold = calculatePositionUpdate(bought, {
      type: 'sell', tokenAmountBaseUnits: 3n, grossMicroUsdc: 12n, netMicroUsdc: 11n,
    });
    expect(sold.quantityBaseUnits).toBe(0n);
    expect(sold.remainingCostMicroUsdc).toBe(0n);
    expect(sold.allocatedCostMicroUsdc).toBe(10n);
  });

  it('supports reopening after a full close without losing realized history', () => {
    const first = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 10n, grossMicroUsdc: 100n, netMicroUsdc: 99n,
    });
    const closed = calculatePositionUpdate(first, {
      type: 'sell', tokenAmountBaseUnits: 10n, grossMicroUsdc: 200n, netMicroUsdc: 198n,
    });
    const reopened = calculatePositionUpdate(closed, {
      type: 'buy', tokenAmountBaseUnits: 5n, grossMicroUsdc: 75n, netMicroUsdc: 74n,
    });
    expect(reopened.quantityBaseUnits).toBe(5n);
    expect(reopened.remainingCostMicroUsdc).toBe(75n);
    expect(reopened.realizedPnlMicroUsdc).toBe(98n);
  });

  it('accumulates multiple partial sells', () => {
    const bought = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 100n, grossMicroUsdc: 1_000n, netMicroUsdc: 990n,
    });
    const first = calculatePositionUpdate(bought, {
      type: 'sell', tokenAmountBaseUnits: 20n, grossMicroUsdc: 300n, netMicroUsdc: 297n,
    });
    const second = calculatePositionUpdate(first, {
      type: 'sell', tokenAmountBaseUnits: 30n, grossMicroUsdc: 450n, netMicroUsdc: 445n,
    });
    expect(second.costOfTokensSoldMicroUsdc).toBe(500n);
    expect(second.netSaleProceedsMicroUsdc).toBe(742n);
    expect(second.realizedPnlMicroUsdc).toBe(242n);
  });

  it('marks a transferred-in or otherwise untracked sale as incomplete', () => {
    const sold = calculatePositionUpdate(zeroState(), {
      type: 'sell', tokenAmountBaseUnits: 10n, grossMicroUsdc: 100n, netMicroUsdc: 99n,
    });
    expect(sold.basisStatus).toBe('incomplete');
    expect(sold.allocatedCostMicroUsdc).toBe(0n);
  });

  it('handles very large 18-decimal quantities with integer precision', () => {
    const quantity = 880_000_000n * 10n ** 18n;
    const result = calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: quantity, grossMicroUsdc: 25_000_000_000n, netMicroUsdc: 24_750_000_000n,
    });
    expect(result.quantityBaseUnits).toBe(quantity);
  });

  it('rejects zero token quantities', () => {
    expect(() => calculatePositionUpdate(zeroState(), {
      type: 'buy', tokenAmountBaseUnits: 0n, grossMicroUsdc: 1n, netMicroUsdc: 1n,
    })).toThrow('token amount must be positive');
  });
});
