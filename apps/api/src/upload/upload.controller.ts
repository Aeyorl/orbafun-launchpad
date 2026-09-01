import {
  Controller,
  Post,
  UploadedFile,
  HttpException,
  HttpStatus,
  Logger,
  Get,
  UseInterceptors,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AuthGuard } from '../auth/auth.guard';
import { RedisService } from '../redis/redis.service';

/**
 * UploadController — handles token image uploads to Pinata IPFS.
 *
 * Flow:
 *   1. Frontend POSTs a multipart/form-data with the image file
 *   2. This controller validates the file (type, size)
 *   3. Forwards it to Pinata's pinFileToIPFS endpoint
 *   4. Returns the IPFS URI (ipfs://<cid>) to the frontend
 *   5. Frontend passes that URI into the createToken() contract call
 *
 * Why server-side and not directly from the browser:
 *   - Keeps the Pinata JWT secret (never exposed to the client)
 *   - Lets us validate file type/size before pinning
 *   - Centralizes IPFS gateway config
 *
 * Env:
 *   PINATA_JWT       — Pinata API JWT (required for uploads)
 *   PINATA_GATEWAY   — Gateway base URL for serving IPFS content
 *                      (default: https://gateway.pinata.cloud)
 *
 * If PINATA_JWT is not set, the endpoint returns 503 Service Unavailable
 * and the frontend falls back to the URL input field.
 */
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const PINATA_API = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_IMAGE_DIMENSION = 4_096;
const UPLOAD_WALLET_DAILY_FILES = positiveIntEnv('UPLOAD_WALLET_DAILY_FILES', 12);
const UPLOAD_WALLET_DAILY_BYTES = positiveIntEnv(
  'UPLOAD_WALLET_DAILY_BYTES',
  30 * 1024 * 1024,
);
const UPLOAD_GLOBAL_DAILY_FILES = positiveIntEnv('UPLOAD_GLOBAL_DAILY_FILES', 2_000);
const UPLOAD_GLOBAL_DAILY_BYTES = positiveIntEnv(
  'UPLOAD_GLOBAL_DAILY_BYTES',
  2 * 1024 * 1024 * 1024,
);
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

/**
 * Sanitize a filename to be safe for IPFS pinning.
 * Strips path separators, null bytes, and non-alphanumeric chars (except .-_).
 */
function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '').replace(/\0/g, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Ensure it has a valid extension, fallback to .bin
  if (!/\.[a-zA-Z0-9]{1,5}$/.test(cleaned)) {
    return cleaned + '.bin';
  }
  return cleaned.slice(0, 128); // cap length
}

@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly redis: RedisService) {}

  /** Health check — lets the frontend know if uploads are available. */
  @Get('status')
  @SkipThrottle()
  status() {
    return { enabled: !!process.env.PINATA_JWT, gateway: PINATA_GATEWAY };
  }

  /**
   * POST /upload/image
   * Multipart form-data with field name "file".
   * Returns: { uri: 'ipfs://<cid>', gateway: 'https://...' }
   */
  @Post('image')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 uploads/min per IP
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_TYPES.has(file.mimetype)) {
          return cb(
            new HttpException(
              `File type not allowed: ${file.mimetype}. Allowed: PNG, JPEG, GIF, WebP.`,
              HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { wallet?: string },
  ) {
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
      throw new HttpException(
        'Image upload is not configured (PINATA_JWT missing). Use a URL instead.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Decode and re-encode instead of trusting short magic-byte prefixes. This
    // rejects malformed/polyglot RIFF inputs, strips metadata, and bounds image
    // decompression before any content is persisted by the platform.
    let canonicalImage: Buffer;
    try {
      const result = await sharp(file.buffer, {
        animated: false,
        failOn: 'warning',
        limitInputPixels: MAX_IMAGE_PIXELS,
      })
        .rotate()
        .resize({
          width: MAX_IMAGE_DIMENSION,
          height: MAX_IMAGE_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 88, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (!result.info.width || !result.info.height || result.data.length > MAX_FILE_SIZE) {
        throw new Error('Canonical image exceeds upload limits');
      }
      canonicalImage = result.data;
    } catch {
      throw new HttpException(
        'Image could not be safely decoded or exceeds pixel/dimension limits',
        HttpStatus.BAD_REQUEST,
      );
    }

    const wallet = req.wallet?.toLowerCase();
    if (!wallet) {
      throw new HttpException('Authenticated wallet missing', HttpStatus.UNAUTHORIZED);
    }
    const contentHash = createHash('sha256').update(canonicalImage).digest('hex');
    const cachedCid = await this.redis.get(`upload:content:${contentHash}`);
    if (cachedCid) {
      return {
        uri: `ipfs://${cachedCid}`,
        gateway: `${PINATA_GATEWAY}/ipfs/${cachedCid}`,
        deduplicated: true,
      };
    }

    const day = new Date().toISOString().slice(0, 10);
    const quotaReserved = await this.redis.reserveFixedWindowQuota(
      [
        `upload:quota:${day}:wallet:${wallet}:files`,
        `upload:quota:${day}:wallet:${wallet}:bytes`,
        `upload:quota:${day}:global:files`,
        `upload:quota:${day}:global:bytes`,
      ],
      [1, canonicalImage.length, 1, canonicalImage.length],
      [
        UPLOAD_WALLET_DAILY_FILES,
        UPLOAD_WALLET_DAILY_BYTES,
        UPLOAD_GLOBAL_DAILY_FILES,
        UPLOAD_GLOBAL_DAILY_BYTES,
      ],
      48 * 60 * 60,
    );
    if (quotaReserved === null) {
      throw new HttpException(
        'Upload quota service unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!quotaReserved) {
      throw new HttpException('Daily upload quota exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const safeName = sanitizeFilename(file.originalname).replace(/\.[^.]+$/, '') + '.webp';

    // Forward to Pinata as multipart/form-data.
    const form = new FormData();
    const uploadBytes = Uint8Array.from(canonicalImage);
    form.append('file', new Blob([uploadBytes], { type: 'image/webp' }), safeName);

    try {
      const res = await fetch(PINATA_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pinataJwt}`,
        },
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Pinata upload failed: ${res.status} ${text}`);
        throw new HttpException(
          `IPFS upload failed (${res.status})`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const json: any = await res.json();
      const cid = json.IpfsHash;
      if (!cid) {
        throw new HttpException(
          'Pinata response missing IpfsHash',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      await this.redis.set(`upload:content:${contentHash}`, cid, 30 * 24 * 60 * 60);

      this.logger.log(`Uploaded image to IPFS: ${cid} (${safeName})`);
      return {
        uri: `ipfs://${cid}`,
        gateway: `${PINATA_GATEWAY}/ipfs/${cid}`,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Upload error: ${err.message}`);
      throw new HttpException(
        'Upload failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
