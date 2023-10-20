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
} from "@src/schemas/TransactionSchemas.js";

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
        console.log("getting transactions from cache");
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

    console.log("getting transactions from db");
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
      createdAt: {
        gte: new Date(parsedQueries.data.created_date_min),
        lte: new Date(parsedQueries.data.created_date_max),
      },
    };
    const transactions = (
      await prisma.transaction.findMany({
        where,
        select: {
          id: true,
          taxInvoiceNumber: true,
          customerName: true,
          customerAddress: true,
          customerNpwpNumber: true,
          total: true,
          tax: true,
          dpp: true,
          createdAt: true,
        },
        orderBy: { [snakeToCamel(parsedQueries.data.order_by)]: parsedQueries.data.sort },
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

const countSums = (products: TransactionProducts) => {
  const total = products.reduce((sum, current) => (sum += current.quantity * current.product.price), 0);
  const tax = Math.ceil((11 / 111) * total);
  const dpp = Math.floor((100 / 111) * total);
  return { total, tax, dpp };
};

const createTransaction: ReqHandler = async (req, res, next) => {
  try {
    const inputBody = transactionSchema
      .omit({
        id: true,
        createdAt: true,
        total: true,
        tax: true,
        dpp: true,
      })
      .safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      });
    }

    const insertResult = await prisma.transaction.create({
      data: {
        taxInvoiceNumber: inputBody.data.taxInvoiceNumber,
        customerName: inputBody.data.customer.name,
        customerAddress: inputBody.data.customer.address,
        customerNpwpNumber: inputBody.data.customer.npwpNumber,
        ...countSums(inputBody.data.products),
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
      console.log(error);
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
  createTransaction,
  deleteTransaction,
};
