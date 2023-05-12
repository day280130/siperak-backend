import { userHandlers } from '@src/handlers/UserHandlers.js';
import { checkAccessToken } from '@src/middlewares/TokenMiddlewares.js';
import { Router } from 'express';

export const userRouters = Router();

const BASE_ROUTE = '/users';
userRouters.get(`${BASE_ROUTE}/:id`, checkAccessToken, userHandlers.getUserData);
