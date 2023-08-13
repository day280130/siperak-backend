import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import { ErrorResponse, SuccessResponse, logError, serializeZodIssues } from "@src/helpers/HandlerHelpers.js";
import { invalidateCachedQueries, memcached } from "@src/helpers/MemcachedHelpers.js";
import { PrismaClientKnownRequestError, prisma } from "@src/helpers/PrismaHelpers.js";
import { productSchema } from "@src/schemas/ProductSchema.js";
import { RequestHandler } from "express";

const getProducts: RequestHandler = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany();

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: products,
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
