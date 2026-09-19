import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { CompanySettings, Prisma } from '@prisma/client';
import { REGISTERED_COMPANY } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

/// S3 key prefix for company branding, one folder per template.
const LOGO_PREFIX = 'uploads/company-logos';

// Document brand templates. Several may exist; exactly one is active, and get() returns it — so
// the invoice, receipt and rate-card generators keep asking for "the settings" and automatically
// follow whichever template the admin switched to. The first row is created lazily on first read.
@Injectable()
export class CompanySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The active template — what every newly generated document is branded with. */
  async get(): Promise<CompanySettings> {
    const active = await this.prisma.companySettings.findFirst({
      where: { isActive: true },
    });
    if (active) return active;
    const any = await this.prisma.companySettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    // Only reachable if the active row was removed out-of-band; never leave documents unbranded.
    if (any) {
      return this.prisma.companySettings.update({
        where: { id: any.id },
        data: { isActive: true },
      });
    }
    // Seeded from the actual GST registration rather than blank: every field below is one that
    // InvoicesService refuses to issue an invoice without, so an empty row means the first
    // invoice on a fresh deployment fails.
    return this.prisma.companySettings.create({
      data: { ...REGISTERED_COMPANY, isActive: true },
    });
  }

  /** Every template, the active one first, then oldest first. */
  async list(): Promise<CompanySettings[]> {
    await this.get(); // guarantees at least one, active, template exists
    return this.prisma.companySettings.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string): Promise<CompanySettings> {
    const template = await this.prisma.companySettings.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  /**
   * A presigned read URL for a template's logo, or null when none is set. Short-lived by design:
   * the bucket is private, and this URL is the only thing that makes one object readable.
   */
  async logoUrl(settings: CompanySettings): Promise<string | null> {
    if (!settings.logoPath || !this.storage.isConfigured) return null;
    return this.storage.presignGet(settings.logoPath, 900).catch(() => null);
  }

  /**
   * A new template, copied from an existing one (the active one by default) so the admin only
   * changes what differs — GST identity and the rest carry over. Created inactive: making it
   * live is a separate, deliberate switch.
   */
  async create(
    name: string,
    copyFromId: string | undefined,
    actorId: string,
  ): Promise<CompanySettings> {
    const source = copyFromId
      ? await this.findOne(copyFromId)
      : await this.get();
    const created = await this.prisma.companySettings.create({
      // The logo key is shared with the source; see deleteLogoIfUnused for why that is safe.
      data: {
        companyName: source.companyName,
        tagline: source.tagline,
        logoPath: source.logoPath,
        primaryColor: source.primaryColor,
        website: source.website,
        supportEmail: source.supportEmail,
        supportPhone: source.supportPhone,
        address: source.address,
        termsAndConditions: source.termsAndConditions,
        footerNotes: source.footerNotes,
        insuranceDisclaimer: source.insuranceDisclaimer,
        legalDisclaimer: source.legalDisclaimer,
        restrictedItemsNotice: source.restrictedItemsNotice,
        gstin: source.gstin,
        legalName: source.legalName,
        stateName: source.stateName,
        stateCode: source.stateCode,
        sacCode: source.sacCode,
        name: name.trim(),
        isActive: false,
        updatedByAdminId: actorId,
      },
    });
    await this.writeAuditLog(
      actorId,
      'BRAND_TEMPLATE_CREATED',
      created.id,
      { copiedFrom: source.id },
      this.toAuditSnapshot(created),
    );
    return created;
  }

  /** Updates a template — the active one when no id is given. */
  async update(
    dto: UpdateCompanySettingsDto,
    actorId: string,
    id?: string,
  ): Promise<CompanySettings> {
    const existing = id ? await this.findOne(id) : await this.get();
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

  /** Makes a template the one new documents use. Atomic, so there is never zero or two active. */
  async activate(id: string, actorId: string): Promise<CompanySettings> {
    const target = await this.findOne(id);
    if (target.isActive) return target;
    const previous = await this.get();
    const [, activated] = await this.prisma.$transaction([
      this.prisma.companySettings.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      this.prisma.companySettings.update({
        where: { id },
        data: { isActive: true, updatedByAdminId: actorId },
      }),
    ]);
    await this.writeAuditLog(
      actorId,
      'BRAND_TEMPLATE_ACTIVATED',
      id,
      { activeTemplateId: previous.id },
      { activeTemplateId: id },
    );
    return activated;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const template = await this.findOne(id);
    if (template.isActive) {
      throw new BadRequestException(
        'Switch to another template before deleting the one in use',
      );
    }
    await this.prisma.companySettings.delete({ where: { id } });
    await this.deleteLogoIfUnused(template.logoPath);
    await this.writeAuditLog(
      actorId,
      'BRAND_TEMPLATE_DELETED',
      id,
      this.toAuditSnapshot(template),
      {},
    );
  }

  /**
   * Uploads to S3 and records the object key on a template (the active one when no id is given).
   * The file arrives in memory (multer's memoryStorage, capped at 5 MB by the controller).
   */
  async saveLogo(
    file: Express.Multer.File,
    actorId: string,
    id?: string,
  ): Promise<CompanySettings> {
    const existing = id ? await this.findOne(id) : await this.get();
    const previousLogoPath = existing.logoPath;

    // Random name, not the client-supplied one: the original filename is attacker-controlled and
    // ends up in an object key.
    const key = `${LOGO_PREFIX}/${existing.id}/${randomUUID()}${extname(file.originalname)}`;
    await this.storage.put(key, file.buffer, file.mimetype);

    const updated = await this.prisma.companySettings.update({
      where: { id: existing.id },
      data: { logoPath: key, updatedByAdminId: actorId },
    });

    await this.deleteLogoIfUnused(previousLogoPath);

    await this.writeAuditLog(
      actorId,
      'COMPANY_LOGO_UPDATED',
      existing.id,
      { logoPath: previousLogoPath },
      { logoPath: updated.logoPath },
    );

    return updated;
  }

  // A copied template shares its source's logo object, so a replaced or deleted logo is only
  // removed from the bucket once no template points at it any more. Best-effort: an orphaned
  // object is harmless, a failed delete must never block the change.
  private async deleteLogoIfUnused(logoPath: string | null): Promise<void> {
    if (!logoPath) return;
    const stillUsed = await this.prisma.companySettings.count({
      where: { logoPath },
    });
    if (stillUsed === 0) await this.storage.delete(logoPath);
  }

  private toAuditSnapshot(settings: CompanySettings) {
    return {
      name: settings.name,
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
