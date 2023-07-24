import { AuthErrorMessages } from "@src/helpers/AuthHelpers.js";
import { ErrorResponse } from "@src/helpers/HandlerHelpers.js";
import { JsonWebTokenError, TokenExpiredError, jwtPromisified } from "@src/helpers/JwtHelpers.js";
import { MemcachedMethodError, memcached } from "@src/helpers/MemcachedHelpers.js";
import { RequestHandler } from "express";
import * as z from "zod";

export const checkAccessToken: RequestHandler = async (req, res, next) => {
  try {
    // check access token presence in header
    const accessTokenHeader = z.string().safeParse(req.headers["authorization"]);
    // console.log(accessTokenHeader);
    if (!accessTokenHeader.success) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);
    const authorizationStrings = accessTokenHeader.data.split(" ");

    // check access token header string format
    if (authorizationStrings[0].toLowerCase() !== "bearer")
      throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);

    // get access token
    const accessToken = authorizationStrings[1];
    if (!accessToken) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);
    // console.log(accessToken);

    // verify access token
    await jwtPromisified.verify("ACCESS_TOKEN", accessToken);

    // check access token presence in session cache store
    const checkResult = (await memcached.get(accessToken)).message;
    // console.log('🚀 > checkAccessToken > checkResult:', checkResult);
    if (checkResult !== "cache hit") {
      throw new Error(AuthErrorMessages.ACCESS_TOKEN_EXPIRED);
    }

    // all check pass
    next();
  } catch (error) {
    // catch expired access token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.ACCESS_TOKEN_EXPIRED) ||
      (error instanceof MemcachedMethodError && error.message === "cache miss") ||
      error instanceof TokenExpiredError
    ) {
      return res.status(401).json({
        status: "error",
        message: AuthErrorMessages.ACCESS_TOKEN_EXPIRED,
      } satisfies ErrorResponse);
    }

    // catch invalid access token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE) ||
      error instanceof JsonWebTokenError
    ) {
      return res.status(401).json({
        status: "error",
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
    const refreshTokenHeader = z.string().safeParse(req.headers["x-refresh-token"]);
    if (!refreshTokenHeader.success) throw new Error(AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE);
    const refreshToken = refreshTokenHeader.data;

    // verify refresh token
    await jwtPromisified.verify("REFRESH_TOKEN", refreshToken);

    // check refresh token presence in session cache store
    const checkResult = (await memcached.get(refreshToken)).message;
    // console.log('🚀 > checkRefreshToken > checkResult:', checkResult);
    if (checkResult !== "cache hit") {
      throw new Error(AuthErrorMessages.REFRESH_TOKEN_EXPIRED);
    }

    // all check pass
    next();
  } catch (error) {
    // catch expired refresh token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.REFRESH_TOKEN_EXPIRED) ||
      (error instanceof MemcachedMethodError && error.message === "cache miss") ||
      error instanceof TokenExpiredError
    ) {
      return res.status(401).json({
        status: "error",
        message: AuthErrorMessages.REFRESH_TOKEN_EXPIRED,
      } satisfies ErrorResponse);
    }

    // catch invalid refresh token error
    if (
      (error instanceof Error && error.message === AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE) ||
      error instanceof JsonWebTokenError
    ) {
      return res.status(401).json({
        status: "error",
        message: AuthErrorMessages.REFRESH_TOKEN_NOT_VALID_MESSAGE,
      } satisfies ErrorResponse);
    }

    // pass internal error to global error handler
    next(error);
  }
};
