import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import type {
  PaymentUpiDto,
  PickupDocumentsDto,
  PickupPartnerDashboardSummaryDto,
  PickupRequestDto,
  RecalculatePreviewDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupRequestsService } from './pickup-requests.service';
import { toPickupRequestDto } from './pickup-requests.mapper';
import { QueryPickupRequestsDto } from './dto/query-pickup-requests.dto';
import { RecalculateWeightDto } from './dto/recalculate-weight.dto';
import { VerifyPickupRequestDto } from './dto/verify-pickup-request.dto';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { DoorDiscountDto } from './dto/door-discount.dto';
import { AcceptParcelDto } from './dto/accept-parcel.dto';
import { RejectParcelDto } from './dto/reject-parcel.dto';
import { PhotosUpload, requireFiles } from './image-upload';
import { KycDocumentDto, UploadPickupPhotosDto } from './dto/pickup-photos.dto';

// Pickup Partner (field executive) surface — everything a partner can do once assigned a pickup:
// view it, recalculate/verify the parcel's real weight against the pricing engine, collect
// payment, and accept or reject the parcel. Order/Shipment creation only happens inside
// acceptParcel (Section: Order creation).
@Controller('partner/pickup-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PICKUP_PARTNER')
export class PartnerPickupRequestsController {
  constructor(private readonly pickupRequestsService: PickupRequestsService) {}

  // Registered ahead of :id so "dashboard-summary" is never swallowed as an :id param.
  @Get('dashboard-summary')
  async getDashboardSummary(
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupPartnerDashboardSummaryDto> {
    return this.pickupRequestsService.getDashboardSummary(user.sub);
  }

  // Also ahead of :id — "due-approvers" is a fixed path, not a pickup request id.
  @Get('due-approvers')
  listDueApprovers(): Promise<{ id: string; name: string }[]> {
    return this.pickupRequestsService.listDueApprovers();
  }

  // Ahead of :id. The UPI ID the payment QR is drawn from.
  @Get('payment-upi')
  paymentUpi(): Promise<PaymentUpiDto> {
    return this.pickupRequestsService.paymentUpi();
  }

  @Get()
  async findAll(
    @Query() query: QueryPickupRequestsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto[]> {
    const pickupRequests = await this.pickupRequestsService.findAllForPartner(
      user.sub,
      query,
    );
    return pickupRequests.map(toPickupRequestDto);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.findOneForPartner(
      id,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  // Photos taken at the door: the customer's ID document (kept on the customer, reused next time)
  // and the parcel itself, several of each. Both are required before verification.
  @Post(':id/photos')
  @PhotosUpload()
  async uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() dto: UploadPickupPhotosDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.savePhotos(
        id,
        dto.kind,
        requireFiles(files),
        dto.labels,
        user.sub,
      ),
    );
  }

  @Delete(':id/photos/:photoId')
  async deletePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.deletePhoto(id, photoId, user.sub),
    );
  }

  @Patch(':id/kyc-document')
  async setKycDocument(
    @Param('id') id: string,
    @Body() dto: KycDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.setKycDocument(id, dto, user.sub),
    );
  }

  @Get(':id/documents')
  documents(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupDocumentsDto> {
    return this.pickupRequestsService.documents(id, user.sub);
  }

  // Step 1 of the mobile 3-step workflow — no request body, just an ownership-scoped state
  // transition. Registered ahead of the plain :id routes is unnecessary here since this is a
  // sub-path, but kept alongside the other action routes for readability.
  @Patch(':id/arrive')
  async arrive(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.markArrived(
      id,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  @Post(':id/recalculate')
  async recalculate(
    @Param('id') id: string,
    @Body() dto: RecalculateWeightDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecalculatePreviewDto> {
    return this.pickupRequestsService.recalculate(id, dto, user.sub);
  }

  @Patch(':id/verify')
  async verify(
    @Param('id') id: string,
    @Body() dto: VerifyPickupRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.verify(
      id,
      dto,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  // A discount given at the door, approved by a named admin. Before payment only.
  @Patch(':id/door-discount')
  async applyDoorDiscount(
    @Param('id') id: string,
    @Body() dto: DoorDiscountDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.applyDoorDiscount(id, dto, user.sub),
    );
  }

  @Patch(':id/collect-payment')
  async collectPayment(
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.collectPayment(
      id,
      dto,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  @Patch(':id/accept')
  async acceptParcel(
    @Param('id') id: string,
    @Body() dto: AcceptParcelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.acceptParcel(
      id,
      dto,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  @Patch(':id/reject')
  async rejectParcel(
    @Param('id') id: string,
    @Body() dto: RejectParcelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.rejectParcel(
      id,
      dto,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }
}
