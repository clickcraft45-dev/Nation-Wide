import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import ms from 'ms';
import type { LoginResponseDto } from '@nationwide/shared-types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteGoogleSignupDto } from './dto/complete-google-signup.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { GoogleConfiguredGuard } from '../../common/guards/google-configured.guard';
import { GoogleOAuthGuard } from '../../common/guards/google-oauth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { GoogleProfile } from './strategies/google.strategy';
import type {
  JwtPayload,
  JwtPayloadWithRefreshToken,
} from './types/jwt-payload.type';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Deliberately strict — this guards the single unified login/register form against
// brute-force and credential-stuffing attempts. Keyed per-IP by ThrottlerGuard's default.
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const account = await this.authService.register(dto);
    const { accessToken, refreshToken } =
      await this.authService.issueTokenPair(account);

    this.setRefreshTokenCookie(res, refreshToken);

    return {
      accessToken,
      user: { id: account.id, email: account.email, role: account.role },
    };
  }

  // Initiates the OAuth handshake — GoogleOAuthGuard's canActivate() itself performs the
  // redirect to Google's consent screen via the underlying response before this body ever runs
  // (the standard NestJS+Passport OAuth pattern); this handler is unreachable.
  @UseGuards(GoogleConfiguredGuard, GoogleOAuthGuard)
  @Get('google')
  googleAuth(): void {}

  @UseGuards(GoogleConfiguredGuard, GoogleOAuthGuard)
  @Get('google/callback')
  async googleAuthCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.frontendUrl();
    try {
      const result = await this.authService.loginOrPrepareGoogleSignup(
        req.user,
      );
      if (result.status === 'needs-phone') {
        res.redirect(
          `${frontendUrl}/register/google?token=${encodeURIComponent(result.pendingToken)}`,
        );
        return;
      }
      const { refreshToken } = await this.authService.issueTokenPair(
        result.account,
      );
      this.setRefreshTokenCookie(res, refreshToken);
      // No tokens in the URL — AuthProvider recovers the session from the httpOnly refresh
      // cookie set above the instant /login mounts (same mechanism as any other page load).
      res.redirect(`${frontendUrl}/login`);
    } catch {
      // Covers the staff/admin-email rejection and anything else unexpected. Deliberately one
      // fixed error code in the query string, not a message — free-text there is an open
      // redirect/reflection smell, and the login page already renders one fixed copy for it.
      res.redirect(`${frontendUrl}/login?error=google_denied`);
    }
  }

  // Second half of new-customer Google sign-up — exchanges the pendingToken (proof of a
  // verified Google identity, see AuthService.loginOrPrepareGoogleSignup) plus a phone number for
  // a real account. Throttled like login/register for the same brute-force reasons.
  @Throttle(AUTH_THROTTLE)
  @Post('google/complete')
  @HttpCode(HttpStatus.CREATED)
  async completeGoogleSignup(
    @Body() dto: CompleteGoogleSignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const account = await this.authService.completeGoogleSignup(
      dto.pendingToken,
      dto.phone,
    );
    const { accessToken, refreshToken } =
      await this.authService.issueTokenPair(account);

    this.setRefreshTokenCookie(res, refreshToken);

    return {
      accessToken,
      user: { id: account.id, email: account.email, role: account.role },
    };
  }

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const account = await this.authService.authenticate(
      dto.email,
      dto.password,
    );
    const { accessToken, refreshToken } =
      await this.authService.issueTokenPair(account);

    this.setRefreshTokenCookie(res, refreshToken);

    return {
      accessToken,
      user: { id: account.id, email: account.email, role: account.role },
    };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: JwtPayloadWithRefreshToken,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const { accessToken, refreshToken } =
      await this.authService.refreshTokenPair(
        user.sub,
        user.role,
        user.refreshToken,
      );

    this.setRefreshTokenCookie(res, refreshToken);

    return { accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.revokeRefreshToken(user.sub, user.role);
    res.clearCookie(REFRESH_TOKEN_COOKIE);
  }

  // Throttled like login/register — an attacker holding a stolen access token could otherwise
  // brute-force currentPassword with no rate limit at all.
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  @Patch('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      user.sub,
      user.role,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  private frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3004'
    );
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string): void {
    const expiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ms(expiresIn as ms.StringValue),
      path: '/api/v1/auth',
    });
  }
}
