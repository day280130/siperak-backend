import { authHandlers } from '@src/handlers/AuthHandlers.js';
import { checkAccessToken } from '@src/middlewares/AccessTokenMiddleware.js';
import { Router } from 'express';

export const authRouters = Router();

const BASE_ROUTE = '/auth';
authRouters.post(`${BASE_ROUTE}/login`, authHandlers.login);
authRouters.post(`${BASE_ROUTE}/register`, authHandlers.register);
authRouters.post(`${BASE_ROUTE}/refresh`, authHandlers.refresh);
// authRouters.post(`${BASE_ROUTE}/logout`, authHandlers.logout);

// testing purpose only
authRouters.get(`${BASE_ROUTE}/check`, checkAccessToken, authHandlers.checkSession);
