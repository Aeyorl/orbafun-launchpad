/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveMovementEvidence } from '../trading/LiveMovementEvidence';

describe('LiveMovementEvidence', () => {
  it('describes a buy as visible market movement without relying on color', () => {
    render(
      <LiveMovementEvidence
        metricMode="mcap"
        move={{
          id: '0xtx',
          side: 'buy',
          price: 0.0000066,
          marketCap: 6608.44,
          value: 6608.44,
          volume: 100,
          timestamp: Date.now(),
        }}
      />,
    );

    expect(screen.getByText('Buy moved chart')).toBeInTheDocument();
    expect(screen.getByLabelText(/Buy moved the chart/)).toHaveAttribute('aria-live', 'polite');
  });

  it('shows an honest waiting state before the first live event', () => {
    render(<LiveMovementEvidence metricMode="price" move={null} />);
    expect(screen.getByText('Awaiting market move')).toBeInTheDocument();
  });
});
