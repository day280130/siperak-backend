import { todoHandlers } from '@src/handlers/TodoHandlers.js';
import { Router } from 'express';

export const todoRouters = Router();

const BASE_ROUTE = '/todo';
todoRouters.get(BASE_ROUTE, todoHandlers.getAll);
todoRouters.post(BASE_ROUTE, todoHandlers.post);
