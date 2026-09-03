import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PLACEHOLDER_CLIENT_ID = 'changeme.apps.googleusercontent.com';
const PLACEHOLDER_CLIENT_SECRET = 'changeme';

// Runs before GoogleOAuthGuard on every /auth/google* route — without it, an unconfigured
// deployment would redirect visitors straight into Google's own "Error 401: invalid_client"
// page. This gives a clear, on-brand error instead, and never lets a request reach GoogleStrategy
// unless real credentials are set.
@Injectable()
export class GoogleConfiguredGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (
      !clientId ||
      !clientSecret ||
      clientId === PLACEHOLDER_CLIENT_ID ||
      clientSecret === PLACEHOLDER_CLIENT_SECRET
    ) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured yet.',
      );
    }

    return true;
  }
}
