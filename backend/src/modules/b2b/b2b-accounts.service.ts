import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { MailService } from '../mail/mail.service';
import { b2bInvite } from '../mail/mail.templates';

// Matches AuthService's own reset-token handling: the same table, the same hashing, so an invite
// and a password reset cannot drift apart or be told apart by an attacker holding one.
const INVITE_TTL_MINUTES = 60 * 24 * 7;

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Bringing a business onto the B2B portal, by invitation only.
 *
 * There is no public sign-up: an admin marks the customer as a business and emails them a link to
 * set a password. That link IS a password-reset grant — the same PasswordResetToken row the
 * forgot-password flow issues — so there is one token mechanism in this codebase, not two.
 *
 * Once set, they sign in at the ordinary login page and are taken to the B2B portal (the frontend
 * routes on `isB2b`, exactly as it already routes partners to the partner app).
 */
@Injectable()
export class B2bAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Marks the customer a business account and emails them a set-password link. */
  async invite(
    customerId: string,
    actorId: string,
  ): Promise<{ email: string; expiresInMinutes: number }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    if (!customer.email) {
      throw new BadRequestException(
        'This customer has no email address — add one before inviting them to the B2B portal',
      );
    }
    if (!customer.isActive) {
      throw new BadRequestException(
        'This customer is deactivated — reactivate them before sending an invite',
      );
    }

    const email = customer.email.toLowerCase();
    // Invalidate any outstanding link first, for the same reason AuthService does: two live
    // grants widen the window an intercepted email is useful in, for no benefit.
    await this.prisma.passwordResetToken.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: hashResetToken(token),
        email,
        expiresAt: new Date(Date.now() + INVITE_TTL_MINUTES * 60_000),
      },
    });

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data: { isB2b: true },
    });

    const frontendUrl = publicFrontendUrl(this.config);
    await this.mail.send(
      b2bInvite({
        companyName: updated.name,
        email,
        setPasswordUrl: `${frontendUrl}/reset-password?token=${token}`,
        portalUrl: `${frontendUrl}/b2b`,
        expiresInDays: Math.round(INVITE_TTL_MINUTES / 60 / 24),
      }),
    );

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: customer.isB2b ? 'B2B_INVITE_RESENT' : 'B2B_ACCOUNT_INVITED',
        entity: 'Customer',
        entityId: customerId,
        before: { isB2b: customer.isB2b },
        after: { isB2b: true },
      },
    });

    return { email, expiresInMinutes: INVITE_TTL_MINUTES };
  }

  /** Takes a customer off the B2B portal without touching their consumer account. */
  async revokeAccess(customerId: string, actorId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { isB2b: false },
    });
    // Their standing ordering links are a second way in; withdrawing portal access must close
    // those too, or "revoked" would only be half true.
    await this.prisma.b2bLink.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'B2B_ACCESS_REVOKED',
        entity: 'Customer',
        entityId: customerId,
        before: { isB2b: customer.isB2b },
        after: { isB2b: false },
      },
    });
  }

  /** True when this signed-in customer may use the portal. */
  async isB2bCustomer(customerId: string): Promise<boolean> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isB2b: true, isActive: true },
    });
    return Boolean(customer?.isB2b && customer.isActive);
  }
}
