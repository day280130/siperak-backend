import { AuthErrorMessages } from '@src/helpers/AuthHelpers.js';
import { ErrorResponse } from '@src/helpers/HandlerHelpers.js';
import { JsonWebTokenError, TokenExpiredError, jwtPromisified } from '@src/helpers/JwtHelpers.js';
import { RequestHandler } from 'express';

export const checkAccessToken: RequestHandler = async (req, res, next) => {
  try {
    // check access token presence in header
    const accessTokenHeader = req.headers['authorization'] as string;
    if (!accessTokenHeader) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);
    const accessToken = accessTokenHeader.split(' ')[1];
    if (!accessToken) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);

    // verify access token
    const csrfToken = req.headers['x-csrf-token'] as string;
    await jwtPromisified.verify('ACCESS_TOKEN', accessToken, csrfToken);

    // all check pass
    next();
  } catch (error) {
    // catch expired access token error
    if (error instanceof TokenExpiredError) {
      return res.status(401).json({
        status: 'error',
        message: AuthErrorMessages.ACCESS_TOKEN_EXPIRED,
      } satisfies ErrorResponse);
    }

    // catch no access token error
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
