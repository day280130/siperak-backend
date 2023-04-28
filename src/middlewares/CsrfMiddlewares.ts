import { csrfCookieName, refreshCookieName } from '@src/configs/CookieConfigs.js';
import { AuthErrorMessages, clearSession } from '@src/helpers/AuthHelpers.js';
import { ErrorResponse, logError } from '@src/helpers/HandlerHelpers.js';
import { JsonWebTokenError, TokenExpiredError, jwtPromisified } from '@src/helpers/JwtHelpers.js';
import { MemcachedMethodError, memcached } from '@src/helpers/MemcachedHelpers.js';
import { createHash } from 'crypto';
import { RequestHandler } from 'express';

export const checkAnonymousCsrfToken: RequestHandler = async (req, res, next) => {
  try {
    // check hashed csrf token presence in cookie
    const hashedCsrfToken = req.signedCookies[csrfCookieName];
    // console.log('🚀 > constcheckAnonymousCsrfToken > hashedCsrfToken:', hashedCsrfToken);
    if (!hashedCsrfToken) throw new Error(AuthErrorMessages.ANONYM_CSRF_TOKEN_NOT_VALID_MESSAGE);

    // check csrf token presence in header
    const csrfToken = req.headers['x-csrf-token'] as string;
    // console.log('🚀 > constcheckAnonymousCsrfToken > csrfToken:', csrfToken);
    if (!csrfToken) throw new Error(AuthErrorMessages.ANONYM_CSRF_TOKEN_NOT_VALID_MESSAGE);

    // get csrf key in cache
    const csrfKey = (await memcached.get(csrfToken)).result as string;
    // console.log('🚀 > constcheckAnonymousCsrfToken > csrfKey:', csrfKey);

    // check hashed csrf token validity
    const expectedHashedCsrfToken = createHash('sha256').update(`${csrfKey}${csrfToken}`).digest('hex');
    // console.log('🚀 > constcheckAnonymousCsrfToken > expectedHashedCsrfToken:', expectedHashedCsrfToken);
    if (expectedHashedCsrfToken !== hashedCsrfToken)
      throw new Error(AuthErrorMessages.ANONYM_CSRF_TOKEN_NOT_VALID_MESSAGE);

    // prolong csrf key cache expire time
    try {
      await memcached.touch(csrfToken, 5 * 60);
    } catch (error) {
      if (error instanceof MemcachedMethodError) {
        logError(`${req.path} : checkAnonymousCsrfToken > memcached error`, error, true);
      }
      logError(`${req.path} : checkAnonymousCsrfToken`, error, false);
    }

    // all check pass
    return next();
  } catch (error) {
    // get csrf token if any
    const csrfToken = req.headers['x-csrf-token'] as string | null;

    // catch no valid csrf token error
    if (error instanceof Error && error.message === AuthErrorMessages.ANONYM_CSRF_TOKEN_NOT_VALID_MESSAGE) {
      if (csrfToken) {
        clearSession(res, csrfToken);
      } else {
        clearSession(res);
      }
      return res.status(403).json({
        status: 'error',
        message: AuthErrorMessages.ANONYM_CSRF_TOKEN_NOT_VALID_MESSAGE,
      } satisfies ErrorResponse);
    }

    // catch memcached error
    if (error instanceof MemcachedMethodError) {
      // catch expired or no valid csrf token error
      if (error.message === 'cache miss') {
        clearSession(res);
        return res.status(403).json({
          status: 'error',
          message: AuthErrorMessages.ANONYM_CSRF_TOKEN_EXPIRED,
        } satisfies ErrorResponse);
      } else {
        // pass internal memcached error to global error handler
        next(error);
      }
    }

    // pass internal error to global error handler
    next(error);
  }
};

export const checkAuthorizedCsrfToken: RequestHandler = async (req, res, next) => {
  try {
    // check hashed csrf token presence in cookie
    const hashedCsrfToken = req.signedCookies[csrfCookieName];
    if (!hashedCsrfToken) throw new Error(AuthErrorMessages.CSRF_TOKEN_NOT_VALID_MESSAGE);

    // check csrf token presence in header
    const csrfToken = req.headers['x-csrf-token'] as string;
    if (!csrfToken) throw new Error(AuthErrorMessages.CSRF_TOKEN_NOT_VALID_MESSAGE);

    // check refresh token presence in cookie
    const refreshToken = req.signedCookies[refreshCookieName];
    if (!refreshToken) throw new Error(AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE);

    // check refresh token validity
    await jwtPromisified.verify('REFRESH_TOKEN', refreshToken);

    // get csrf key in cache
    const csrfKey = (await memcached.get(refreshToken)).result as string;

    // check hashed csrf token validity
    const expectedHashedCsrfToken = createHash('sha256').update(`${csrfKey}${csrfToken}`).digest('hex');
    if (expectedHashedCsrfToken !== hashedCsrfToken) throw new Error(AuthErrorMessages.CSRF_TOKEN_NOT_VALID_MESSAGE);

    // prolong csrf key cache expire time
    try {
      await memcached.touch(refreshToken, 7 * 24 * 60 * 60);
    } catch (error) {
      if (error instanceof MemcachedMethodError) {
        logError(`${req.path} : checkAuthorizedCsrfToken > memcached error`, error, true);
      }
      logError(`${req.path} : checkAuthorizedCsrfToken`, error, false);
    }

    // all check pass
    return next();
  } catch (error) {
    // get refresh token if any
    const refreshToken = req.signedCookies[refreshCookieName] as string | null;

    // catch no valid csrf token error
    if (error instanceof Error && error.message === AuthErrorMessages.CSRF_TOKEN_NOT_VALID_MESSAGE) {
      if (refreshToken) {
        clearSession(res, refreshToken);
      } else {
        clearSession(res);
      }
      return res.status(403).json({
        status: 'error',
        message: AuthErrorMessages.CSRF_TOKEN_NOT_VALID_MESSAGE,
      } satisfies ErrorResponse);
    }

    // catch memcached error
    if (error instanceof MemcachedMethodError) {
      // catch expired or no valid csrf token error
      if (error.message === 'cache miss') {
        clearSession(res);
        return res.status(403).json({
          status: 'error',
          message: AuthErrorMessages.CSRF_TOKEN_EXPIRED,
        } satisfies ErrorResponse);
      } else {
        // pass internal memcached error to global error handler
        next(error);
      }
    }

    // catch refresh token expired error
    if (error instanceof TokenExpiredError) {
      if (refreshToken) clearSession(res, refreshToken);
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.REFRESH_TOKEN_EXPIRED,
      } satisfies ErrorResponse);
    }

    // catch no valid refresh token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE) ||
      error instanceof JsonWebTokenError
    ) {
      if (refreshToken) {
        clearSession(res, refreshToken);
      } else {
        clearSession(res);
      }
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE,
      } satisfies ErrorResponse);
    }

    // pass internal error to global error handler
    next(error);
  }
};
