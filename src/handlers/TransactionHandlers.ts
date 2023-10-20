import { Prisma } from "@prisma/client";
import { cacheDuration, makeCacheKey, queryKeys } from "@src/configs/MemcachedConfigs.js";
import { ReqHandler, logError, serializeZodIssues, snakeToCamel } from "@src/helpers/HandlerHelpers.js";
import { memcached, registerCachedQueryKey } from "@src/helpers/MemcachedHelpers.js";
import { prisma } from "@src/helpers/PrismaHelpers.js";
import { transactionCachedQuerySchema, transactionQuerySchema } from "@src/schemas/TransactionSchemas.js";

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
      const parsedCachedData = transactionCachedQuerySchema.safeParse(cachedData);
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

export const transactionsHandlers = {
  getTransactions,
};
