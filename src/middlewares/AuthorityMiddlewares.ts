import { AuthErrorMessages } from "@src/helpers/AuthHelpers.js";
import { ErrorResponse } from "@src/helpers/HandlerHelpers.js";
import { JsonWebTokenError, jwtPromisified } from "@src/helpers/JwtHelpers.js";
import { RequestHandler } from "express";
import * as z from "zod";

export const checkAdmin: RequestHandler = async (req, res, next) => {
  try {
    // get access token header
    const accessTokenHeader = z.string().safeParse(req.headers["authorization"]);
    // check access token header validity
    if (!accessTokenHeader.success) throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);
    if (accessTokenHeader.data.split(" ").length !== 2)
      throw new Error(AuthErrorMessages.ACCESS_TOKEN_NOT_VALID_MESSAGE);

    // decode access token
    const accessToken = accessTokenHeader.data.split(" ")[1];
    const { role } = await jwtPromisified.decode(accessToken);

    // check role
    if (role !== "ADMIN")
      return res.status(403).json({
        status: "error",
        message: "admin role needed to perform this task",
      } satisfies ErrorResponse);

    // all check pass
    next();
  } catch (error) {
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
