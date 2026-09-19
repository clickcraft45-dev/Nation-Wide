import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { CompanySettings } from '@prisma/client';
import type { CompanySettingsDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CompanySettingsService } from '../rate-cards/company-settings.service';
import { toCompanySettingsDto } from '../rate-cards/company-settings.mapper';
import { UpdateCompanySettingsDto } from '../rate-cards/dto/update-company-settings.dto';
import { CreateBrandTemplateDto } from '../rate-cards/dto/create-brand-template.dto';

// Shared by both logo routes.
const LogoUpload = () =>
  UseInterceptors(
    FileInterceptor('logo', {
      // memoryStorage, not diskStorage: the file goes straight to S3 (see
      // CompanySettingsService.saveLogo). The 5 MB cap below is what makes buffering safe.
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      // SVG deliberately excluded — it's an XML format that can carry <script>/event-handler
      // attributes, and a presigned S3 URL serves it back verbatim with no sanitization. Also
      // genuinely non-functional here anyway: @react-pdf/renderer's <Image> component (the only
      // consumer of this logo) only accepts raster PNG/JPEG/WebP, never SVG.
      fileFilter: (_req, file, callback) => {
        if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
          callback(
            new BadRequestException('Logo must be a PNG, JPEG, or WebP image'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  );

// ADMIN only — branding/legal text feeds directly into customer-distributed documents.
// The routes without an id act on the ACTIVE brand template (what new documents use); the
// templates/* routes manage the saved templates themselves.
@Controller('admin/company-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @Get()
  async get(): Promise<CompanySettingsDto> {
    return this.toDto(await this.companySettingsService.get());
  }

  @Patch()
  async update(
    @Body() dto: UpdateCompanySettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    return this.toDto(await this.companySettingsService.update(dto, user.sub));
  }

  @Post('logo')
  @LogoUpload()
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    if (!file) {
      throw new BadRequestException('No logo file provided');
    }
    return this.toDto(
      await this.companySettingsService.saveLogo(file, user.sub),
    );
  }

  @Get('templates')
  async listTemplates(): Promise<CompanySettingsDto[]> {
    const templates = await this.companySettingsService.list();
    return Promise.all(templates.map((t) => this.toDto(t)));
  }

  @Post('templates')
  async createTemplate(
    @Body() dto: CreateBrandTemplateDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    return this.toDto(
      await this.companySettingsService.create(
        dto.name,
        dto.copyFromId,
        user.sub,
      ),
    );
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanySettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    return this.toDto(
      await this.companySettingsService.update(dto, user.sub, id),
    );
  }

  // Switch which template new documents use. Already-issued documents are unaffected.
  @Post('templates/:id/activate')
  @HttpCode(200)
  async activateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    return this.toDto(await this.companySettingsService.activate(id, user.sub));
  }

  @Delete('templates/:id')
  @HttpCode(204)
  deleteTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.companySettingsService.remove(id, user.sub);
  }

  @Post('templates/:id/logo')
  @LogoUpload()
  async uploadTemplateLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    if (!file) {
      throw new BadRequestException('No logo file provided');
    }
    return this.toDto(
      await this.companySettingsService.saveLogo(file, user.sub, id),
    );
  }

  private async toDto(settings: CompanySettings): Promise<CompanySettingsDto> {
    return toCompanySettingsDto(
      settings,
      await this.companySettingsService.logoUrl(settings),
    );
  }
}
