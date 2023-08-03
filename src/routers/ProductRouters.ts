import { productHandlers } from "@src/handlers/ProductHandlers.js";
import { checkAccessToken } from "@src/middlewares/TokenMiddlewares.js";
import { Router } from "express";

export const productRouters = Router();

const BASE_ROUTE = "/products";
productRouters.get(`${BASE_ROUTE}`, checkAccessToken, productHandlers.getProducts);
