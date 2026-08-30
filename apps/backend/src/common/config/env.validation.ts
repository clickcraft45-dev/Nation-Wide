import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  // The backend's own public origin, e.g. https://api.nationwidelogistics.co. Required only by
  // invoice delivery: Meta's servers fetch the attachment from a link we build, so this has to
  // be the externally-reachable origin, never localhost or an internal AWS DNS name.
  @IsOptional()
  @IsString()
  PUBLIC_BASE_URL?: string;

  // Gupshup (the WhatsApp BSP). Optional as a group: MessagingAdapterRegistry falls back to the
  // stub unless ALL are present, so a partially-configured deployment logs loudly at boot rather
  // than throwing on the first customer notification.
  @IsOptional()
  @IsString()
  GUPSHUP_API_KEY?: string;

  @IsOptional()
  @IsString()
  GUPSHUP_SOURCE_PHONE?: string;

  @IsOptional()
  @IsString()
  GUPSHUP_APP_NAME?: string;

  @IsOptional()
  @IsString()
  GUPSHUP_TEMPLATES?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  TRACKING_PROVIDER_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  TRACKING_CACHE_TTL_ACTIVE_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  TRACKING_CACHE_TTL_TERMINAL_SECONDS?: number;

  // How long a RATED quote's computed provider options stay selectable before the customer
  // must request a fresh quote (Section: Quote expiration). Defaults to 48 at the call site.
  @IsOptional()
  @IsInt()
  @Min(1)
  QUOTE_VALIDITY_HOURS?: number;

  @IsOptional()
  @IsString()
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;

  // Meta App Secret — signs the X-Hub-Signature-256 header on every inbound webhook POST.
  // Optional so the app still boots before a real WABA exists; the webhook POST handler itself
  // rejects with 401 if this isn't set (see WhatsAppWebhookController).
  @IsOptional()
  @IsString()
  WHATSAPP_APP_SECRET?: string;

  // Optional so the app still boots when ICL isn't the active adapter (e.g. local dev on the
  // stub). ICLShippingProviderAdapter itself throws a clear error if invoked without these set.
  @IsOptional()
  @IsString()
  ICL_TRACKING_API_URL?: string;

  @IsOptional()
  @IsString()
  ICL_API_USER_ID?: string;

  @IsOptional()
  @IsString()
  ICL_API_PASSWORD?: string;

  // Optional so the app still boots without Google sign-in configured — GoogleConfiguredGuard
  // gives a clear "not configured" response if /auth/google is hit before these are set, rather
  // than crashing the whole app the way getOrThrow() would at boot.
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALLBACK_URL?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  return validated;
}
