import { userHandlers } from '@src/handlers/UserHandlers.js';
import { checkAccessToken } from '@src/middlewares/AccessTokenMiddleware.js';
import { checkAuthorizedCsrfToken } from '@src/middlewares/CsrfMiddlewares.js';
import { Router } from 'express';

export const userRouters = Router();

const BASE_ROUTE = '/user';
userRouters.get(`${BASE_ROUTE}/:id`, checkAuthorizedCsrfToken, checkAccessToken, userHandlers.getUser);
