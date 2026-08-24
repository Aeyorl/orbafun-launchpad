import { describe, expect, it } from 'vitest';
import {
  PUBLIC_PROTOCOL_FACTS,
  formatBps,
  shareOfTradePercent,
} from '../public-protocol-facts';

describe('public protocol facts', () => {
  it('keeps preview content explicitly in draft status', () => {
    expect(PUBLIC_PROTOCOL_FACTS.publicationStatus).toBe('draft');
    expect(PUBLIC_PROTOCOL_FACTS.publicationLabel).toContain('not yet effective');
  });

  it('formats target fee rates from basis points', () => {
    expect(formatBps(PUBLIC_PROTOCOL_FACTS.bondingCurveTradeFeeBps)).toBe('1%');
    expect(formatBps(PUBLIC_PROTOCOL_FACTS.referralAccrualBps)).toBe('0.1%');
  });

  it('derives creator and protocol shares from the total trade fee', () => {
    expect(
      shareOfTradePercent(
        PUBLIC_PROTOCOL_FACTS.bondingCurveTradeFeeBps,
        PUBLIC_PROTOCOL_FACTS.creatorShareOfTradeFeeBps,
      ),
    ).toBe('0.5%');
    expect(
      shareOfTradePercent(
        PUBLIC_PROTOCOL_FACTS.bondingCurveTradeFeeBps,
        PUBLIC_PROTOCOL_FACTS.protocolShareOfTradeFeeBps,
      ),
    ).toBe('0.5%');
  });
});
