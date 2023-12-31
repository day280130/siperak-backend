import { transactionsHandlers } from "@src/handlers/TransactionHandlers.js";
import { checkAccessToken } from "@src/middlewares/TokenMiddlewares.js";
import { Router } from "express";

export const transactionRouters = Router();

const BASE_ROUTE = "/transactions";
transactionRouters.get(`${BASE_ROUTE}`, checkAccessToken, transactionsHandlers.getTransactions);
transactionRouters.get(`${BASE_ROUTE}/:id`, checkAccessToken, transactionsHandlers.getTransaction);
transactionRouters.post(`${BASE_ROUTE}`, checkAccessToken, transactionsHandlers.createTransaction);
transactionRouters.put(`${BASE_ROUTE}/:id`, checkAccessToken, transactionsHandlers.editTransaction);
transactionRouters.delete(`${BASE_ROUTE}/:id`, checkAccessToken, transactionsHandlers.deleteTransaction);
