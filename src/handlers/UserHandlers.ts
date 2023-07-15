import { cacheDuration } from "@src/configs/MemcachedConfigs.js";
import { ErrorResponse, SuccessResponse } from "@src/helpers/HandlerHelpers.js";
import { memcached } from "@src/helpers/MemcachedHelpers.js";
import { prisma } from "@src/helpers/PrismaHelpers.js";
import { UserSafeNoIDData, userSafeNoIDSchema, userSchema } from "@src/schemas/UserSchema.js";
import { RequestHandler } from "express";

const getUserData: RequestHandler = async (req, res, next) => {
  try {
    // parse id from request param
    const inputSchema = userSchema.pick({ id: true });
    const parsedParams = inputSchema.safeParse(req.params);

    // send bad request if no valid params supplied
    if (!parsedParams.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid id provided",
      } satisfies ErrorResponse);
    }

    // check if requested user data present in cache
    let safeUserData: UserSafeNoIDData;
    const cacheKey = `user:${parsedParams.data.id}`;
    const cachedUserData = await memcached.get<string>(cacheKey);

    if (cachedUserData.message === "cache hit") {
      // use it and prolong its cache time if present
      safeUserData = userSafeNoIDSchema.parse(JSON.parse(cachedUserData.result));
      memcached.touch(cacheKey, cacheDuration.short);
    } else {
      // get it from db if not
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
      safeUserData = userSafeNoIDSchema.parse(userData);
      memcached.set(cacheKey, JSON.stringify(safeUserData), cacheDuration.short);
    }

    return res.status(200).json({
      status: "success",
      message: "user found",
      datas: [safeUserData],
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

export const userHandlers = {
  getUserData,
};
