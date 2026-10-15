import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type {
  ProviderRateSheetDto,
  RateSheetApplyResultDto,
} from '@nationwide/shared-types';
import {
  PricingSpreadsheetService,
  type ImportPlan,
} from '../pricing/pricing-spreadsheet.service';
import { RateSheetImportService } from '../pricing/rate-sheet-import.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Carrier workbooks arrive with logos and pictures embedded: the July rate book is 7.6 MB, which a
// 5 MB cap refused outright. Big enough for that several times over; small enough that an
// accidental upload of something else is refused before it is parsed. ADMIN-only route.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const upload = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
};

/**
 * Countries and provider rate sheets as spreadsheets: export what is live, and upload an edited
 * or carrier-sent sheet back after previewing it. ADMIN only — this writes prices.
 */
@Controller('admin/pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPricingSpreadsheetController {
  constructor(
    private readonly spreadsheet: PricingSpreadsheetService,
    private readonly rateSheets: RateSheetImportService,
  ) {}

  /** The provider's live rates, laid out as the carrier's own weight × zone sheet. */
  @Get('providers/:providerId/rate-sheet')
  rateSheet(
    @Param('providerId', ParseUUIDPipe) providerId: string,
  ): Promise<ProviderRateSheetDto> {
    return this.rateSheets.current(providerId);
  }

  /** The same grid as a workbook, which this page's import reads straight back. */
  @Get('providers/:providerId/rate-sheet/export')
  async exportRateSheet(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { name, file } = await this.rateSheets.export(providerId);
    return this.send(res, name, file);
  }

  /**
   * The carrier's workbook as they sent it, compared cell by cell with the live rates. Writes
   * nothing. `allIn`: "true" when the sheet's prices already include fuel and GST.
   */
  @Post('providers/:providerId/rate-sheet/preview')
  @UseInterceptors(FileInterceptor('file', upload))
  previewRateSheet(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() body: { allIn?: string },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProviderRateSheetDto> {
    return this.rateSheets.preview(
      providerId,
      this.fileOf(file),
      body.allIn === 'true',
    );
  }

  /** The same file again: brings every rate of this provider in line with it. */
  @Post('providers/:providerId/rate-sheet/import')
  @UseInterceptors(FileInterceptor('file', upload))
  importRateSheet(
    @CurrentUser() user: JwtPayload,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() body: { allIn?: string; gstPercent?: string },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<RateSheetApplyResultDto> {
    return this.rateSheets.import(
      providerId,
      this.fileOf(file),
      {
        allIn: body.allIn === 'true',
        // A cleared field arrives as "", and Number("") is 0: that would import every band at 0% GST.
        gstPercent: Number(body.gstPercent?.trim() || 18),
      },
      user.sub,
    );
  }

  @Get('countries/export')
  async exportCountries(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.send(
      res,
      'nationwide-countries',
      await this.spreadsheet.exportCountries(),
    );
  }

  @Get('countries/template')
  countriesTemplate(@Res({ passthrough: true }) res: Response): StreamableFile {
    return this.send(
      res,
      'nationwide-countries-template',
      this.spreadsheet.countriesTemplate(),
    );
  }

  // Preview first, import second: an upload is checked against what is live and the admin sees the
  // exact rows that would change before anything is written.
  @Post('countries/preview')
  @UseInterceptors(FileInterceptor('file', upload))
  previewCountries(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportPlan> {
    return this.spreadsheet.previewCountries(this.fileOf(file));
  }

  @Post('countries/import')
  @UseInterceptors(FileInterceptor('file', upload))
  importCountries(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportPlan> {
    return this.spreadsheet.importCountries(this.fileOf(file));
  }

  private fileOf(file?: Express.Multer.File): Buffer {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Attach an .xlsx file to import.');
    }
    // The extension check is for a clear error, not for safety: the parser refuses anything that
    // is not a real workbook anyway.
    if (!/\.xlsx$/i.test(file.originalname)) {
      throw new BadRequestException(
        'Only .xlsx files can be imported — re-save a .csv or .xls as .xlsx first.',
      );
    }
    return file.buffer;
  }

  /**
   * StreamableFile, never a bare Buffer. Nest hands whatever a handler returns to the Express
   * adapter, which calls response.json() on anything that is an object — and a Buffer is one. A
   * returned Buffer therefore went out as {"type":"Buffer","data":[80,75,3,4,...]} under an .xlsx
   * filename, and Excel refused it as corrupt. StreamableFile is piped through untouched.
   */
  private send(res: Response, filename: string, body: Buffer): StreamableFile {
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}-${stamp}.xlsx"`,
      'Content-Length': String(body.length),
    });
    return new StreamableFile(body);
  }
}
