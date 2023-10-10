import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import { ReqHandler, logError } from "@src/helpers/HandlerHelpers.js";
import { jwtPromisified } from "@src/helpers/JwtHelpers.js";
import {
  MemcachedMethodError,
  eraseCachedQueryKey,
  getCachedQueryKeys,
  invalidateCachedQueries,
  memcached,
  registerCachedQueryKey,
} from "@src/helpers/MemcachedHelpers.js";
import { prisma } from "@src/helpers/PrismaHelpers.js";
import { PASSWORD_SECRET, scryptPromisified } from "@src/helpers/PasswordHelpers.js";
import { userSafeNoIDSchema, userSafeSchema, userSchema } from "@src/schemas/UserSchema.js";
import { z } from "zod";
import { authConfigs } from "@src/configs/AuthConfigs.js";

const userInputSchema = userSchema.omit({ id: true, role: true });

// const register: ReqHandler = async (req, res, next) => {
//   try {
//     // parse request body
//     const parsedBody = userInputSchema.safeParse(req.body);
//     if (!parsedBody.success) {
//       return res.status(400).json({
//         status: "error",
//         message: "request body not valid",
//         errors: parsedBody.error.issues,
//       });
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
//     });
//   } catch (error) {
//     // catch register unique email violation
//     if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
//       if (error.meta?.target === "user_email_key") {
//         return res.status(400).json({
//           status: "error",
//           message: "account with presented email already exist in the database",
//         });
//       }
//     }

//     // pass internal error to global error handler
//     return next(error);
//   }
// };

const login: ReqHandler = async (req, res, next) => {
  try {
    // parse request body
    const bodySchema = userInputSchema.omit({ name: true });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: "error",
        message: `request body not valid > ${parsedBody.error.issues
          .map(issue => `${issue.path.join(",")}:${issue.message}`)
          .join("|")}`,
      });
    }
    const { email, password } = parsedBody.data;
    if (!email) {
      return res.status(500).json({
        status: "error",
        message: "failed normalizing email",
      });
    }

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
      });
    }
    const safeUserData = userSafeSchema.parse(user);

    // store found user to cache (potential non-harmful error)
    // in case data want to be accessed in further request
    const cacheKey = makeCacheKey(queryKeys.user, user.id);
    memcached
      .set(cacheKey, JSON.stringify(userSafeNoIDSchema.parse(safeUserData)), cacheDuration.short)
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
      });
    }

    // check session count
    const cachedUserSessionTokens = await getCachedQueryKeys(`session:${user.id}`);
    if (cachedUserSessionTokens && cachedUserSessionTokens.length >= authConfigs.maxLogin) {
      return res.status(403).json({
        status: "error",
        message: "maximum allowed login count reached",
      });
    }

    // generate refresh token
    const refreshToken = await jwtPromisified.sign("REFRESH_TOKEN", safeUserData);

    // store refresh token as session key in cache
    await memcached.set(refreshToken, user.id, cacheDuration.super);

    // register refresh token to session key list in cache
    // await registerCachedQueryKey(`session:${user.id}`, refreshToken);
    await registerCachedQueryKey(queryKeys.session(user.id), refreshToken);

    // prolong session key list cache
    memcached
      // .touch(`session:${user.id}:queries`, cacheDuration.super)
      .touch(`${queryKeys.session(user.id)}:queries`, cacheDuration.super)
      .catch(error => logError(`${req.path} > login handler`, error.reason ?? error, false));

    // generate access token
    const accessToken = await jwtPromisified.sign("ACCESS_TOKEN", safeUserData);

    // store refresh token as session key in cache
    await memcached.set(accessToken, user.id, cacheDuration.medium);
    // debugging only :
    // await memcached.set(accessToken, user.id, 10);

    // send logged in user data and access token via response payload
    return res.status(200).json({
      status: "success",
      message: "logged in",
      datas: {
        ...safeUserData,
        refreshToken,
        accessToken,
      },
    });
  } catch (error) {
    // pass internal error to global error handler
    return next(error);
  }
};

const refresh: ReqHandler = async (req, res, next) => {
  try {
    // get old access token from header if any
    const oldAccessTokenHeader = z.string().safeParse(req.headers["authorization"]);
    if (oldAccessTokenHeader.success && oldAccessTokenHeader.data.split(" ").length === 2) {
      const oldAccessToken = oldAccessTokenHeader.data.split(" ")[1];

      // invalidate old access token from session cache store if not expired yet
      memcached.del(oldAccessToken).catch(error => logError(`${req.path} > refresh handler`, error, false));
    }

    // get refresh token from header
    const refreshToken = z.string().parse(req.headers["x-refresh-token"]);

    // get user data from refresh token
    const { id, email, name, role } = await jwtPromisified.decode(refreshToken);

    // generate new access token
    const accessToken = await jwtPromisified.sign("ACCESS_TOKEN", { id, email, name, role });

    // store new access token as short session key in cache
    await memcached.set(accessToken, id, cacheDuration.medium);
    // debugging only :
    // await memcached.set(accessToken, id, 10);

    // send new csrf token and access token via response payload
    return res.status(200).json({
      status: "success",
      message: "new access token generated",
      datas: { id, accessToken },
    });
  } catch (error) {
    // pass internal error to global error handler
    next(error);
  }
};

const logout: ReqHandler = async (req, res, next) => {
  try {
    // get refresh token from header if any
    const refreshTokenHeader = z.string().min(1).safeParse(req.headers["x-refresh-token"]);
    // invalidate refresh token
    if (refreshTokenHeader.success) {
      memcached
        .del(refreshTokenHeader.data)
        .catch(error => logError(`${req.path} > logout handler`, error.reason ?? error, false));

      // erase refresh token from session key list
      if (refreshTokenHeader.data && refreshTokenHeader.data !== "") {
        const { id } = await jwtPromisified.decode(refreshTokenHeader.data);
        // await eraseCachedQueryKey(`session:${id}`, refreshTokenHeader.data);
        await eraseCachedQueryKey(queryKeys.session(id), refreshTokenHeader.data);
      }
    }

    // get old access token from header if any
    const accessTokenHeader = z.string().min(1).safeParse(req.headers["authorization"]);
    if (accessTokenHeader.success) {
      // invalidate access token
      const accessToken = accessTokenHeader.data.split(" ")[1];
      memcached.del(accessToken).catch(error => logError(`${req.path} > logout handler`, error.reason ?? error, false));
    }

    // send success response
    return res.status(200).json({
      status: "success",
      message: "logged out",
    });
  } catch (error) {
    next(error);
  }
};

const forceLogout: ReqHandler = async (req, res, next) => {
  try {
    const bodySchema = userInputSchema.omit({ name: true });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: "error",
        message: `request body not valid > ${parsedBody.error.issues
          .map(issue => `${issue.path.join(",")}:${issue.message}`)
          .join("|")}`,
      });
    }
    if (!parsedBody.data.email) {
      return res.status(500).json({
        status: "error",
        message: "failed normalizing email",
      });
    }

    // check email presence in the database
    const user = await prisma.user.findFirst({
      where: {
        email: parsedBody.data.email,
      },
    });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "email or password is wrong",
      });
    }

    // check password
    const hashedGivenPassword = (await scryptPromisified(parsedBody.data.password, PASSWORD_SECRET, 32)).toString(
      "hex"
    );
    if (hashedGivenPassword !== user.password) {
      return res.status(400).json({
        status: "error",
        message: "email or password is wrong",
      });
    }

    // invalidate all session of the user
    // await invalidateCachedQueries(`session:${user.id}`);
    await invalidateCachedQueries(queryKeys.session(user.id));

    // send success response
    return res.status(200).json({
      status: "success",
      message: "all sessions logged out",
    });
  } catch (error) {
    next(error);
  }
};

const checkSession: ReqHandler = async (req, res) => {
  const refreshToken = z.string().safeParse(req.headers["x-refresh-token"]);
  const accessTokenHeader = z.string().safeParse(req.headers["authorization"]);
  const { id, name, email, role } = await jwtPromisified.decode(refreshToken.success ? refreshToken.data : "");
  return res.status(200).json({
    status: "success",
    message: "session ok!",
    datas: {
      id,
      name,
      email,
      role,
      refreshToken: refreshToken.success ? refreshToken.data : "",
      accessToken: accessTokenHeader.success ? accessTokenHeader.data.split(" ")[1] : "",
    },
  });
};

export const authHandlers = {
  login,
  // register,
  refresh,
  logout,
  forceLogout,
  checkSession,
};
