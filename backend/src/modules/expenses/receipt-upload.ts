import { BadRequestException, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

/**
 * A vendor's bill: either photographed at the counter or saved as a PDF from their email, so
 * both are accepted. In memory because it goes straight to S3, capped at 10 MB — the size of a
 * full-resolution phone photo.
 *
 * SVG is deliberately not allowed even though it is an image: it can carry script, and a
 * presigned URL serves the file back verbatim to whoever opens it.
 */
export const ReceiptUpload = () =>
  UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (
          !/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(
            file.mimetype,
          )
        ) {
          callback(
            new BadRequestException('Upload a JPEG, PNG, WebP, HEIC or PDF'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  );

export function requireReceipt(
  file?: Express.Multer.File,
): Express.Multer.File {
  if (!file) throw new BadRequestException('No file was uploaded');
  return file;
}
