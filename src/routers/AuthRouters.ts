import { authHandlers } from "@src/handlers/AuthHandlers.js";
import { checkAccessToken, checkRefreshToken } from "@src/middlewares/TokenMiddlewares.js";
import { Router } from "express";

export const authRouters = Router();

const BASE_ROUTE = "/auth";
authRouters.post(`${BASE_ROUTE}/login`, authHandlers.login);
// authRouters.post(`${BASE_ROUTE}/register`, authHandlers.register);
authRouters.post(`${BASE_ROUTE}/refresh`, checkRefreshToken, authHandlers.refresh);
authRouters.post(`${BASE_ROUTE}/logout`, authHandlers.logout);
authRouters.post(`${BASE_ROUTE}/logout/force`, authHandlers.forceLogout);

// testing purpose only
authRouters.get(`${BASE_ROUTE}/check`, checkAccessToken, checkRefreshToken, authHandlers.checkSession);
