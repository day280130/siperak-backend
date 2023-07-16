import { cacheDuration } from "@src/configs/MemcachedConfigs.js";
import { ErrorResponse, SuccessResponse, logError } from "@src/helpers/HandlerHelpers.js";
import { jwtPromisified } from "@src/helpers/JwtHelpers.js";
import { MemcachedMethodError, memcached } from "@src/helpers/MemcachedHelpers.js";
import { prisma } from "@src/helpers/PrismaHelpers.js";
import { PASSWORD_SECRET, scryptPromisified } from "@src/helpers/PasswordHelpers.js";
import { userSafeNoIDSchema, userSafeSchema, userSchema } from "@src/schemas/UserSchema.js";
import { RequestHandler } from "express";
import * as z from "zod";

const userInputSchema = userSchema.omit({ id: true, role: true });

// const register: RequestHandler = async (req, res, next) => {
//   try {
//     // parse request body
//     const parsedBody = userInputSchema.safeParse(req.body);
//     if (!parsedBody.success) {
//       return res.status(400).json({
//         status: "error",
//         message: "request body not valid",
//         errors: parsedBody.error.issues,
//       } satisfies ErrorResponse);
//     }
//     const { email, name, password } = parsedBody.data;

//     // hash password
//     const hashedPassword = (await scryptPromisified(password, PASSWORD_SECRET, 32)).toString("hex");

//     // insert user to database
//     const insertResult = await prisma.user.create({
//       data: {
//         email,
//         name,
//         password: hashedPassword,
//       },
//     });

//     const safeUserData = userSafeSchema.parse(insertResult);

//     // store created user to cache (potential non-harmful error)
//     // in case data want to be accessed in further request
//     memcached
//       .set(`user:${insertResult.id}`, JSON.stringify(userSafeNoIDSchema.parse(safeUserData)), cacheDuration.short)
//       .catch(error => {
//         if (error instanceof MemcachedMethodError) {
//           logError(`${req.path} > register handler`, error, true);
//         } else {
//           logError(`${req.path} > register handler`, error, false);
//         }
//       });

//     // generate refresh token
//     const refreshToken = await jwtPromisified.sign("REFRESH_TOKEN", safeUserData);

//     // store refresh token as long session key in cache
//     await memcached.set(refreshToken, safeUserData.id, cacheDuration.super);

//     // generate access token
//     const accessToken = await jwtPromisified.sign("ACCESS_TOKEN", safeUserData);

//     // store access token as short session key in cache
//     await memcached.set(accessToken, safeUserData.id, cacheDuration.medium);

//     // send created user and access token via response payload
//     return res.status(201).json({
//       status: "success",
//       message: "user created",
//       datas: {
//         ...safeUserData,
//         refreshToken,
//         accessToken,
//       },
//     } satisfies SuccessResponse);
//   } catch (error) {
//     // catch register unique email violation
//     if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
//       if (error.meta?.target === "user_email_key") {
//         return res.status(400).json({
//           status: "error",
//           message: "account with presented email already exist in the database",
//         } satisfies ErrorResponse);
//       }
//     }

//     // pass internal error to global error handler
//     return next(error);
//   }
// };

const login: RequestHandler = async (req, res, next) => {
  try {
    // parse request body
    const bodySchema = userInputSchema.omit({ name: true });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: "error",
        message: "request body not valid",
        errors: parsedBody.error.issues,
      } satisfies ErrorResponse);
    }
    const { email, password } = parsedBody.data;

    // check email presence in the database
    const user = await prisma.user.findFirst({
      where: {
        email,
      },
    });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "email or password is wrong",
      } satisfies ErrorResponse);
    }
    const safeUserData = userSafeSchema.parse(user);

    // store found user to cache (potential non-harmful error)
    // in case data want to be accessed in further request
    memcached
      .set(`user:${user.id}`, JSON.stringify(userSafeNoIDSchema.parse(safeUserData)), cacheDuration.short)
      .catch(error => {
        if (error instanceof MemcachedMethodError) {
          logError(`${req.path} > login handler`, error, true);
        } else {
          logError(`${req.path} > login handler`, error, false);
        }
      });

    // check password
    const hashedGivenPassword = (await scryptPromisified(password, PASSWORD_SECRET, 32)).toString("hex");
    if (hashedGivenPassword !== user.password) {
      return res.status(400).json({
        status: "error",
        message: "email or password is wrong",
      } satisfies ErrorResponse);
    }

    // store created user to cache (potential non-harmful error)
    memcached
      .set(`user:${user.id}`, JSON.stringify(userSafeNoIDSchema.parse(safeUserData)), cacheDuration.short)
      .catch(error => {
        if (error instanceof MemcachedMethodError) {
          logError(`${req.path} > login handler`, error, true);
        } else {
          logError(`${req.path} > login handler`, error, false);
        }
      });

    // generate refresh token
    const refreshToken = await jwtPromisified.sign("REFRESH_TOKEN", safeUserData);

    // store refresh token as long session key in cache
    await memcached.set(refreshToken, user.id, cacheDuration.super);

    // generate access token
    const accessToken = await jwtPromisified.sign("ACCESS_TOKEN", safeUserData);

    // store refresh token as long session key in cache
    await memcached.set(accessToken, user.id, cacheDuration.super);

    // send logged in user data and access token via response payload
    return res.status(200).json({
      status: "success",
      message: "logged in",
      datas: {
        ...safeUserData,
        refreshToken,
        accessToken,
      },
    } satisfies SuccessResponse);
  } catch (error) {
    // pass internal error to global error handler
    return next(error);
  }
};

const refresh: RequestHandler = async (req, res, next) => {
  try {
    // get old access token from header if any
    const oldAccessTokenHeader = z.string().safeParse(req.headers["authorization"]);
    if (oldAccessTokenHeader.success && oldAccessTokenHeader.data.split(" ").length > 1) {
      const oldAccessToken = oldAccessTokenHeader.data.split(" ")[1];

      // invalidate old access token from session cache store if not expired yet
      memcached.del(oldAccessToken).catch(error => logError(`${req.path} > refresh handler`, error));
    }

    // get refresh token from header
    const refreshToken = z.string().parse(req.headers["x-refresh-token"]);

    // get user data from refresh token
    const { id, email, name, role } = await jwtPromisified.decode(refreshToken);

    // generate new access token
    const accessToken = await jwtPromisified.sign("ACCESS_TOKEN", { id, email, name, role });

    // store new access token as short session key in cache
    await memcached.set(accessToken, id, cacheDuration.medium);

    // send new csrf token and access token via response payload
    return res.status(200).json({
      status: "success",
      message: "new access token generated",
      datas: { id, accessToken },
    } satisfies SuccessResponse);
  } catch (error) {
    // pass internal error to global error handler
    next(error);
  }
};

const logout: RequestHandler = async (req, res, next) => {
  try {
    // get refresh token from header if any
    const refreshTokenHeader = z.string().safeParse(req.headers["x-refresh-token"]);
    // invalidate refresh token
    if (refreshTokenHeader.success)
      memcached.del(refreshTokenHeader.data).catch(error => logError(`${req.path} > logout handler`, error));

    // get old access token from header if any
    const accessTokenHeader = z.string().safeParse(req.headers["authorization"]);
    if (accessTokenHeader.success) {
      // invalidate access token
      const accessToken = accessTokenHeader.data.split(" ")[1];
      memcached.del(accessToken).catch(error => logError(`${req.path} > logout handler`, error));
    }

    // send success response
    return res.status(200).json({
      status: "success",
      message: "logged out",
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const checkSession: RequestHandler = async (req, res) => {
  const refreshToken = z.string().safeParse(req.headers["x-refresh-token"]);
  const accessTokenHeader = z.string().safeParse(req.headers["authorization"]);
  return res.status(200).json({
    status: "success",
    message: "session ok!",
    datas: {
      refreshToken: refreshToken.success ? refreshToken.data : "",
      accessToken: accessTokenHeader.success ? accessTokenHeader.data.split(" ")[1] : "",
    },
  } satisfies SuccessResponse);
};

export const authHandlers = {
  login,
  // register,
  refresh,
  logout,
  checkSession,
};
