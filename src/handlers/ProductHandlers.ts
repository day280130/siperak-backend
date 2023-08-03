import { ErrorResponse, SuccessResponse, serializeZodIssues } from "@src/helpers/HandlerHelpers.js";
import { PrismaClientKnownRequestError, prisma } from "@src/helpers/PrismaHelpers.js";
import { productSchema } from "@src/schemas/ProductSchema.js";
import { RequestHandler } from "express";

const getProducts: RequestHandler = async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany();

    return res.status(200).json({
      status: "success",
      message: "query success",
      datas: products,
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const createProduct: RequestHandler = async (req, res, next) => {
  try {
    const inputBody = productSchema.safeParse(req.body);
    if (!inputBody.success) {
      return res.status(400).json({
        status: "error",
        message: serializeZodIssues(inputBody.error.issues, "request body not valid"),
      } satisfies ErrorResponse);
    }

    const insertResult = await prisma.product.create({
      data: inputBody.data,
    });

    const safeInsertResult = productSchema.parse(insertResult);
    return res.status(201).json({
      status: "success",
      message: "product created",
      datas: safeInsertResult,
    } satisfies SuccessResponse);
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      if (error.meta?.target === "PRIMARY") {
        return res.status(409).json({
          status: "error",
          message: "other product with presented code already exist in the database",
        } satisfies ErrorResponse);
      }
    }
    next(error);
  }
};

export const productHandlers = {
  getProducts,
  createProduct,
};
