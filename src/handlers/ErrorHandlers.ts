import { ErrorResponse, logError } from "@src/helpers/HandlerHelpers.js";
import { JsonWebTokenError } from "@src/helpers/JwtHelpers.js";
import { MemcachedMethodError } from "@src/helpers/MemcachedHelpers.js";
import { isPrismaError } from "@src/helpers/PrismaHelpers.js";
import { ErrorRequestHandler, ParamsDictionary } from "express-serve-static-core";
import { ZodError } from "zod";

type ArbitraryObject = { [key: string]: unknown };

const isArbitraryObject = (potentialObject: unknown): potentialObject is ArbitraryObject => {
  return typeof potentialObject === "object" && potentialObject !== null;
};

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => {
  return (
    isArbitraryObject(error) &&
    error instanceof Error &&
    (typeof error.errno === "number" || typeof error.errno === "undefined") &&
    (typeof error.code === "string" || typeof error.code === "undefined") &&
    (typeof error.path === "string" || typeof error.path === "undefined") &&
    (typeof error.syscall === "string" || typeof error.syscall === "undefined")
  );
};

const errorHandler: ErrorRequestHandler<ParamsDictionary, ErrorResponse> = (
  error: NodeJS.ErrnoException | Error,
  req,
  res,
  _next
) => {
  // set response status code to 500
  res.status(500);

  // catch zod error
  if (error instanceof ZodError) {
    logError(`${req.path} > zod error`, error, true);
    return res.json({
      status: "error",
      message: "internal zod error",
    });
  }

  // catch memcached error
  if (error instanceof MemcachedMethodError) {
    logError(`${req.path} > memcached error`, error, true);
    return res.json({
      status: "error",
      message: "internal memcached error",
    });
  }

  // catch unknown prisma error
  if (isPrismaError(error)) {
    logError(`${req.path} > prisma error`, error, true);
    return res.json({
      status: "error",
      message: "internal prisma error",
    });
  }

  // catch jsonwebtoken error
  if (error instanceof JsonWebTokenError) {
    logError(`${req.path} > jwt error`, error, true);
    return res.json({
      status: "error",
      message: "internal jwt processing error",
    });
  }

  // catch nodejs error
  if (isErrnoException(error)) {
    // catch node crypto error
    if (error.code?.includes("ERR_CRYPTO")) {
      logError(`${req.path} > nodejs crypto error`, error, true);
      return res.json({
        status: "error",
        message: "internal nodejs crypto error",
      });
    }
    logError(`${req.path} > nodejs error`, error, false);
    return res.json({
      status: "error",
      message: "internal nodejs error",
    });
  }

  // last fallback, catch unknown error
  logError(req.path, error, false);
  return res.json({
    status: "error",
    message: "unknown internal error",
  });
};

export default errorHandler;
