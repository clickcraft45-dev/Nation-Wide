import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  WhatsAppSendResultDto,
  WhatsAppTemplateDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_TEMPLATES } from './templates';
import { MESSAGE_BODY_TEMPLATES, renderMessageBody } from './message-bodies';
import {
  readTemplateConfigs,
  type TemplateConfig,
} from './whatsapp/gupshup-whatsapp.adapter';

/**
 * The two templates that carry a PDF. They cannot be sent by hand: there is no document to attach
 * from this screen, and Gupshup rejects a document-header template sent without one. They go out
 * automatically, with their PDF, when an invoice or receipt is issued.
 */
const DOCUMENT_TEMPLATES = new Set<string>([
  NOTIFICATION_TEMPLATES.INVOICE_READY,
  NOTIFICATION_TEMPLATES.RECEIPT_READY,
]);

/**
 * A placeholder filled per recipient when the admin leaves it blank. Without this, sending one
 * greeting to forty customers would greet all forty by the same name — or by none.
 */
const AUTO_FILLED_PARAM = 'customerName';

/** Well inside Gupshup's own limit, and far past any real value. */
const MAX_PARAM_LENGTH = 1000;

export class SendWhatsAppTemplateDto {
  /**
   * One customer or many — the same endpoint either way. Capped because every recipient costs a
   * message fee and is a chance to be blocked or reported, which is what lowers the number's
   * quality rating and, with it, how much it is allowed to send.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  customerIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  template!: string;

  /** Keyed by placeholder name, as in GUPSHUP_TEMPLATES' `params`. */
  @IsObject()
  variables!: Record<string, string>;
}

export class SendWhatsAppTextDto {
  @IsUUID('all')
  customerId!: string;

  // WhatsApp's own cap on a text message body.
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;
}

/**
 * WhatsApp messages an admin sends by hand — the WhatsApp counterpart of AdminMailController.
 *
 * Every send goes through NotificationsService.enqueue, the same path as the automated messages,
 * so it gets the same retries, lands in the same Notification log, and uses the same adapter
 * rule: an approved template when one is configured, free-form otherwise.
 *
 * ADMIN only, unlike the mail screen's STAFF+ADMIN. One click here can message five hundred
 * customers from the company's number, and a low quality rating from that is not undone by
 * deleting anything.
 *
 * Responses say "queued", never "sent": the provider accepts or rejects asynchronously, and a
 * free-form message outside the 24-hour window is only refused at that point. Reporting success
 * the admin then acts on would be a lie.
 */
@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminWhatsAppController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every configured template, with its placeholders in order and a preview where one exists. */
  @Get('templates')
  listTemplates(): WhatsAppTemplateDto[] {
    const known = new Set<string>(MESSAGE_BODY_TEMPLATES);
    return Object.entries(this.templates())
      .map(([name, { params }]) => ({
        name,
        params,
        // Rendered with each placeholder standing in for itself, so the form can substitute the
        // admin's values as they type. Only for templates this app wrote the wording of — a
        // custom template's approved text lives in Gupshup, and guessing it would be worse than
        // showing none.
        body: known.has(name)
          ? renderMessageBody(
              name,
              Object.fromEntries(
                params.map((param, i) => [param, `{{${i + 1}}}`]),
              ),
            )
          : null,
        requiresDocument: DOCUMENT_TEMPLATES.has(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('send-template')
  @HttpCode(HttpStatus.OK)
  async sendTemplate(
    @Body() dto: SendWhatsAppTemplateDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WhatsAppSendResultDto> {
    const entry = this.templates()[dto.template];
    if (!entry) {
      throw new BadRequestException(
        `"${dto.template}" is not a configured WhatsApp template`,
      );
    }
    if (DOCUMENT_TEMPLATES.has(dto.template)) {
      throw new BadRequestException(
        `"${dto.template}" carries a PDF and is only sent automatically, together with its document`,
      );
    }
    this.assertVariables(entry, dto.variables);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: dto.customerIds } },
      select: { id: true, name: true, isActive: true },
    });
    const byId = new Map(customers.map((customer) => [customer.id, customer]));

    const result: WhatsAppSendResultDto = { queued: 0, failed: [] };
    // Sequential: each enqueue writes a Notification row first, and five hundred parallel
    // inserts would be a pointless spike for a send that is async downstream anyway.
    for (const customerId of dto.customerIds) {
      const customer = byId.get(customerId);
      if (!customer) {
        result.failed.push({ customerId, reason: 'Customer not found' });
        continue;
      }
      if (!customer.isActive) {
        result.failed.push({
          customerId,
          reason: 'Customer account is deactivated',
        });
        continue;
      }

      const variables = Object.fromEntries(
        entry.params.map((param) => [
          param,
          dto.variables[param]?.trim() ||
            (param === AUTO_FILLED_PARAM ? customer.name : ''),
        ]),
      );
      try {
        await this.notifications.enqueue(
          customer.id,
          'WHATSAPP',
          dto.template,
          variables,
        );
        result.queued += 1;
      } catch (error) {
        result.failed.push({
          customerId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Who sent which template to how many — not the values, which can carry customer details.
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'WHATSAPP_TEMPLATE_SENT',
        entity: 'Notification',
        entityId: dto.template,
        before: {},
        after: {
          template: dto.template,
          recipients: dto.customerIds.length,
          queued: result.queued,
          failed: result.failed.length,
        },
      },
    });

    return result;
  }

  /**
   * A message typed by hand, sent free-form. Deliberately one customer at a time: free-form is
   * only delivered inside the 24-hour window, so a batch of them would mostly fail, and every
   * failure is a message the customer never sees.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('send-text')
  @HttpCode(HttpStatus.OK)
  async sendText(
    @Body() dto: SendWhatsAppTextDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<WhatsAppSendResultDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { id: true, isActive: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.isActive) {
      throw new BadRequestException('That customer account is deactivated');
    }

    await this.notifications.enqueue(
      customer.id,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.CUSTOM_TEXT,
      { text: dto.text.trim() },
    );

    // Never the body — the same rule AdminMailController follows.
    await this.prisma.auditLog.create({
      data: {
        actorId: user.sub,
        action: 'WHATSAPP_TEXT_SENT',
        entity: 'Customer',
        entityId: customer.id,
        before: {},
        after: { length: dto.text.trim().length },
      },
    });

    return { queued: 1, failed: [] };
  }

  /**
   * Configured templates that are well-formed and sendable by hand. custom_text is excluded even
   * if someone configures it: it has no approved template, and routing it through the template
   * endpoint would send an empty approved message instead of the admin's words.
   */
  private templates(): Record<string, TemplateConfig> {
    let all: Record<string, TemplateConfig>;
    try {
      all = readTemplateConfigs(this.config);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'GUPSHUP_TEMPLATES could not be read',
      );
    }
    return Object.fromEntries(
      Object.entries(all).filter(
        ([name, entry]) =>
          name !== NOTIFICATION_TEMPLATES.CUSTOM_TEXT &&
          typeof entry?.id === 'string' &&
          Array.isArray(entry.params),
      ),
    );
  }

  /**
   * Checks every placeholder before anything is queued, so a bad value fails the whole request
   * with a clear message instead of reaching five hundred customers as a broken sentence.
   */
  private assertVariables(
    entry: TemplateConfig,
    variables: Record<string, string>,
  ): void {
    const missing: string[] = [];
    for (const param of entry.params) {
      const value: unknown = variables[param];
      if (value !== undefined && typeof value !== 'string') {
        throw new BadRequestException(`${param} must be text`);
      }
      if (typeof value === 'string' && /[\n\t]/.test(value)) {
        // Meta rejects a template parameter containing a line break or a tab outright — and only
        // at send time, after the admin has already been told it was queued.
        throw new BadRequestException(
          `${param}: WhatsApp does not allow line breaks or tabs inside a template field`,
        );
      }
      if (typeof value === 'string' && value.length > MAX_PARAM_LENGTH) {
        throw new BadRequestException(
          `${param} is too long (max ${MAX_PARAM_LENGTH} characters)`,
        );
      }
      if (
        !(typeof value === 'string' && value.trim()) &&
        param !== AUTO_FILLED_PARAM
      ) {
        missing.push(param);
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(`Fill in: ${missing.join(', ')}`);
    }
  }
}
