import { SuccessResponse } from "@src/helpers/HandlerHelpers.js";
import { prisma } from "@src/helpers/PrismaHelpers.js";
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

export const productHandlers = {
  getProducts,
};
