import 'dotenv-safe/config.js';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import https from 'https';
import cookieParser from 'cookie-parser';
import { COOKIE_SECRET } from '@src/configs/CookieConfigs.js';
import { authRouters } from '@src/routers/AuthRouters.js';
import errorHandler from '@src/handlers/ErrorHandlers.js';
import { SuccessResponse } from '@src/helpers/HandlerHelpers.js';
import { userRouters } from '@src/routers/UserRouters.js';
import { readFileSync } from 'fs';
import path from 'path';
import * as url from 'url';

// create express instance
const app = express();

// global middlewares
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTION',
    allowedHeaders: 'X-PINGOTHER, authorization, x-csrf-token, Content-Type, Accept',
  })
); // enables cors
app.use(helmet()); // use protection :)
app.use(cookieParser(COOKIE_SECRET));
app.use(express.urlencoded({ extended: true })); // parses urlencoded request body
app.use(express.json()); // parses json request body
app.use(compression()); // compresses request and response

// routers
app.use(authRouters);
app.use(userRouters);
app.get('/', (_req, res) => {
  return res.status(200).json({
    status: 'success',
    message: 'api ok!',
  } satisfies SuccessResponse);
});

// global internal error handler
app.use(errorHandler);

// import ssl certificate
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const privateKey = readFileSync(path.join(__dirname, '../sslcert/key.pkey'), 'utf-8');
const certificate = readFileSync(path.join(__dirname, '../sslcert/certificate.cer'), 'utf-8');

// run express
const port = parseInt(process.env.PORT || '0');
if (port === 0) {
  throw new Error('PORT not defined. Please define port in environment variables');
}

const httpsServer = https.createServer(
  {
    key: privateKey,
    cert: certificate,
  },
  app
);

httpsServer.listen(port, () => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`Server started at https://192.168.1.3:${port}`);
  }
});
