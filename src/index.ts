import "dotenv-safe/config.js";
import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import { authRouters } from "@src/routers/AuthRouters.js";
import errorHandler from "@src/handlers/ErrorHandlers.js";
import { ErrorResponse, SuccessResponse } from "@src/helpers/HandlerHelpers.js";
import { userRouters } from "@src/routers/UserRouters.js";
import { productRouters } from "@src/routers/ProductRouters.js";
import { transactionRouters } from "@src/routers/TransactionRouters.js";

// create express instance
const app = express();

// global middlewares
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: "GET, HEAD, PUT, PATCH, POST, DELETE, OPTION",
    allowedHeaders: "X-PINGOTHER, authorization, x-refresh-token, Content-Type, Accept",
  })
); // enables cors
app.use(helmet()); // use protection :)
app.use(express.urlencoded({ extended: true })); // parses urlencoded request body
app.use(express.json()); // parses json request body
app.use(compression()); // compresses request and response

// routers
app.use(authRouters);
app.use(userRouters);
app.use(productRouters);
app.use(transactionRouters);
app.get("/", (_req, res) =>
  res.status(200).json({
    status: "success",
    message: "api ok!",
  } satisfies SuccessResponse)
);
app.use("*", (req, res) =>
  res.status(404).json({
    status: "error",
    message: `endpoint ${req.originalUrl} doesn't exists!`,
  } satisfies ErrorResponse)
);

// global internal error handler
app.use(errorHandler);

// run express
const port = parseInt(process.env.PORT || "0");
if (port === 0) {
  throw new Error("PORT not defined. Please define port in environment variables");
}
app.listen(port, () => {
  if (process.env.NODE_ENV === "development") {
    console.log(`Server started at port: ${port}`);
  }
});
