import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto } from './dto/submit-review.dto';

// Unauthenticated: the token in the URL is the credential, the same pattern the public invoice
// link already uses. Throttled because it is reachable by anyone who has one.
const FEEDBACK_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Approved reviews for the marketing site. No token, no personal data beyond a first name. */
  @Get('reviews')
  async published() {
    const rows = await this.reviews.publishedReviews();
    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      author: (r as unknown as { customer: { name: string } }).customer.name,
      submittedAt: r.submittedAt,
    }));
  }

  @Throttle(FEEDBACK_THROTTLE)
  @Get('feedback/:token')
  invitation(@Param('token') token: string) {
    return this.reviews.findByToken(token);
  }

  @Throttle(FEEDBACK_THROTTLE)
  @Post('feedback/:token')
  @HttpCode(HttpStatus.OK)
  async submit(@Param('token') token: string, @Body() dto: SubmitReviewDto) {
    await this.reviews.submit(token, dto);
    return { message: 'Thank you — your feedback has been recorded.' };
  }
}
