import { CandlesService } from '../candles.service';

describe('CandlesService', () => {
  it('qualifies the initial price column against joined token rows', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ count: '0', min_ts: null, first_val: null }],
      }),
    };
    const redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CandlesService(db as any, redis as any);

    await service.getCandles(
      '0x1000000000000000000000000000000000000001',
      '10s',
      'price',
      100,
    );

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('array_agg(activity.price::numeric'),
      expect.any(Array),
    );
  });
});
