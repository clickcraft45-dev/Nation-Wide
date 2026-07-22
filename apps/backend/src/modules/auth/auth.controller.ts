import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import ms from 'ms';
import type { LoginResponseDto } from '@nationwide/shared-types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @UseGuards(ThrottlerGuard)
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

  @UseGuards(ThrottlerGuard)
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

  @UseGuards(JwtAuthGuard)
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
