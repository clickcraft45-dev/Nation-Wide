import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { B2bLink } from '@prisma/client';
import type { B2bLinkDto, B2bLinkOverviewDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { publicFrontendUrl } from '../../common/config/public-urls';

// Same rule as PasswordResetToken and Review: store a hash, never the token. A leak of this table
// must not hand anyone the ability to order in a customer's name.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toB2bLinkDto(link: B2bLink, url?: string): B2bLinkDto {
  return {
    id: link.id,
    label: link.label,
    contactName: link.contactName,
    customerId: link.customerId,
    lastUsedAt: link.lastUsedAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    ...(url ? { url } : {}),
  };
}

/**
 * Standing order-request links for business customers: one link, handed to their despatch team,
 * that books shipments against their account without individual logins.
 *
 * The link grants exactly one capability — request pickups for that customer, reusing their saved
 * addresses and items. It is not a login: it cannot read invoices, see prices already charged, or
 * change the account. Revoking is the only way to withdraw it, so it is a first-class action
 * rather than an afterthought.
 */
@Injectable()
export class B2bLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Returns the DTO with the one and only sight of the token, as a ready-to-send URL. */
  async create(
    customerId: string,
    label: string,
    actorId: string,
    contactName?: string,
  ): Promise<B2bLinkDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const token = randomBytes(32).toString('base64url');
    const link = await this.prisma.b2bLink.create({
      data: {
        customerId,
        label: label.trim(),
        contactName: contactName?.trim() || null,
        tokenHash: hashToken(token),
        createdByAdminId: actorId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'B2B_LINK_CREATED',
        entity: 'B2bLink',
        entityId: link.id,
        after: { customerId, label: link.label, contactName: link.contactName },
      },
    });
    return toB2bLinkDto(link, this.urlFor(token));
  }

  findAllForCustomer(customerId: string): Promise<B2bLink[]> {
    return this.prisma.b2bLink.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Every link ever issued, across customers — the one screen that answers "who can order in our
   * name right now", which is a question the per-customer card cannot answer.
   *
   * Revoked links stay listed behind a flag rather than disappearing: a revoked link is the record
   * that access was withdrawn, and hiding it makes the history look like it never existed.
   */
  async findAll(includeRevoked: boolean): Promise<B2bLinkOverviewDto[]> {
    const links = await this.prisma.b2bLink.findMany({
      where: includeRevoked ? {} : { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true, email: true, isB2b: true } },
        createdBy: { select: { email: true } },
      },
    });
    return links.map((link) => ({
      ...toB2bLinkDto(link),
      customerName: link.customer.name,
      customerEmail: link.customer.email,
      customerIsB2b: link.customer.isB2b,
      createdByEmail: link.createdBy?.email ?? null,
    }));
  }

  async revoke(id: string, actorId: string): Promise<B2bLink> {
    const link = await this.prisma.b2bLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException(`Link ${id} not found`);
    if (link.revokedAt) return link;
    const revoked = await this.prisma.b2bLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'B2B_LINK_REVOKED',
        entity: 'B2bLink',
        entityId: id,
        before: { revokedAt: null },
        after: { revokedAt: revoked.revokedAt?.toISOString() },
      },
    });
    return revoked;
  }

  /**
   * The token presented by the portal, resolved to the customer it may act for. Null for anything
   * unknown or revoked — the caller turns that into a flat 404, never a "revoked" vs "never
   * existed" distinction that would confirm a guessed token was once real.
   */
  async resolve(
    token: string | undefined,
  ): Promise<{ linkId: string; customerId: string; label: string } | null> {
    if (!token) return null;
    const link = await this.prisma.b2bLink.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!link || link.revokedAt) return null;
    // Last used is what tells an admin a link is live before they revoke it. Fire-and-forget: a
    // failed bookkeeping write must never fail the customer's request.
    void this.prisma.b2bLink
      .update({ where: { id: link.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      linkId: link.id,
      customerId: link.customerId,
      label: link.label,
    };
  }

  private urlFor(token: string): string {
    return `${publicFrontendUrl(this.config)}/b2b/${token}`;
  }
}
