import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type {
  JwtPayload,
  JwtPayloadWithRefreshToken,
} from '../types/jwt-payload.type';

function extractRefreshTokenFromCookie(req: Request): string | null {
  const token = (req.cookies as Record<string, string> | undefined)
    ?.refresh_token;
  return token ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: extractRefreshTokenFromCookie,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): JwtPayloadWithRefreshToken {
    const refreshToken = extractRefreshTokenFromCookie(req);
    if (!refreshToken) {
      throw new Error('Refresh token cookie is missing');
    }
    return { ...payload, refreshToken };
  }
}
