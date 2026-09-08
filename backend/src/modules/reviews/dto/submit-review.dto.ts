import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  // Optional: a rating on its own is still useful signal, and forcing prose gets you "good".
  // Capped because this endpoint is reachable by anyone holding the link.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
