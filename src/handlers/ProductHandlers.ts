import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import {
  ErrorResponse,
  SuccessResponse,
  camelized,
  logError,
  serializeZodIssues,
} from "@src/helpers/HandlerHelpers.js";
import { invalidateCachedQueries, memcached, registerCachedQueryKey } from "@src/helpers/MemcachedHelpers.js";
import { PrismaClientKnownRequestError, prisma } from "@src/helpers/PrismaHelpers.js";
import { productSchema } from "@src/schemas/ProductSchema.js";
import { RequestHandler } from "express";
import { z } from "zod";

const productQuerySchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  price_min: z.coerce
    .number()
    .gte(0)
    .lte(Number.MAX_SAFE_INTEGER - 1)
    .default(0),
  price_max: z.coerce.number().gte(1).lte(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER),
  order_by: z.enum(["code", "name", "price", "created_at"]).default("created_at"),
  sort: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().gte(0).default(0),
  limit: z.coerce.number().gte(1).default(2),
});

const productsCachedQuerySchema = z.object({
  datas: z.array(productSchema),
  maxPage: z.number(),
  dataCount: z.number(),
});

const getProducts: RequestHandler = async (req, res, next) => {
  try {
    const parsedQueries = productQuerySchema.safeParse(req.query);
    if (!parsedQueries.success)
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(parsedQueries.error.issues, "invalid query shape"),
      } satisfies ErrorResponse);
    const { order_by, ...restQueries } = parsedQueries.data;
    const cameledOrderBy = camelized(order_by);
    const cacheKey = makeCacheKey(
      queryKeys.product,
      `${restQueries.code ?? ""}:${restQueries.name ?? ""}:${restQueries.price_min ?? ""}:${
        restQueries.price_max ?? ""
      }:${order_by}:${restQueries.sort}:${restQueries.page}:${restQueries.limit}`
    );

    try {
      const cachedData = await memcached.get<string>(cacheKey);
      console.log("getting products from cache");
      const responseData = productsCachedQuerySchema.parse(JSON.parse(cachedData.result));
      memcached.touch(cacheKey, cacheDuration.super);
      return res.status(200).json({
        status: "success",
        message: "query success",
        datas: { ...responseData, queries: parsedQueries },
      } satisfies SuccessResponse);
    } catch (e) {
      /* do nothing */
    }

    console.log("getting products from db");
    const products = await prisma.product.findMany({
      where: {
        code: {
          contains: restQueries.code ?? "",
        },
        name: {
          contains: restQueries.name ?? "",
        },
        price: {
          gte: restQueries.price_min,
          lte: restQueries.price_max,
        },
      },
      select: { code: true, name: true, price: true },
      orderBy: { [cameledOrderBy]: restQueries.sort },
      skip: restQueries.page * restQueries.limit,
      take: restQueries.limit,
    });
    const productsCount = await prisma.product.count({
      where: {
        code: {
          contains: restQueries.code ?? "",
        },
        name: {
          contains: restQueries.name ?? "",
        },
        price: {
          gte: restQueries.price_min,
          lte: restQueries.price_max,
        },
      },
    });
    const maxPage = Math.ceil(productsCount / restQueries.limit) - 1;

    memcached
      .set(cacheKey, JSON.stringify({ datas: products, maxPage, dataCount: productsCount }), cacheDuration.super)
      .catch(error => logError(`${req.path} > getProducts handler`, error.reason ?? error, false));
    registerCachedQueryKey(queryKeys.product, cacheKey);

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: { datas: products, maxPage, dataCount: productsCount, queries: parsedQueries.data },
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const getProduct: RequestHandler = async (req, res, next) => {
  try {
    const paramCode = productSchema.pick({ code: true }).safeParse(req.params);
    if (!paramCode.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid product code supplied",
      } satisfies ErrorResponse);
    }

    // const cacheKey = `product:${paramCode.data.code}`;
    const cacheKey = makeCacheKey(queryKeys.product, paramCode.data.code);
    try {
      const cachedUserData = await memcached.get<string>(cacheKey);
      // console.log("getting from cache");
      const product = productSchema.parse(JSON.parse(cachedUserData.result));
      memcached.touch(cacheKey, cacheDuration.short);
      return res.status(200).json({
        status: "success",
        message: "product found",
        datas: product,
      } satisfies SuccessResponse);
    } catch (e) {
      /* do nothing */
    }

    const product = await prisma.product.findFirst({
      where: { code: paramCode.data.code },
      select: { name: true, code: true, price: true },
    });

    if (!product) {
      return res.status(404).json({
        status: "error",
        message: "product with supplied code not found",
      } satisfies ErrorResponse);
    }

    memcached
      .set(cacheKey, JSON.stringify(product), cacheDuration.short)
      .catch(error => logError(`${req.path} > getProduct handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "product found",
      datas: product,
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const createProduct: RequestHandler = async (req, res, next) => {
  try {
    const inputBody = productSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      } satisfies ErrorResponse);
    }

    const insertResult = await prisma.product.create({
      data: inputBody.data,
    });

    await invalidateCachedQueries(queryKeys.product);

    const safeInsertResult = productSchema.parse(insertResult);
    return res.status(201).json({
      status: "success",
      message: "product created",
      datas: safeInsertResult,
    } satisfies SuccessResponse);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      if (error.meta?.target === "PRIMARY") {
        return res.status(409).json({
          status: "error",
          message: "other product with presented code already exist in the database",
        } satisfies ErrorResponse);
      }
    }
    next(error);
  }
};

const productUpdateSchema = productSchema.omit({ code: true }).partial();

const editProduct: RequestHandler = async (req, res, next) => {
  try {
    const paramCode = productSchema.pick({ code: true }).safeParse(req.params);
    if (!paramCode.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid product code supplied",
      } satisfies ErrorResponse);
    }

    const inputBody = productUpdateSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      } satisfies ErrorResponse);
    }

    const updateResult = await prisma.product.update({
      where: { code: paramCode.data.code },
      data: inputBody.data,
    });

    await invalidateCachedQueries(queryKeys.product);

    // const cacheKey = `product:${paramCode.data.code}`;
    const cacheKey = makeCacheKey(queryKeys.product, paramCode.data.code);
    memcached
      .set(cacheKey, JSON.stringify(productSchema.parse(updateResult)), cacheDuration.short)
      .catch(error => logError(`${req.path} > editProduct handler`, error.reason ?? error, false));

    const safeUpdateResult = productSchema.parse(updateResult);
    return res.status(200).json({
      status: "success",
      message: "product updated",
      datas: safeUpdateResult,
    } satisfies SuccessResponse);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({
        status: "error",
        message: "product with supplied code not found",
      } satisfies ErrorResponse);
    }
    next(error);
  }
};

const deleteProduct: RequestHandler = async (req, res, next) => {
  try {
    const paramCode = productSchema.pick({ code: true }).safeParse(req.params);
    if (!paramCode.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid product code supplied",
      } satisfies ErrorResponse);
    }

    await prisma.product.delete({ where: { code: paramCode.data.code } });

    await invalidateCachedQueries(queryKeys.product);

    const cacheKey = makeCacheKey(queryKeys.product, paramCode.data.code);
    memcached
      .del(cacheKey)
      .catch(error => logError(`${req.path} > deleteProduct handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "product deleted",
    } satisfies SuccessResponse);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({
        status: "error",
        message: "product with supplied code not found",
      } satisfies ErrorResponse);
    }
    next(error);
  }
};

export const productHandlers = {
  getProducts,
  getProduct,
  createProduct,
  editProduct,
  deleteProduct,
};
