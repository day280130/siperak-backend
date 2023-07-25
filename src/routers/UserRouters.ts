import { userHandlers } from "@src/handlers/UserHandlers.js";
import { checkAdmin } from "@src/middlewares/AuthorityMiddlewares.js";
import { checkAccessToken } from "@src/middlewares/TokenMiddlewares.js";
import { Router } from "express";

export const userRouters = Router();

const BASE_ROUTE = "/users";
userRouters.get(`${BASE_ROUTE}`, checkAccessToken, checkAdmin, userHandlers.getUsersData);
userRouters.get(`${BASE_ROUTE}/:id`, checkAccessToken, userHandlers.getUserData);
userRouters.post(`${BASE_ROUTE}`, checkAccessToken, checkAdmin, userHandlers.createUser);
userRouters.put(`${BASE_ROUTE}/:id`, checkAccessToken, userHandlers.editUser);
userRouters.put(`${BASE_ROUTE}/:id/password`, checkAccessToken, userHandlers.editUserPassword);
userRouters.delete(`${BASE_ROUTE}/:id`, checkAccessToken, checkAdmin, userHandlers.deleteUser);
