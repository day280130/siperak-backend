import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import {
  ErrorResponse,
  SuccessResponse,
  snakeToCamel,
  logError,
  serializeZodIssues,
} from "@src/helpers/HandlerHelpers.js";
import { jwtPromisified } from "@src/helpers/JwtHelpers.js";
import { invalidateCachedQueries, memcached, registerCachedQueryKey } from "@src/helpers/MemcachedHelpers.js";
import { PASSWORD_SECRET, scryptPromisified } from "@src/helpers/PasswordHelpers.js";
import { PrismaClientKnownRequestError, prisma } from "@src/helpers/PrismaHelpers.js";
import { userSafeNoIDSchema, userSafeSchema, userSchema } from "@src/schemas/UserSchema.js";
import { RequestHandler } from "express";
import * as z from "zod";

const userQuerySchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  role: userSafeSchema.shape.role.optional(),
  order_by: z.enum(["name", "email", "role", "created_at"]).default("created_at"),
  sort: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().gte(0).default(0),
  limit: z.coerce.number().gte(1).default(2),
});

const usersDataCachedQuerySchema = z.object({
  datas: z.array(userSafeSchema),
  maxPage: z.number(),
  dataCount: z.number(),
});

const getUsersData: RequestHandler = async (req, res, next) => {
  try {
    // parse queries from request query fields
    const parsedQueries = userQuerySchema.safeParse(req.query);

    // send bad request if invalid query present
    if (!parsedQueries.success)
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(parsedQueries.error.issues, "invalid query shape"),
      } satisfies ErrorResponse);

    // form cache key for caching
    const cacheKey = makeCacheKey(queryKeys.user, ...Object.values(parsedQueries.data).map(query => query.toString()));

    // check if the same users query already cached
    try {
      const cachedData = await memcached.get<string>(cacheKey);
      // use it and prolong its duration if present
      // console.log("getting users from cache");
      const responseData = usersDataCachedQuerySchema.parse(JSON.parse(cachedData.result));
      memcached.touch(cacheKey, cacheDuration.super);
      return res.status(200).json({
        status: "success",
        message: "query success",
        datas: { ...responseData, queries: parsedQueries.data },
      } satisfies SuccessResponse);
    } catch (e) {
      /* do nothing */
    }

    // get from db if not
    // console.log("getting users from db");
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: parsedQueries.data.email ?? "",
        },
        name: {
          contains: parsedQueries.data.name ?? "",
        },
        role: {
          in: parsedQueries.data.role ? [parsedQueries.data.role] : ["ADMIN", "USER"],
        },
      },
      select: { id: true, email: true, name: true, role: true },
      // change order_by to camel case
      orderBy: { [snakeToCamel(parsedQueries.data.order_by)]: parsedQueries.data.sort },
      skip: parsedQueries.data.page * parsedQueries.data.limit,
      take: parsedQueries.data.limit,
    });
    const usersCount = await prisma.user.count({
      where: {
        email: {
          contains: parsedQueries.data.email ?? "",
        },
        name: {
          contains: parsedQueries.data.name ?? "",
        },
        role: {
          in: parsedQueries.data.role ? [parsedQueries.data.role] : ["ADMIN", "USER"],
        },
      },
    });
    const maxPage = Math.ceil(usersCount / parsedQueries.data.limit) - 1;

    // cache it in case the same query is requested in further request
    memcached
      .set(cacheKey, JSON.stringify({ datas: users, maxPage, dataCount: usersCount }), cacheDuration.super)
      .catch(error => logError(`${req.path} > getUsersData handler`, error.reason ?? error, false));
    registerCachedQueryKey(queryKeys.user, cacheKey);

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: { datas: users, maxPage, dataCount: usersCount, queries: parsedQueries.data },
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const getUserData: RequestHandler = async (req, res, next) => {
  try {
    // parse id from request param
    const paramId = userSafeSchema.pick({ id: true }).safeParse(req.params);

    // send bad request if no valid params supplied
    if (!paramId.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid id provided",
      } satisfies ErrorResponse);
    }

    // check id and role (only admin can change other id's data)
    // get access token header
    const accessTokenHeader = z.string().parse(req.headers["authorization"]);
    // decode access token
    const accessToken = accessTokenHeader.split(" ")[1];
    const { role: tokenRole, id: tokenId } = await jwtPromisified.decode(accessToken);
    // check role
    if (tokenId !== paramId.data.id && tokenRole !== "ADMIN")
      return res.status(403).json({
        status: "error",
        message: "admin role needed to get other id's resource",
      } satisfies ErrorResponse);

    // check if requested user data present in cache
    // const cacheKey = `user:${paramId.data.id}`;
    const cacheKey = makeCacheKey(queryKeys.user, paramId.data.id);
    try {
      const cachedUserData = await memcached.get<string>(cacheKey);
      // use it and prolong its cache time if present
      // console.log("getting from cache");
      const safeUserData = userSafeNoIDSchema.parse(JSON.parse(cachedUserData.result));
      memcached.touch(cacheKey, cacheDuration.short);
      return res.status(200).json({
        status: "success",
        message: "user found",
        datas: safeUserData,
      } satisfies SuccessResponse);
    } catch (e) {
      /* do nothing */
    }

    // get it from db if not
    // console.log("getting from db");
    const userData = await prisma.user.findFirst({
      where: { id: paramId.data.id },
      select: { email: true, name: true, role: true },
    });

    // send not found if not present in db
    if (!userData) {
      return res.status(404).json({
        status: "error",
        message: "user with given id not found",
      } satisfies ErrorResponse);
    }

    // use and cache it if present
    memcached
      .set(cacheKey, JSON.stringify(userData), cacheDuration.short)
      .catch(error => logError(`${req.path} > getUserData handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "user found",
      datas: userData,
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const userInputSchema = userSchema.omit({ id: true });

const createUser: RequestHandler = async (req, res, next) => {
  try {
    // parse request body
    const inputBody = userInputSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      } satisfies ErrorResponse);
    }
    const { email, name, password, role } = inputBody.data;

    // hash password
    const hashedPassword = (await scryptPromisified(password, PASSWORD_SECRET, 32)).toString("hex");

    // insert user to database
    const insertResult = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role,
      },
    });

    // invalidate cached datas of user queries
    await invalidateCachedQueries(queryKeys.user);

    // send created user and access token via response payload
    const safeInsertedUserData = userSafeSchema.parse(insertResult);
    return res.status(201).json({
      status: "success",
      message: "user created",
      datas: safeInsertedUserData,
    } satisfies SuccessResponse);
  } catch (error) {
    // catch unique email (duplication) violation
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      if (error.meta?.target === "user_email_key") {
        return res.status(409).json({
          status: "error",
          message: "other account with presented email already exist in the database",
        } satisfies ErrorResponse);
      }
    }

    // pass internal error to global error handler
    return next(error);
  }
};

const userUpdateSchema = userSchema.omit({ id: true, password: true }).partial();

const editUser: RequestHandler = async (req, res, next) => {
  try {
    // parse id from request param
    const paramId = userSafeSchema.pick({ id: true }).safeParse(req.params);
    if (!paramId.success)
      return res.status(400).json({
        status: "error",
        message: "no valid id provided",
      } satisfies ErrorResponse);

    // parse request body
    const inputBody = userUpdateSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      } satisfies ErrorResponse);
    }

    // check id and role (only admin can change other id's data)
    // get and decode access token
    const accessToken = z.string().parse(req.headers["authorization"]).split(" ")[1];
    const { role: tokenRole, id: tokenId } = await jwtPromisified.decode(accessToken);
    // check id
    if (tokenId !== paramId.data.id && tokenRole !== "ADMIN")
      return res.status(403).json({
        status: "error",
        message: "admin role needed to update other id's resource",
      } satisfies ErrorResponse);

    // check inputted role (only admin can change user's role to admin)
    if (tokenRole !== "ADMIN" && inputBody.data.role === "ADMIN")
      return res.status(403).json({
        status: "error",
        message: "admin role needed to update other id's role to admin",
      } satisfies ErrorResponse);

    // check user with given id presence in db
    const currentUserData = await prisma.user.findFirst({
      where: {
        id: paramId.data.id,
      },
      select: { email: true, name: true, role: true, password: true },
    });
    // send not found if not present in db
    if (!currentUserData) {
      return res.status(404).json({
        status: "error",
        message: "user with given id not found",
      } satisfies ErrorResponse);
    }

    // check admin count in database if inputted role is admin
    // (there must be at least one admin in user table)
    if (currentUserData.role === "ADMIN" && inputBody.data.role === "USER") {
      const adminCount = await prisma.user.count({
        where: {
          role: "ADMIN",
        },
      });
      if (adminCount <= 1)
        return res.status(409).json({
          status: "error",
          message: "there must be at least one admin",
        } satisfies ErrorResponse);
    }

    // update user's data to database
    const updateResult = await prisma.user.update({
      where: {
        id: paramId.data.id,
      },
      data: {
        email: inputBody.data.email ?? currentUserData.email,
        name: inputBody.data.name ?? currentUserData.name,
        role: inputBody.data.role ?? currentUserData.role,
      },
    });

    // invalidate cached datas and user queries
    await invalidateCachedQueries(queryKeys.user);

    // update cached user data with current id
    // const cacheKey = `user:${paramId.data.id}`;
    const cacheKey = makeCacheKey(queryKeys.user, paramId.data.id);
    memcached
      .set(cacheKey, JSON.stringify(userSafeNoIDSchema.parse(updateResult)), cacheDuration.short)
      .catch(error => logError(`${req.path} > editUser handler`, error.reason ?? error, false));

    // send created user and access token via response payload
    const safeUpdatedUserData = userSafeSchema.parse(updateResult);
    return res.status(200).json({
      status: "success",
      message: "user updated",
      datas: safeUpdatedUserData,
    } satisfies SuccessResponse);
  } catch (error) {
    // catch unique email (duplication) violation
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      if (error.meta?.target === "user_email_key") {
        return res.status(409).json({
          status: "error",
          message: "other account with presented email already exist in the database",
        } satisfies ErrorResponse);
      }
    }

    // pass internal error to global error handler
    return next(error);
  }
};

const userPasswordUpdateSchema = z.object({
  oldPassword: userSchema.shape.password,
  newPassword: userSchema.shape.password,
});

const editUserPassword: RequestHandler = async (req, res, next) => {
  try {
    // parse id from request param
    const paramId = userSafeSchema.pick({ id: true }).safeParse(req.params);
    if (!paramId.success)
      return res.status(400).json({
        status: "error",
        message: "no valid id provided",
      } satisfies ErrorResponse);

    // parse request body
    const inputBody = userPasswordUpdateSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      } satisfies ErrorResponse);
    }

    // check id (password can only be changed by the account's owner)
    // get and decode access token
    const accessToken = z.string().parse(req.headers["authorization"]).split(" ")[1];
    const { id: tokenId } = await jwtPromisified.decode(accessToken);
    // check id
    if (tokenId !== paramId.data.id)
      return res.status(403).json({
        status: "error",
        message: "password can only be changed by the account's owner",
      } satisfies ErrorResponse);

    // check user with given id presence in db
    const currentUserData = await prisma.user.findFirst({
      where: {
        id: paramId.data.id,
      },
      select: { password: true },
    });
    // send not found if not present in db
    if (!currentUserData) {
      return res.status(404).json({
        status: "error",
        message: "user with given id not found",
      } satisfies ErrorResponse);
    }

    // check old password
    const hashedInputOldPassword = (
      await scryptPromisified(inputBody.data.oldPassword ?? "", PASSWORD_SECRET, 32)
    ).toString("hex");
    if (currentUserData.password !== hashedInputOldPassword) {
      return res.status(400).json({
        status: "error",
        message: "old password is wrong",
      } satisfies ErrorResponse);
    }

    // hash new password
    const hashedNewPassword = (await scryptPromisified(inputBody.data.newPassword ?? "", PASSWORD_SECRET, 32)).toString(
      "hex"
    );

    // update user's data to database
    await prisma.user.update({
      where: {
        id: paramId.data.id,
      },
      data: {
        password: hashedNewPassword,
      },
    });

    // send created user and access token via response payload
    return res.status(200).json({
      status: "success",
      message: "user's password updated",
    } satisfies SuccessResponse);
  } catch (error) {
    // pass internal error to global error handler
    return next(error);
  }
};

const deleteUser: RequestHandler = async (req, res, next) => {
  try {
    // parse id from request param
    const paramId = userSafeSchema.pick({ id: true }).safeParse(req.params);

    // send bad request if no valid params supplied
    if (!paramId.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid id provided",
      } satisfies ErrorResponse);
    }

    // get user data
    let inputtedUserData;
    // check if requested user data present in cache
    // const cacheKey = `user:${paramId.data.id}`;
    const cacheKey = makeCacheKey(queryKeys.user, paramId.data.id);
    try {
      const cachedUserData = await memcached.get<string>(cacheKey);
      // use it if present
      // console.log("getting from cache");
      inputtedUserData = userSafeNoIDSchema.parse(JSON.parse(cachedUserData.result));
    } catch (e) {
      // get from db if not
      inputtedUserData = await prisma.user.findFirst({
        where: { id: paramId.data.id },
        select: { role: true },
      });
      // send not found if not present in db
      // console.log("getting from db");
      if (!inputtedUserData) {
        return res.status(404).json({
          status: "error",
          message: "user with given id not found",
        } satisfies ErrorResponse);
      }
    }

    // check admin count in database
    // (there must be at least one admin in user table)
    if (inputtedUserData.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: {
          role: "ADMIN",
        },
      });
      if (adminCount <= 1)
        return res.status(409).json({
          status: "error",
          message: "there must be at least one admin",
        } satisfies ErrorResponse);
    }

    // delete user
    await prisma.user.delete({
      where: { id: paramId.data.id },
    });

    // invalidate cached datas of user queries
    await invalidateCachedQueries(queryKeys.user);

    // invalidate all session of the user
    // await invalidateCachedQueries(`session:${paramId.data.id}`);
    await invalidateCachedQueries(queryKeys.session(paramId.data.id));

    // invalidate user data in cache
    memcached.del(cacheKey).catch(error => logError(`${req.path} > deleteUser handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "user deleted",
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

export const userHandlers = {
  getUsersData,
  getUserData,
  createUser,
  editUser,
  editUserPassword,
  deleteUser,
};
