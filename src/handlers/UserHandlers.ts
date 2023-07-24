import { cacheDuration } from "@src/configs/MemcachedConfigs.js";
import { ErrorResponse, SuccessResponse, logError } from "@src/helpers/HandlerHelpers.js";
import { jwtPromisified } from "@src/helpers/JwtHelpers.js";
import { invalidateCachedQueries, memcached, registerCachedQueryKeys } from "@src/helpers/MemcachedHelpers.js";
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

const usersDataCachedSchema = z.object({
  datas: z.array(userSafeSchema),
  maxPage: z.number(),
  dataCount: z.number(),
});

const camelized = (val: string) => {
  const valArr = val.split("_");
  for (let i = 1; i < valArr.length; i++) {
    const wordArr = valArr[i].split("");
    wordArr[0] = valArr[i].charAt(0).toUpperCase();
    valArr[i] = wordArr.join("");
  }
  return valArr.join("");
};

const getUsersData: RequestHandler = async (req, res, next) => {
  try {
    // parse queries from request query fields
    const parsedQueries = userQuerySchema.safeParse(req.query);

    // send bad request if invalid query present
    if (!parsedQueries.success)
      return res.status(400).json({
        status: "error",
        message: `invalid query shape detected > ${parsedQueries.error.issues
          .map(issue => `${issue.path.join(",")}:${issue.message}`)
          .join("|")}`,
      } satisfies ErrorResponse);

    // get underscored query value
    const { order_by, ...restQueries } = parsedQueries.data;
    // and turn it into camelCase
    const cameledOrderBy = camelized(order_by);

    // form cache key for caching
    const cacheKey = `user:${restQueries.email ?? ""}:${restQueries.name ?? ""}:${restQueries.role ?? ""}:${order_by}:${
      restQueries.sort
    }:${restQueries.page}:${restQueries.limit}`;

    // check if the same users query already cached
    try {
      const cachedData = await memcached.get<string>(cacheKey);
      // use it and prolong its duration if present
      console.log("getting users from cache");
      const responseData = usersDataCachedSchema.parse(JSON.parse(cachedData.result));
      memcached.touch(cacheKey, cacheDuration.super);
      return res.status(200).json({
        status: "success",
        message: "query success",
        datas: { ...responseData, queries: parsedQueries },
      } satisfies SuccessResponse);
    } catch (e) {
      /* do nothing */
    }

    // get from db if not
    console.log("getting users from db");
    const usersData = await prisma.user.findMany({
      where: {
        email: {
          contains: restQueries.email ?? "",
        },
        name: {
          contains: restQueries.name ?? "",
        },
        role: {
          in: restQueries.role ? [restQueries.role] : ["ADMIN", "USER"],
        },
      },
      select: { id: true, email: true, name: true, role: true },
      orderBy: {
        [cameledOrderBy]: restQueries.sort,
      },
      skip: restQueries.page * restQueries.limit,
      take: restQueries.limit,
    });
    const usersCount = await prisma.user.count({
      where: {
        email: {
          contains: restQueries.email ?? "",
        },
        name: {
          contains: restQueries.name ?? "",
        },
        role: {
          in: restQueries.role ? [restQueries.role] : ["ADMIN", "USER"],
        },
      },
    });
    const maxPage = Math.ceil(usersCount / restQueries.limit) - 1;

    // cache it in case the same query is requested in further request
    memcached
      .set(cacheKey, JSON.stringify({ datas: usersData, maxPage, dataCount: usersCount }), cacheDuration.super)
      .catch(error => logError(`${req.path} > getUsersData handler`, error));
    registerCachedQueryKeys("user", cacheKey);

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: { datas: usersData, maxPage, dataCount: usersCount, queries: parsedQueries },
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
    const cacheKey = `user:${paramId.data.id}`;
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
      .catch(error => logError(`${req.path} > getUserData handler`, error));

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
        message: `request body not valid > ${inputBody.error.issues
          .map(issue => `${issue.path.join(",")}:${issue.message}`)
          .join("|")}`,
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
    invalidateCachedQueries("user");

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

const userUpdateSchema = userSchema.omit({ id: true }).partial();

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
        message: `request body not valid > ${inputBody.error.issues
          .map(issue => `${issue.path.join(",")}:${issue.message}`)
          .join("|")}`,
      } satisfies ErrorResponse);
    }

    // hash password
    const hashedInputPassword = (await scryptPromisified(inputBody.data.password ?? "", PASSWORD_SECRET, 32)).toString(
      "hex"
    );

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
        password: inputBody.data.password ? hashedInputPassword : currentUserData.password,
      },
    });

    // invalidate cached datas and user queries
    invalidateCachedQueries("user");
    // update cached user data with current id
    const cacheKey = `user:${paramId.data.id}`;
    memcached
      .set(cacheKey, JSON.stringify(userSafeNoIDSchema.parse(updateResult)), cacheDuration.short)
      .catch(error => logError(`${req.path} > editUser handler`, error));

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
    const cacheKey = `user:${paramId.data.id}`;
    try {
      const cachedUserData = await memcached.get<string>(cacheKey);
      // use it if present
      console.log("getting from cache");
      inputtedUserData = userSafeNoIDSchema.parse(JSON.parse(cachedUserData.result));
    } catch (e) {
      // get from db if not
      inputtedUserData = await prisma.user.findFirst({
        where: { id: paramId.data.id },
        select: { role: true },
      });
      // send not found if not present in db
      console.log("getting from db");
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
    invalidateCachedQueries("user");

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
  deleteUser,
};
