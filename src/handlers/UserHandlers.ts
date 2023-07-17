import { cacheDuration } from "@src/configs/MemcachedConfigs.js";
import { ErrorResponse, SuccessResponse, logError } from "@src/helpers/HandlerHelpers.js";
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
  orderBy: z.enum(["name", "email", "role", "created_at"]).default("created_at"),
  sort: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().gte(0).default(0),
  limit: z.coerce.number().gte(1).lte(50).default(2),
});

const usersDataCachedSchema = z.object({
  usersData: z.array(userSafeSchema),
  maxPage: z.number(),
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
        message: "invalid query shape detected",
        errors: parsedQueries.error.issues,
      } satisfies ErrorResponse);

    // get underscored query value
    const { orderBy, ...restQueries } = parsedQueries.data;
    // and turn it into camelCase
    const cameledOrderBy = camelized(orderBy);

    // form cache key for caching
    const cacheKey = `user:${JSON.stringify({ orderBy: cameledOrderBy, ...restQueries })}`;
    // check if the same user query already cached
    try {
      const cachedData = await memcached.get<string>(cacheKey);
      // use it and prolong its duration if present
      // console.log("getting from cache");
      const responseData = usersDataCachedSchema.parse(JSON.parse(cachedData.result));
      memcached.touch(cacheKey, cacheDuration.super);
      return res.status(200).json({
        status: "success",
        message: "query success",
        datas: { ...responseData, queries: { cameledOrderBy, restQueries } },
      } satisfies SuccessResponse);
    } catch (e) {
      /* do nothing */
    }

    // get from db if not
    // console.log("getting from db");
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
      .set(cacheKey, JSON.stringify({ usersData, maxPage }), cacheDuration.super)
      .catch(error => logError(`${req.path} > getUsersData handler`, error));
    registerCachedQueryKeys("user", cacheKey);

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: { usersData, maxPage, queries: { cameledOrderBy, restQueries } },
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const getUserData: RequestHandler = async (req, res, next) => {
  try {
    // parse id from request param
    const inputSchema = userSafeSchema.pick({ id: true });
    const parsedParams = inputSchema.safeParse(req.params);

    // send bad request if no valid params supplied
    if (!parsedParams.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid id provided",
      } satisfies ErrorResponse);
    }

    // check if requested user data present in cache
    const cacheKey = `user:${parsedParams.data.id}`;
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
      where: {
        id: parsedParams.data.id,
      },
    });

    // send not found if not present in db
    if (!userData) {
      return res.status(404).json({
        status: "error",
        message: "user with given id not found",
      } satisfies ErrorResponse);
    }

    // use and cache it if present
    const safeUserData = userSafeNoIDSchema.parse(userData);
    memcached
      .set(cacheKey, JSON.stringify(safeUserData), cacheDuration.short)
      .catch(error => logError(`${req.path} > getUserData handler`, error));

    return res.status(200).json({
      status: "success",
      message: "user found",
      datas: safeUserData,
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const userInputSchema = userSchema.omit({ id: true, role: true });

const createUser: RequestHandler = async (req, res, next) => {
  try {
    // parse request body
    const parsedBody = userInputSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: "error",
        message: "request body not valid",
        errors: parsedBody.error.issues,
      } satisfies ErrorResponse);
    }
    const { email, name, password } = parsedBody.data;

    // hash password
    const hashedPassword = (await scryptPromisified(password, PASSWORD_SECRET, 32)).toString("hex");

    // insert user to database
    const insertResult = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    // invalidate cached datas of user queries
    invalidateCachedQueries("user");

    // send created user and access token via response payload
    const safeUserData = userSafeSchema.parse(insertResult);
    return res.status(201).json({
      status: "success",
      message: "user created",
      datas: safeUserData,
    } satisfies SuccessResponse);
  } catch (error) {
    // catch unique email (duplication) violation
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      if (error.meta?.target === "user_email_key") {
        return res.status(400).json({
          status: "error",
          message: "account with presented email already exist in the database",
        } satisfies ErrorResponse);
      }
    }

    // pass internal error to global error handler
    return next(error);
  }
};

export const userHandlers = {
  getUsersData,
  getUserData,
  createUser,
};
