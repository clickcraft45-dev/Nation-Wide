import { Injectable } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CompanySettings, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

const LOGOS_DIR = join(process.cwd(), 'storage', 'logos');

// Singleton — this app has exactly one company, so there is exactly one settings row, created
// lazily on first read/write rather than seeded, matching the getOrCreate idiom used nowhere else
// in this codebase because nothing else here is a singleton.
@Injectable()
export class CompanySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<CompanySettings> {
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) return existing;
    return this.prisma.companySettings.create({ data: {} });
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

  async saveLogo(
    file: Express.Multer.File,
    actorId: string,
  ): Promise<CompanySettings> {
    const existing = await this.get();
    const previousLogoPath = existing.logoPath;

    const updated = await this.prisma.companySettings.update({
      where: { id: existing.id },
      data: { logoPath: `logos/${file.filename}`, updatedByAdminId: actorId },
    });

    if (previousLogoPath) {
      // Best-effort cleanup — a stale orphaned file is harmless, but a failed request because the
      // old file was already gone (or locked) must never block replacing the logo.
      await unlink(join(process.cwd(), 'storage', previousLogoPath)).catch(
        () => undefined,
      );
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

export { LOGOS_DIR };
