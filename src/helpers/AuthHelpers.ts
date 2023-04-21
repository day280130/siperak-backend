import { cookieConfig, csrfCookieName, refreshCookieName } from '@src/configs/CookieConfigs.js';
import { memcached } from '@src/helpers/MemcachedHelpers.js';
import { Response } from 'express';

export const AuthErrorMessages = {
  ANONYM_CSRF_TOKEN_NOT_VALID_MESSAGE: 'valid anonymous csrf token not supplied',
  ANONYM_CSRF_TOKEN_EXPIRED: 'valid anonymous csrf token expired or not supplied',
  CSRF_TOKEN_NOT_VALID_MESSAGE: 'valid csrf token not supplied',
  CSRF_TOKEN_EXPIRED: 'valid csrf token expired or not supplied',
  REFRESH_TOKEN_NOT_VALID_MESSAGE: 'valid refresh token not supplied',
  REFRESH_TOKEN_EXPIRED: 'refresh token expired',
  ACCESS_TOKEN_NOT_VALID_MESSAGE: 'valid access token not supplied',
  ACCESS_TOKEN_EXPIRED: 'access token expired, please refresh access token',
} as const;

export const clearSession = async (res: Response, cacheToken?: string) => {
  res.clearCookie(csrfCookieName, cookieConfig);
  res.clearCookie(refreshCookieName, cookieConfig);
  if (cacheToken) {
    try {
      await memcached.del(cacheToken);
    } catch (_error) {
      /* empty */
    }
  }
};
