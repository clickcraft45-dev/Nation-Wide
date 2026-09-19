import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import type {
  PickupDocumentsDto,
  PickupRequestDto,
  RecalculatePreviewDto,
  ResolvedMapsUrlDto,
} from '@nationwide/shared-types';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupRequestsService } from '../pickup-requests/pickup-requests.service';
import { toPickupRequestDto } from '../pickup-requests/pickup-requests.mapper';
import { QueryPickupRequestsDto } from '../pickup-requests/dto/query-pickup-requests.dto';
import { AssignPartnerDto } from '../pickup-requests/dto/assign-partner.dto';
import { RecalculateWeightDto } from '../pickup-requests/dto/recalculate-weight.dto';
import { VerifyPickupRequestDto } from '../pickup-requests/dto/verify-pickup-request.dto';
import { CollectPaymentDto } from '../pickup-requests/dto/collect-payment.dto';
import { AcceptParcelDto } from '../pickup-requests/dto/accept-parcel.dto';
import { RejectParcelDto } from '../pickup-requests/dto/reject-parcel.dto';
import { AdminCreatePickupOrderDto } from '../pickup-requests/dto/admin-create-pickup-order.dto';
import { PhotoUpload, requireFile } from '../pickup-requests/image-upload';
import { resolveMapsUrl } from '../pickup-requests/maps-url';

class ResolveMapsUrlDto {
  @IsString()
  @MaxLength(2000)
  url!: string;
}

// Admin oversight of the pre-order pickup-request pipeline — assign/reassign a Pickup Partner,
// monitor progress, review verification/payment history. The verification/payment/acceptance
// actions below exist ONLY for warehouse drop-offs, which admin handles at the warehouse instead
// of a partner; the service refuses them on any other pickup (findOneForPartner's asAdmin).
@Controller('admin/pickup-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminPickupRequestsController {
  constructor(private readonly pickupRequestsService: PickupRequestsService) {}

  @Get()
  async findAll(
    @Query() query: QueryPickupRequestsDto,
  ): Promise<PickupRequestDto[]> {
    const pickupRequests =
      await this.pickupRequestsService.findAllForAdmin(query);
    return pickupRequests.map(toPickupRequestDto);
  }

  // Staff booking a pickup for a customer (phone-in / walk-in), assigned straight to a partner.
  @Post()
  async create(
    @Body() dto: AdminCreatePickupOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.createForAdmin(dto, user.sub),
    );
  }

  // Turns a pasted Google Maps link into a pin, so staff can check it before booking. Registered
  // ahead of :id routes; only Google's own hosts are ever fetched (see maps-url.ts).
  @Post('resolve-maps-url')
  async resolveMapsUrl(
    @Body() dto: ResolveMapsUrlDto,
  ): Promise<ResolvedMapsUrlDto> {
    const resolved = await resolveMapsUrl(dto.url);
    return {
      latitude: resolved?.latitude ?? null,
      longitude: resolved?.longitude ?? null,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.findOne(id);
    return toPickupRequestDto(pickupRequest);
  }

  // Photos taken at the door: the customer's Aadhaar (kept on the customer, reused next time) and
  // the parcel itself. Uploads are warehouse drop-offs only (the service enforces it);
  // the documents link works on any pickup, so staff can review what a partner collected.
  @Post(':id/aadhaar')
  @PhotoUpload()
  async uploadAadhaar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.saveAadhaar(
        id,
        requireFile(file),
        user.sub,
        true,
      ),
    );
  }

  @Post(':id/parcel-photo')
  @PhotoUpload()
  async uploadParcelPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.saveParcelPhoto(
        id,
        requireFile(file),
        user.sub,
        true,
      ),
    );
  }

  @Get(':id/documents')
  documents(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupDocumentsDto> {
    return this.pickupRequestsService.documents(id, user.sub, true);
  }

  @Patch(':id/assign')
  async assignPartner(
    @Param('id') id: string,
    @Body() dto: AssignPartnerDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.assignPartner(
      id,
      dto.partnerId,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  // Warehouse drop-off workflow: received -> verify -> payment -> accept/reject.
  @Patch(':id/arrive')
  async arrive(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.markArrived(id, user.sub, true),
    );
  }

  @Post(':id/recalculate')
  recalculate(
    @Param('id') id: string,
    @Body() dto: RecalculateWeightDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecalculatePreviewDto> {
    return this.pickupRequestsService.recalculate(id, dto, user.sub, true);
  }

  @Patch(':id/verify')
  async verify(
    @Param('id') id: string,
    @Body() dto: VerifyPickupRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.verify(id, dto, user.sub, true),
    );
  }

  @Patch(':id/collect-payment')
  async collectPayment(
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.collectPayment(id, dto, user.sub, true),
    );
  }

  @Patch(':id/accept')
  async acceptParcel(
    @Param('id') id: string,
    @Body() dto: AcceptParcelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.acceptParcel(id, dto, user.sub, true),
    );
  }

  @Patch(':id/reject')
  async rejectParcel(
    @Param('id') id: string,
    @Body() dto: RejectParcelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.rejectParcel(id, dto, user.sub, true),
    );
  }
}
