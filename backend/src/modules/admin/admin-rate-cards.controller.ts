import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  RateCardCountryOptionDto,
  RateCardDocumentDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RateCardDocumentsService } from '../rate-cards/rate-card-documents.service';
import { RateCardDataService } from '../rate-cards/rate-card-data.service';
import { GenerateRateCardDto } from '../rate-cards/dto/generate-rate-card.dto';
import { QueryRateCardDocumentsDto } from '../rate-cards/dto/query-rate-card-documents.dto';

function downloadFilename(doc: { rateProviderName: string; version: number }) {
  const safeProvider = doc.rateProviderName.replace(/[^a-z0-9]+/gi, '-');
  return `${safeProvider}-RateCard-v${doc.version}.pdf`;
}

// ADMIN only — matches the rest of the pricing admin surface (AdminRateProvidersController etc.),
// since these documents are directly derived from company margin/pricing.
@Controller('admin/rate-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRateCardsController {
  constructor(
    private readonly rateCardDocumentsService: RateCardDocumentsService,
    private readonly rateCardDataService: RateCardDataService,
  ) {}

  // Registered ahead of :id/download so "countries" is never mistaken for a document id.
  @Get('countries')
  async listCountries(
    @Query('rateProviderId') rateProviderId: string,
  ): Promise<RateCardCountryOptionDto[]> {
    return this.rateCardDataService.listCountriesForProvider(rateProviderId);
  }

  @Post('preview')
  @HttpCode(200)
  async preview(
    @Body() dto: GenerateRateCardDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.rateCardDocumentsService.preview(dto);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="rate-card-preview.pdf"',
    });
    return new StreamableFile(pdf);
  }

  @Post()
  async generate(
    @Body() dto: GenerateRateCardDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, pdf } = await this.rateCardDocumentsService.generate(
      dto,
      user.sub,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadFilename(document)}"`,
      'X-Rate-Card-Id': document.id,
      'X-Rate-Card-Version': String(document.version),
    });
    return new StreamableFile(pdf);
  }

  @Get()
  async findAll(
    @Query() query: QueryRateCardDocumentsDto,
  ): Promise<RateCardDocumentDto[]> {
    return this.rateCardDocumentsService.findAll(query);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, pdf } = await this.rateCardDocumentsService.getPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadFilename({
        rateProviderName: document.rateProvider.name,
        version: document.version,
      })}"`,
    });
    return new StreamableFile(pdf);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.rateCardDocumentsService.remove(id, user.sub);
  }
}
