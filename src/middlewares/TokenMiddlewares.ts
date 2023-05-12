import { AuthErrorMessages } from '@src/helpers/AuthHelpers.js';
import { ErrorResponse } from '@src/helpers/HandlerHelpers.js';
import { JsonWebTokenError, TokenExpiredError, jwtPromisified } from '@src/helpers/JwtHelpers.js';
import { MemcachedMethodError, memcached } from '@src/helpers/MemcachedHelpers.js';
import { RequestHandler } from 'express';

export const checkAccessToken: RequestHandler = async (req, res, next) => {
  try {
    // check access token presence in header
    const accessTokenHeader = req.headers['authorization'] as string;
    if (!accessTokenHeader) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);
    const accessToken = accessTokenHeader.split(' ')[1];
    if (!accessToken) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);

    // verify access token
    await jwtPromisified.verify('ACCESS_TOKEN', accessToken);

    // check access token presence in session cache store
    const checkResult = (await memcached.get(accessToken)).message;
    if (checkResult === 'cache hit') {
      throw new Error(AuthErrorMessages.ACCESS_TOKEN_EXPIRED);
    }

    // all check pass
    next();
  } catch (error) {
    // catch expired access token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.ACCESS_TOKEN_EXPIRED) ||
      (error instanceof MemcachedMethodError && error.message === 'cache miss') ||
      error instanceof TokenExpiredError
    ) {
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.ACCESS_TOKEN_EXPIRED,
      } satisfies ErrorResponse);
    }

    // catch invalid access token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE) ||
      error instanceof JsonWebTokenError
    ) {
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE,
      } satisfies ErrorResponse);
    }

    // pass internal error to global error handler
    next(error);
  }
};

export const checkRefreshToken: RequestHandler = async (req, res, next) => {
  try {
    // check refresh token presence in header
    const refreshToken = req.headers['x-refresh-token'] as string;
    if (!refreshToken) throw new Error(AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE);

    // verify refresh token
    await jwtPromisified.verify('REFRESH_TOKEN', refreshToken);

    // check refresh token presence in session cache store
    const checkResult = (await memcached.get(refreshToken)).message;
    if (checkResult === 'cache hit') {
      throw new Error(AuthErrorMessages.REFRESH_TOKEN_EXPIRED);
    }

    // all check pass
    next();
  } catch (error) {
    // catch expired refresh token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.REFRESH_TOKEN_EXPIRED) ||
      (error instanceof MemcachedMethodError && error.message === 'cache miss') ||
      error instanceof TokenExpiredError
    ) {
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.REFRESH_TOKEN_EXPIRED,
      } satisfies ErrorResponse);
    }

    // catch invalid refresh token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE) ||
      error instanceof JsonWebTokenError
    ) {
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE,
      } satisfies ErrorResponse);
    }

    // pass internal error to global error handler
    next(error);
  }
};
