import { HttpException } from '@nestjs/common';
import { UploadController } from './upload.controller';

describe('UploadController', () => {
  const request = { wallet: '0x1111111111111111111111111111111111111111' } as any;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    reserveFixedWindowQuota: jest.Mock;
  };
  let controller: UploadController;

  beforeEach(() => {
    process.env.PINATA_JWT = 'test-jwt';
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      reserveFixedWindowQuota: jest.fn().mockResolvedValue(true),
    };
    controller = new UploadController(redis as any);
    jest.restoreAllMocks();
  });

  afterAll(() => delete process.env.PINATA_JWT);

  function file(buffer: Buffer, mimetype = 'image/png'): Express.Multer.File {
    return {
      buffer,
      mimetype,
      originalname: 'token.png',
      fieldname: 'file',
      encoding: '7bit',
      size: buffer.length,
      stream: undefined as any,
      destination: '',
      filename: '',
      path: '',
    };
  }

  it('rejects a RIFF prefix that is not a decodable WebP image', async () => {
    await expect(controller.uploadImage(file(Buffer.from('RIFFxxxxWEBP'), 'image/webp'), request))
      .rejects.toThrow(HttpException);
    expect(redis.reserveFixedWindowQuota).not.toHaveBeenCalled();
  });

  it('fails closed when the daily quota service is unavailable', async () => {
    redis.reserveFixedWindowQuota.mockResolvedValueOnce(null);
    await expect(controller.uploadImage(file(png), request))
      .rejects.toThrow('Upload quota service unavailable');
  });

  it('re-encodes valid input and pins canonical WebP after reserving quota', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ IpfsHash: 'bafy-test-cid' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await expect(controller.uploadImage(file(png), request)).resolves.toMatchObject({
      uri: 'ipfs://bafy-test-cid',
    });
    expect(redis.reserveFixedWindowQuota).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^upload:content:[0-9a-f]{64}$/),
      'bafy-test-cid',
      30 * 24 * 60 * 60,
    );
  });
});
