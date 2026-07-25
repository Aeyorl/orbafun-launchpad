import {
  Controller,
  Post,
  UploadedFile,
  HttpException,
  HttpStatus,
  Logger,
  Get,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

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
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';
const PINATA_API = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

// Magic byte signatures for image format validation (prevents MIME spoofing).
const MAGIC_BYTES: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/jpg': [0xff, 0xd8, 0xff],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // "RIFF" — WebP container
};

/**
 * Verify file magic bytes match the declared MIME type.
 * Prevents uploading malicious files with a spoofed Content-Type.
 */
function verifyMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const expected = MAGIC_BYTES[mimetype];
  if (!expected) return false;
  if (buffer.length < expected.length) return false;
  return expected.every((byte, i) => buffer[i] === byte);
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

  /** Health check — lets the frontend know if uploads are available. */
  @Get('status')
  @SkipThrottle()
  status() {
    return { enabled: !!PINATA_JWT, gateway: PINATA_GATEWAY };
  }

  /**
   * POST /upload/image
   * Multipart form-data with field name "file".
   * Returns: { uri: 'ipfs://<cid>', gateway: 'https://...' }
   */
  @Post('image')
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
  async uploadImage(@UploadedFile() file: any) {
    if (!PINATA_JWT) {
      throw new HttpException(
        'Image upload is not configured (PINATA_JWT missing). Use a URL instead.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Verify magic bytes match the declared MIME type (prevents MIME spoofing).
    if (!verifyMagicBytes(file.buffer, file.mimetype)) {
      throw new HttpException(
        `File content does not match declared type (${file.mimetype}). Possible spoofing attempt.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const safeName = sanitizeFilename(file.originalname);

    // Forward to Pinata as multipart/form-data.
    const form = new FormData();
    form.append('file', new Blob([file.buffer], { type: file.mimetype }), safeName);

    try {
      const res = await fetch(PINATA_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
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
