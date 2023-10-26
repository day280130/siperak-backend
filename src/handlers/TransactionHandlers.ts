import { Prisma } from "@prisma/client";
import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import { ReqHandler, logError, serializeZodIssues, snakeToCamel } from "@src/helpers/HandlerHelpers.js";
import { invalidateCachedQueries, memcached, registerCachedQueryKey } from "@src/helpers/MemcachedHelpers.js";
import { PrismaClientKnownRequestError, prisma } from "@src/helpers/PrismaHelpers.js";
import {
  transactionsCachedQuerySchema,
  transactionQuerySchema,
  transactionSchema,
  TransactionProducts,
  cachedTransactionSchema,
  TransactionQueryOrderBy,
} from "@src/schemas/TransactionSchemas.js";

const parseOrderBy = (orderBy: TransactionQueryOrderBy) => {
  if (orderBy === "customer") return "customer_name";

  return orderBy;
};

const getTransactions: ReqHandler = async (req, res, next) => {
  try {
    const parsedQueries = transactionQuerySchema.safeParse(req.query);
    if (!parsedQueries.success)
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(parsedQueries.error.issues, "invalid query shape"),
      });

    const cacheKey = makeCacheKey(
      queryKeys.transaction,
      ...Object.values(parsedQueries.data).map(query => query.toString())
    );

    const rawCachedData = await memcached.get<string>(cacheKey).catch(() => undefined);
    if (rawCachedData) {
      let cachedData;
      try {
        cachedData = JSON.parse(rawCachedData.result);
      } catch (error) {
        logError(`${req.path} > getTransactions handler`, error, true);
      }
      const parsedCachedData = transactionsCachedQuerySchema.safeParse(cachedData);
      if (parsedCachedData.success) {
        // console.log("getting transactions from cache");
        memcached
          .touch(cacheKey, cacheDuration.super)
          .catch(error => logError(`${req.path} > getTransactions handler`, error.reason ?? error, false));
        return res.status(200).json({
          status: "success",
          message: "query success",
          datas: { ...parsedCachedData.data, queries: parsedQueries.data },
        });
      } else {
        logError(
          `${req.path} > getTransactions handler`,
          serializeZodIssues(parsedCachedData.error.issues, "failed parsing cache"),
          false
        );
      }
    }

    // console.log("getting transactions from db");
    const where: Prisma.TransactionWhereInput = {
      customerName: {
        contains: parsedQueries.data.customer_name ?? "",
      },
      customerNpwpNumber: {
        contains: parsedQueries.data.customer_npwp ?? "",
      },
      total: {
        gte: parsedQueries.data.total_min,
        lte: parsedQueries.data.total_max,
      },
      tax: {
        gte: parsedQueries.data.tax_min,
        lte: parsedQueries.data.tax_max,
      },
      taxInvoiceNumber:
        parsedQueries.data.status === "paid"
          ? { not: null }
          : parsedQueries.data.status === "unpaid"
          ? null
          : undefined,
      createdAt: {
        gte: new Date(parsedQueries.data.created_date_min),
        lte: new Date(parsedQueries.data.created_date_max),
      },
    };

    const parsedOrderBy = parseOrderBy(parsedQueries.data.order_by);

    const transactions = (
      await prisma.transaction.findMany({
        where,
        select: {
          id: true,
          taxInvoiceNumber: true,
          customerName: true,
          customerAddress: true,
          customerNpwpNumber: true,
          products: {
            select: {
              relId: true,
              quantity: true,
              product: { select: { code: true, name: true, price: true } },
            },
          },
          total: true,
          tax: true,
          dpp: true,
          createdAt: true,
        },
        orderBy: { [snakeToCamel(parsedOrderBy)]: parsedQueries.data.sort },
        skip: parsedQueries.data.page * parsedQueries.data.limit,
        take: parsedQueries.data.limit,
      })
    ).map(({ customerName, customerAddress, customerNpwpNumber, ...otherProperties }) => ({
      customer: {
        name: customerName,
        address: customerAddress,
        npwpNumber: customerNpwpNumber,
      },
      ...otherProperties,
    }));
    const transactionsCount = await prisma.transaction.count({ where });
    const maxPage = Math.ceil(transactionsCount / parsedQueries.data.limit) - 1;

    memcached
      .set(
        cacheKey,
        JSON.stringify({
          datas: transactions,
          maxPage,
          dataCount: transactionsCount,
        }),
        cacheDuration.super
      )
      .catch(error => logError(`${req.path} > getTransactions handler`, error.reason ?? error, false));
    registerCachedQueryKey(queryKeys.transaction, cacheKey);

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: { datas: transactions, maxPage, dataCount: transactionsCount, queries: parsedQueries.data },
    });
  } catch (error) {
    next(error);
  }
};

const getTransaction: ReqHandler = async (req, res, next) => {
  try {
    const paramId = transactionSchema.pick({ id: true }).safeParse(req.params);
    if (!paramId.success)
      return res.status(400).json({
        status: "error",
        message: "no valid transaction id supplied",
      });

    const cacheKey = makeCacheKey(queryKeys.transaction, paramId.data.id);
    const rawCachedTransactionData = await memcached.get<string>(cacheKey).catch(() => undefined);
    if (rawCachedTransactionData) {
      let cachedTransactionData;
      try {
        cachedTransactionData = JSON.parse(rawCachedTransactionData.result);
      } catch (error) {
        logError(`${req.path} > getTransaction handler`, error, true);
      }
      const parsedCachedTransactionData = cachedTransactionSchema.safeParse(cachedTransactionData);
      if (parsedCachedTransactionData.success) {
        console.log("getting from cache");
        memcached
          .touch(cacheKey, cacheDuration.short)
          .catch(error => logError(`${req.path} > getTransaction handler`, error.reason ?? error, false));
        return res.status(200).json({
          status: "success",
          message: "transaction found",
          datas: parsedCachedTransactionData.data,
        });
      } else {
        logError(
          `${req.path} > getTransaction handler`,
          serializeZodIssues(parsedCachedTransactionData.error.issues, "failed parsing cache"),
          false
        );
      }
    }

    const transaction = await prisma.transaction.findFirst({
      where: { id: paramId.data.id },
      include: {
        products: {
          select: {
            relId: true,
            quantity: true,
            product: { select: { name: true, code: true, price: true } },
          },
        },
      },
    });

    if (!transaction)
      return res.status(404).json({
        status: "error",
        message: "transaction with supplied id not found",
      });

    const { customerAddress, customerName, customerNpwpNumber, ...otherTransactionProperties } = transaction;

    const formattedTransaction = {
      ...otherTransactionProperties,
      customer: {
        name: customerName,
        npwpNumber: customerNpwpNumber,
        address: customerAddress,
      },
    };

    memcached
      .set(cacheKey, JSON.stringify(formattedTransaction), cacheDuration.short)
      .catch(error => logError(`${req.path} > getTransaction handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "transaction found",
      datas: formattedTransaction,
    });
  } catch (error) {
    next(error);
  }
};

type CountSumsResult =
  | {
      success: true;
      result: { total: number; tax: number; dpp: number };
    }
  | {
      success: false;
      error: Error;
    };

const countSums = async (products?: TransactionProducts): Promise<CountSumsResult> => {
  if (!products) return { success: true, result: { total: 0, tax: 0, dpp: 0 } };
  try {
    const inputProductCodes = products.map(entry => entry.product.code);
    const productsData = await prisma.product.findMany({ where: { code: { in: inputProductCodes } } });
    const validProductCodes = productsData.map(product => product.code);
    if (inputProductCodes.findIndex(code => !validProductCodes.includes(code)) !== -1)
      throw new Error("one or more of supplied product code does not exist in database");
    const productsCodeOnPrice: Record<string, number> = productsData.reduce(
      (result, current) => ({ ...result, [current.code]: current.price }),
      {}
    );
    const total = products.reduce(
      (sum, current) => (sum += current.quantity * productsCodeOnPrice[current.product.code]),
      0
    );
    const tax = Math.ceil((11 / 111) * total);
    const dpp = Math.floor((100 / 111) * total);
    return { success: true, result: { total, tax, dpp } };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
    };
  }
};

const transactionCreateSchema = transactionSchema.pick({
  taxInvoiceNumber: true,
  customer: true,
  products: true,
});

const createTransaction: ReqHandler = async (req, res, next) => {
  try {
    const inputBody = transactionCreateSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      });
    }

    const sums = await countSums(inputBody.data.products);
    if (!sums.success) {
      return res.status(400).json({
        status: "error",
        message: sums.error?.message ?? "products not valid for unknown reason",
      });
    }

    const insertResult = await prisma.transaction.create({
      data: {
        taxInvoiceNumber: inputBody.data.taxInvoiceNumber,
        customerName: inputBody.data.customer.name,
        customerAddress: inputBody.data.customer.address,
        customerNpwpNumber: inputBody.data.customer.npwpNumber,
        ...sums.result,
        products: {
          create: inputBody.data.products.map(entry => ({
            relId: entry.relId,
            quantity: entry.quantity,
            productCode: entry.product.code,
          })),
        },
      },
      include: {
        products: {
          select: {
            relId: true,
            quantity: true,
            product: { select: { code: true, name: true, price: true } },
          },
        },
      },
    });

    await invalidateCachedQueries(queryKeys.transaction);

    // const safeInsertResult = transactionSchema.parse(insertResult);
    const { customerAddress, customerName, customerNpwpNumber, ...otherResultProperties } = insertResult;
    return res.status(201).json({
      status: "success",
      message: "transaction saved",
      datas: {
        customer: {
          name: customerName,
          address: customerAddress,
          npwpNumber: customerNpwpNumber,
        },
        ...otherResultProperties,
      },
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2003") {
      // console.log(error);
      if (error.meta?.field_name === "product_code") {
        return res.status(409).json({
          status: "error",
          message: "product(s) with presented code don't exist in the database",
        });
      }
    }
    next(error);
  }
};

const transactionUpdateSchema = transactionSchema
  .pick({
    taxInvoiceNumber: true,
    customer: true,
    products: true,
  })
  .partial();

const editTransaction: ReqHandler = async (req, res, next) => {
  try {
    const paramId = transactionSchema.pick({ id: true }).safeParse(req.params);
    if (!paramId.success)
      return res.status(400).json({
        status: "error",
        message: "no valid transaction id supplied",
      });

    const inputBody = transactionUpdateSchema.safeParse(req.body);
    if (!inputBody.success)
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      });

    const currentTransaction = await prisma.transaction.findFirst({
      where: { id: paramId.data.id },
      select: { id: true, products: true },
    });

    if (!currentTransaction)
      return res.status(404).json({
        status: "error",
        message: "transaction with supplied id not found",
      });

    const inputProductsRelIds = inputBody.data.products?.map(entry => entry.relId);

    const deletedProducts = currentTransaction?.products.filter(entry => !inputProductsRelIds?.includes(entry.relId));

    const newSums = await countSums(inputBody.data.products);
    if (!newSums.success) {
      return res.status(400).json({
        status: "error",
        message: newSums.error?.message ?? "products not valid for unknown reason",
      });
    }

    const updateResult = await prisma.transaction.update({
      where: { id: paramId.data.id },
      data: {
        taxInvoiceNumber: inputBody.data.taxInvoiceNumber,
        customerName: inputBody.data.customer?.name,
        customerAddress: inputBody.data.customer?.address,
        customerNpwpNumber: inputBody.data.customer?.npwpNumber,
        ...newSums.result,
        products: {
          deleteMany: {
            relId: {
              in: deletedProducts.map(entry => entry.relId),
            },
          },
          upsert: inputBody.data.products?.map(entry => ({
            where: { relId: entry.relId },
            update: {
              quantity: entry.quantity,
              productCode: entry.product.code,
            },
            create: {
              relId: entry.relId,
              quantity: entry.quantity,
              productCode: entry.product.code,
            },
          })),
        },
      },
      include: {
        products: {
          select: {
            relId: true,
            quantity: true,
            product: { select: { code: true, name: true, price: true } },
          },
        },
      },
    });

    const { customerAddress, customerName, customerNpwpNumber, ...otherResultProperties } = updateResult;
    const formattedResult = {
      ...otherResultProperties,
      customer: {
        name: customerName,
        address: customerAddress,
        npwpNumber: customerNpwpNumber,
      },
    };

    await invalidateCachedQueries(queryKeys.transaction);

    const cacheKey = makeCacheKey(queryKeys.transaction, paramId.data.id);
    memcached
      .set(cacheKey, JSON.stringify(formattedResult), cacheDuration.short)
      .catch(error => logError(`${req.path} > editTransaction handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "transaction updated",
      datas: formattedResult,
    });
  } catch (error) {
    next(error);
  }
};

const deleteTransaction: ReqHandler = async (req, res, next) => {
  try {
    const paramId = transactionSchema.pick({ id: true }).safeParse(req.params);
    if (!paramId.success) {
      return res.status(400).json({
        status: "error",
        message: "no valid transaction id supplied",
      });
    }

    await prisma.transaction.delete({ where: { id: paramId.data.id } });

    await invalidateCachedQueries(queryKeys.transaction);

    const cacheKey = makeCacheKey(queryKeys.transaction, paramId.data.id);
    memcached
      .del(cacheKey)
      .catch(error => logError(`${req.path} > deleteTransaction handler`, error.reason ?? error, false));

    return res.status(200).json({
      status: "success",
      message: "transaction deleted",
    });
  } catch (error) {
    next(error);
  }
};

export const transactionsHandlers = {
  getTransactions,
  getTransaction,
  createTransaction,
  editTransaction,
  deleteTransaction,
};
