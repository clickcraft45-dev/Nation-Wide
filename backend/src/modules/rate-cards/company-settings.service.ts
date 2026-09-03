import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { CompanySettings, Prisma } from '@prisma/client';
import { REGISTERED_COMPANY } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

/// S3 key prefix for company branding. One company, but the id keeps the prefix stable if
/// that ever stops being true.
const LOGO_PREFIX = 'uploads/company-logos';

// Singleton — this app has exactly one company, so there is exactly one settings row, created
// lazily on first read/write rather than seeded, matching the getOrCreate idiom used nowhere else
// in this codebase because nothing else here is a singleton.
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(): Promise<CompanySettings> {
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) return existing;
    // Seeded from the actual GST registration rather than blank: every field below is one that
    // InvoicesService refuses to issue an invoice without, so an empty row means the first
    // invoice on a fresh deployment fails. Only ever applied at CREATE — an existing row, and
    // therefore anything an admin has since edited, is returned untouched above.
    return this.prisma.companySettings.create({
      data: { ...REGISTERED_COMPANY },
    });
  }

  /**
   * A presigned read URL for the current logo, or null when none is set. Short-lived by design:
   * the bucket is private, and this URL is the only thing that makes one object readable.
   */
  async logoUrl(settings: CompanySettings): Promise<string | null> {
    if (!settings.logoPath || !this.storage.isConfigured) return null;
    return this.storage.presignGet(settings.logoPath, 900).catch(() => null);
  }

  async update(
    dto: UpdateCompanySettingsDto,
    actorId: string,
  ): Promise<CompanySettings> {
    const existing = await this.get();
    const updated = await this.prisma.companySettings.update({
      where: { id: existing.id },
      data: { ...dto, updatedByAdminId: actorId },
    });

    await this.writeAuditLog(
      actorId,
      'COMPANY_SETTINGS_UPDATED',
      existing.id,
      this.toAuditSnapshot(existing),
      this.toAuditSnapshot(updated),
    );

    return updated;
  }

  /**
   * Uploads to S3 and records the object key. The file arrives in memory (multer's memoryStorage,
   * capped at 5 MB by the controller) rather than on disk: a container filesystem does not
   * survive a redeploy, so writing it there first would only add a step that can go stale.
   */
  async saveLogo(
    file: Express.Multer.File,
    actorId: string,
  ): Promise<CompanySettings> {
    const existing = await this.get();
    const previousLogoPath = existing.logoPath;

    // Random name, not the client-supplied one: the original filename is attacker-controlled and
    // ends up in an object key.
    const key = `${LOGO_PREFIX}/${existing.id}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.put(key, file.buffer, file.mimetype);

    const updated = await this.prisma.companySettings.update({
      where: { id: existing.id },
      data: { logoPath: key, updatedByAdminId: actorId },
    });

    if (previousLogoPath) {
      // Best-effort cleanup — an orphaned object is harmless, but a failed delete must never
      // block replacing the logo.
      await this.storage.delete(previousLogoPath);
    }

    await this.writeAuditLog(
      actorId,
      'COMPANY_LOGO_UPDATED',
      existing.id,
      { logoPath: previousLogoPath },
      { logoPath: updated.logoPath },
    );

    return updated;
  }

  private toAuditSnapshot(settings: CompanySettings) {
    return {
      companyName: settings.companyName,
      tagline: settings.tagline,
      primaryColor: settings.primaryColor,
      website: settings.website,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      address: settings.address,
      termsAndConditions: settings.termsAndConditions,
      footerNotes: settings.footerNotes,
      insuranceDisclaimer: settings.insuranceDisclaimer,
      legalDisclaimer: settings.legalDisclaimer,
      restrictedItemsNotice: settings.restrictedItemsNotice,
    };
  }

  private writeAuditLog(
    actorId: string,
    action: string,
    entityId: string,
    before: Prisma.InputJsonValue,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity: 'CompanySettings',
        entityId,
        before,
        after,
      },
    });
  }
}

export { LOGO_PREFIX };
