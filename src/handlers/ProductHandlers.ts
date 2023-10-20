import { Prisma } from "@prisma/client";
import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import { snakeToCamel, logError, serializeZodIssues, ReqHandler } from "@src/helpers/HandlerHelpers.js";
import { invalidateCachedQueries, memcached, registerCachedQueryKey } from "@src/helpers/MemcachedHelpers.js";
import { PrismaClientKnownRequestError, prisma } from "@src/helpers/PrismaHelpers.js";
import { productSchema, productQuerySchema, productsCachedQuerySchema } from "@src/schemas/ProductSchemas.js";

const getProducts: ReqHandler = async (req, res, next) => {
  try {
    const parsedQueries = productQuerySchema.safeParse(req.query);
    if (!parsedQueries.success)
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(parsedQueries.error.issues, "invalid query shape"),
      });

    const cacheKey = makeCacheKey(
      queryKeys.product,
      ...Object.values(parsedQueries.data).map(query => query.toString())
    );

    const rawCachedData = await memcached.get<string>(cacheKey).catch(() => undefined);
    if (rawCachedData) {
      let cachedData;
      try {
        cachedData = JSON.parse(rawCachedData.result);
      } catch (error) {
        logError(`${req.path} > getProducts handler`, error, true);
      }
      // console.log("getting products from cache");
      const parsedCachedData = productsCachedQuerySchema.safeParse(cachedData);
      if (parsedCachedData.success) {
        memcached
          .touch(cacheKey, cacheDuration.super)
          .catch(error => logError(`${req.path} > getProducts handler`, error.reason ?? error, false));
        return res.status(200).json({
          status: "success",
          message: "query success",
          datas: { ...parsedCachedData.data, queries: parsedQueries.data },
        });
      }
    }

    // console.log("getting products from db");
    const where: Prisma.ProductWhereInput = {
      code: {
        contains: parsedQueries.data.code ?? "",
      },
      name: {
        contains: parsedQueries.data.name ?? "",
      },
      price: {
        gte: parsedQueries.data.price_min,
        lte: parsedQueries.data.price_max,
      },
    };
    const products = await prisma.product.findMany({
      where,
      select: { code: true, name: true, price: true },
      orderBy: { [snakeToCamel(parsedQueries.data.order_by)]: parsedQueries.data.sort },
      skip: parsedQueries.data.page * parsedQueries.data.limit,
      take: parsedQueries.data.limit,
    });
    const productsCount = await prisma.product.count({ where });
    const maxPage = Math.ceil(productsCount / parsedQueries.data.limit) - 1;

    memcached
      .set(cacheKey, JSON.stringify({ datas: products, maxPage, dataCount: productsCount }), cacheDuration.super)
      .catch(error => logError(`${req.path} > getProducts handler`, error.reason ?? error, false));
    registerCachedQueryKey(queryKeys.product, cacheKey);

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: { datas: products, maxPage, dataCount: productsCount, queries: parsedQueries.data },
    });
  } catch (error) {
    next(error);
  }
};

const getProduct: ReqHandler = async (req, res, next) => {
  try {
    const paramCode = productSchema.pick({ code: true }).safeParse(req.params);
    if (!paramCode.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid product code supplied",
      });
    }

    const cacheKey = makeCacheKey(queryKeys.product, paramCode.data.code);
    const rawCachedProductData = await memcached.get<string>(cacheKey).catch(() => undefined);
    if (rawCachedProductData) {
      let cachedProductData;
      try {
        cachedProductData = JSON.parse(rawCachedProductData.result);
      } catch (error) {
        logError(`${req.path} > getProduct handler`, error, true);
      }
      // console.log("getting from cache");
      const parsedCachedProductData = productSchema.safeParse(cachedProductData);
      if (parsedCachedProductData.success) {
        memcached
          .touch(cacheKey, cacheDuration.short)
          .catch(error => logError(`${req.path} > getProduct handler`, error.reason ?? error, false));
        return res.status(200).json({
          status: "success",
          message: "product found",
          datas: parsedCachedProductData.data,
        });
      }
    }

    const product = await prisma.product.findFirst({
      where: { code: paramCode.data.code },
      select: { name: true, code: true, price: true },
    });

    if (!product) {
      return res.status(404).json({
        status: "error",
        message: "product with supplied code not found",
      });
    }

    memcached
      .set(cacheKey, JSON.stringify(product), cacheDuration.short)
      .catch(error => logError(`${req.path} > getProduct handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "product found",
      datas: product,
    });
  } catch (error) {
    next(error);
  }
};

const createProduct: ReqHandler = async (req, res, next) => {
  try {
    const inputBody = productSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      });
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
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      if (error.meta?.target === "PRIMARY") {
        return res.status(409).json({
          status: "error",
          message: "other product with presented code already exist in the database",
        });
      }
    }
    next(error);
  }
};

const productUpdateSchema = productSchema.omit({ code: true }).partial();

const editProduct: ReqHandler = async (req, res, next) => {
  try {
    const paramCode = productSchema.pick({ code: true }).safeParse(req.params);
    if (!paramCode.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid product code supplied",
      });
    }

    const inputBody = productUpdateSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      });
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
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({
        status: "error",
        message: "product with supplied code not found",
      });
    }
    next(error);
  }
};

const deleteProduct: ReqHandler = async (req, res, next) => {
  try {
    const paramCode = productSchema.pick({ code: true }).safeParse(req.params);
    if (!paramCode.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid product code supplied",
      });
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
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
      return res.status(404).json({
        status: "error",
        message: "product with supplied code not found",
      });
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
