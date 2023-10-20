import { transactionsHandlers } from "@src/handlers/TransactionHandlers.js";
import { checkAccessToken } from "@src/middlewares/TokenMiddlewares.js";
import { Router } from "express";

export const transactionRouters = Router();

const BASE_ROUTE = "/transactions";
transactionRouters.get(`${BASE_ROUTE}`, checkAccessToken, transactionsHandlers.getTransactions);