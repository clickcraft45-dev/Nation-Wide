import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
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
import {
  PricingSpreadsheetService,
  type ImportPlan,
} from '../pricing/pricing-spreadsheet.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Big enough for the whole rate book several times over; small enough that an accidental upload of
// something else is refused before it is parsed.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const upload = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
};

/**
 * Countries and rate cards as spreadsheets: export what is live, download a filled-in template,
 * and upload an edited sheet back. ADMIN only — this writes prices.
 */
@Controller('admin/pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPricingSpreadsheetController {
  constructor(private readonly spreadsheet: PricingSpreadsheetService) {}

  @Get('countries/export')
  async exportCountries(
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    return this.send(
      res,
      'nationwide-countries',
      await this.spreadsheet.exportCountries(),
    );
  }

  @Get('countries/template')
  countriesTemplate(@Res({ passthrough: true }) res: Response): Buffer {
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

  @Get('rate-cards/export')
  async exportRateCards(
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    return this.send(
      res,
      'nationwide-rate-cards',
      await this.spreadsheet.exportRateCards(),
    );
  }

  @Get('rate-cards/template')
  rateCardsTemplate(@Res({ passthrough: true }) res: Response): Buffer {
    return this.send(
      res,
      'nationwide-rate-cards-template',
      this.spreadsheet.rateCardsTemplate(),
    );
  }

  @Post('rate-cards/preview')
  @UseInterceptors(FileInterceptor('file', upload))
  previewRateCards(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportPlan> {
    return this.spreadsheet.previewRateCards(this.fileOf(file), user.sub);
  }

  @Post('rate-cards/import')
  @UseInterceptors(FileInterceptor('file', upload))
  importRateCards(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportPlan> {
    return this.spreadsheet.importRateCards(this.fileOf(file), user.sub);
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

  private send(res: Response, filename: string, body: Buffer): Buffer {
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}-${stamp}.xlsx"`,
      'Content-Length': String(body.length),
    });
    return body;
  }
}
