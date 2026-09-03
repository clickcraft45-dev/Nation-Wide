import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { CompanySettingsDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CompanySettingsService } from '../rate-cards/company-settings.service';
import { toCompanySettingsDto } from '../rate-cards/company-settings.mapper';
import { UpdateCompanySettingsDto } from '../rate-cards/dto/update-company-settings.dto';

// ADMIN only — branding/legal text feeds directly into customer-distributed documents.
@Controller('admin/company-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @Get()
  async get(): Promise<CompanySettingsDto> {
    const settings = await this.companySettingsService.get();
    return toCompanySettingsDto(
      settings,
      await this.companySettingsService.logoUrl(settings),
    );
  }

  @Patch()
  async update(
    @Body() dto: UpdateCompanySettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    const settings = await this.companySettingsService.update(dto, user.sub);
    return toCompanySettingsDto(
      settings,
      await this.companySettingsService.logoUrl(settings),
    );
  }

  @Post('logo')
  @UseInterceptors(
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
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<CompanySettingsDto> {
    if (!file) {
      throw new BadRequestException('No logo file provided');
    }
    const settings = await this.companySettingsService.saveLogo(file, user.sub);
    return toCompanySettingsDto(
      settings,
      await this.companySettingsService.logoUrl(settings),
    );
  }
}
