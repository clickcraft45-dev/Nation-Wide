import { BadRequestException, Logger, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_PHOTOS_PER_UPLOAD } from '@nationwide/shared-types';

/**
 * Up to MAX_PHOTOS_PER_UPLOAD phone-camera photos taken at pickup, in the `files` field. Held in
 * memory (they go straight to S3 after compressing).
 *
 * The app shrinks a photo before sending it, so what arrives is normally a few hundred KB. The
 * 30 MB cap is for when it could not (a HEIC opened on a desktop browser, say): a modern phone's
 * full-resolution shot runs 12-25 MB, and refusing it would leave the partner at the door with
 * no way to record the parcel. The server compresses it instead (see compressPhoto).
 *
 * HEIC is allowed because that is what an iPhone produces; SVG is not, since it can carry script
 * and a presigned URL serves it back verbatim.
 */
export const MAX_PHOTO_BYTES = 30 * 1024 * 1024;

export const PhotosUpload = () =>
  UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_UPLOAD },
      fileFilter: (_req, file, callback) => {
        if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)) {
          callback(
            new BadRequestException('Upload a JPEG, PNG, WebP or HEIC photo'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  );

export function requireFiles(
  files?: Express.Multer.File[],
): Express.Multer.File[] {
  if (!files?.length) throw new BadRequestException('No photo was uploaded');
  return files;
}

const ORIGINAL_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** Long edge after compressing: an ID card's small print and a shipping label stay legible. */
const MAX_EDGE_PX = 2000;
const JPEG_QUALITY = 80;

const logger = new Logger('PhotoCompression');

export interface StoredPhoto {
  buffer: Buffer;
  mimetype: string;
  extension: string;
}

/**
 * A photo as it is stored: turned upright (phones record rotation in EXIF, which is stripped
 * here), no larger than MAX_EDGE_PX on its long side, and re-encoded as JPEG. A 12 MB camera
 * shot comes out at roughly 300-600 KB.
 *
 * Falls back to the original bytes when sharp cannot decode the image. Its prebuilt binaries
 * leave out HEIC (the codec is patent-encumbered), and a photo that cannot be shrunk is still
 * better kept than refused at the customer's door.
 */
export async function compressPhoto(
  file: Express.Multer.File,
): Promise<StoredPhoto> {
  try {
    // Lazy, as in FlagService: sharp is a native binding and stays out of the boot path.
    const sharp = (await import('sharp')).default;
    const buffer = await sharp(file.buffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAX_EDGE_PX,
        height: MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    // Already-small photos can grow when re-encoded; keep whichever is smaller.
    if (buffer.length < file.buffer.length || file.mimetype !== 'image/jpeg') {
      return { buffer, mimetype: 'image/jpeg', extension: 'jpg' };
    }
  } catch (err) {
    logger.warn(
      `Storing a ${file.mimetype} photo uncompressed: ${(err as Error).message}`,
    );
  }
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    extension: ORIGINAL_EXTENSIONS[file.mimetype] ?? 'jpg',
  };
}
