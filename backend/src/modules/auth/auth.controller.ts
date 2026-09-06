import {
  Body,
  Controller,
  NotFoundException,
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
import { publicFrontendUrl } from '../../common/config/public-urls';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import ms from 'ms';
import type { LoginResponseDto } from '@nationwide/shared-types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
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

  /**
   * Always 202, whether or not the address has an account. A different answer for a known email
   * would make this an account-enumeration oracle, and it is unauthenticated. Throttled with the
   * same limit as login, since it triggers an outbound email per call.
   */
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.requestPasswordReset(dto.email, this.frontendUrl());
    return {
      message:
        'If an account exists for that address, a reset link is on its way. Check your inbox.',
    };
  }

  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Your password has been reset. You can sign in now.' };
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
      const account = await this.authService.loginWithGoogle(req.user);
      const { refreshToken } = await this.authService.issueTokenPair(account);
      this.setRefreshTokenCookie(res, refreshToken);
      // No tokens in the URL — AuthProvider recovers the session from the httpOnly refresh
      // cookie set above the instant /login mounts (same mechanism as any other page load).
      res.redirect(`${frontendUrl}/login`);
    } catch (error) {
      // Two fixed codes, never a free-text message: anything reflected from here lands in a
      // redirect URL, and the login page renders its own copy for each.
      //
      // "no account" is distinguished from "denied" because it is the one case the visitor can
      // act on — Google sign-in never registers anyone, so they need to be told to sign up
      // rather than left retrying a button that will keep failing.
      const code =
        error instanceof NotFoundException ? 'google_no_account' : 'google_denied';
      res.redirect(`${frontendUrl}/login?error=${code}`);
    }
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

  // FRONTEND_URL is a CORS allow-list and may hold several origins; this resolves the single
  // canonical one to redirect to. See publicFrontendUrl.
  private frontendUrl(): string {
    return publicFrontendUrl(this.configService);
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
