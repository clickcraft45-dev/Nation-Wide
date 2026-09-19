import { BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

/**
 * A phone-camera photo taken at pickup. In memory (it goes straight to S3), capped at 10 MB — a
 * full-resolution phone shot is 3-8 MB. HEIC is allowed because that is what an iPhone produces;
 * SVG is not, since it can carry script and a presigned URL serves it back verbatim.
 */
export const PhotoUpload = () =>
  UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
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

export function requireFile(file?: Express.Multer.File): Express.Multer.File {
  if (!file) throw new BadRequestException('No photo was uploaded');
  return file;
}
