import { productHandlers } from "@src/handlers/ProductHandlers.js";
import { checkAccessToken } from "@src/middlewares/TokenMiddlewares.js";
import { Router } from "express";

export const productRouters = Router();

const BASE_ROUTE = "/products";
productRouters.get(`${BASE_ROUTE}`, checkAccessToken, productHandlers.getProducts);
productRouters.get(`${BASE_ROUTE}/:code`, checkAccessToken, productHandlers.getProduct);
productRouters.post(`${BASE_ROUTE}`, checkAccessToken, productHandlers.createProduct);
productRouters.put(`${BASE_ROUTE}/:code`, checkAccessToken, productHandlers.editProduct);
productRouters.delete(`${BASE_ROUTE}/:code`, checkAccessToken, productHandlers.deleteProduct);
