import { cookieConfig, csrfCookieName, refreshCookieName } from '@src/configs/CookieConfigs.js';
import { clearSession } from '@src/helpers/AuthHelpers.js';
import { ErrorResponse, SuccessResponse, logError } from '@src/helpers/HandlerHelpers.js';
import { jwtPromisified } from '@src/helpers/JwtHelpers.js';
import { MemcachedMethodError, memcached } from '@src/helpers/MemcachedHelpers.js';
import { PrismaClientKnownRequestError, prisma } from '@src/helpers/PrismaHelpers.js';
import { BinaryLike, createHash, randomBytes, scrypt } from 'crypto';
import { RequestHandler } from 'express';
import validatorNamespace from 'validator';
import * as z from 'zod';

const validator = validatorNamespace.default;

const scryptPromisified = async (password: BinaryLike, salt: BinaryLike, keylen: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });

const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'super secret password';

const userInputSchema = z.object({
  email: z
    .string({ required_error: 'email required' })
    .email({ message: 'email not valid' })
    .max(100, { message: 'email too long, max 100 characters' })
    .trim()
    .transform(val => validator.escape(val))
    .transform(val => validator.normalizeEmail(val) as string),
  name: z
    .string({ required_error: 'name required' })
    .max(100, { message: 'name too long, max 100 characters' })
    .trim()
    .refine(val => validator.isAlpha(val, 'en-US', { ignore: ' ' }), {
      message: 'name should only contains alpha characters and spaces',
    })
    .transform(val => validator.escape(val)),
  password: z
    .string({ required_error: 'password required' })
    .max(256, { message: 'password too long, max 256 characters' })
    .trim()
    .refine(val => validator.isStrongPassword(val), {
      message: 'password should be at least 8 characters containing uppercases, lowercases, numbers, and symbols',
    }),
});

const generateCsrfToken: RequestHandler = async (_req, res, next) => {
  try {
    // generate random 16 bytes csrf key and 32 bytes csrf token
    const csrfKey = randomBytes(16).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');

    // hash csrf token with csrf key
    const hashedCsrfToken = createHash('sha256').update(`${csrfKey}${csrfToken}`).digest('hex');

    // store csrf key in cache with key of csrf token
    await memcached.set(csrfToken, csrfKey, 5 * 60);

    // send hashed csrf token via cookie
    res.cookie(csrfCookieName, hashedCsrfToken, cookieConfig);

    // send csrf token via response payload
    return res.status(200).json({
      status: 'success',
      message: 'anonymous csrf token generated successfully',
      datas: [{ csrfToken }],
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

const register: RequestHandler = async (req, res, next) => {
  try {
    // parse request body
    const parsedBody = userInputSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'request body not valid',
        errors: parsedBody.error.issues,
      } satisfies ErrorResponse);
    }
    const { email, name, password } = parsedBody.data;

    // hash password
    const hashedPassword = (await scryptPromisified(password, PASSWORD_SECRET, 32)).toString('hex');

    // insert user to database
    const insertResult = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    // store created user to cache (potential non-harmful error)
    try {
      await memcached.set(
        `user:${insertResult.id}`,
        JSON.stringify({ email: insertResult.email, name: insertResult.name }),
        60
      );
    } catch (error) {
      if (error instanceof MemcachedMethodError) {
        logError(`${req.path} > memcached user set`, error, true);
      } else {
        logError(`${req.path} > memcached user set`, error, false);
      }
    }

    // generate refresh token
    const refreshToken = await jwtPromisified.sign('REFRESH_TOKEN', {
      userId: insertResult.id,
      userEmail: insertResult.email,
      userName: insertResult.name,
      userRole: insertResult.role,
    });

    // generate access token
    const csrfToken = req.headers['x-csrf-token'] as string;
    const accessToken = await jwtPromisified.sign(
      'ACCESS_TOKEN',
      {
        userId: insertResult.id,
        userEmail: insertResult.email,
        userName: insertResult.name,
        userRole: insertResult.role,
      },
      csrfToken
    );

    // store csrf key in cache with key of refresh token
    const csrfKey = (await memcached.get(csrfToken)).result as string;
    await memcached.set(refreshToken, csrfKey, 7 * 24 * 60 * 60);

    // delete csrf key in cache with key of csrf token
    await memcached.del(csrfToken);

    // send refresh token via cookie
    res.cookie(refreshCookieName, refreshToken, cookieConfig);

    // send created user and access token via response payload
    return res.status(201).json({
      status: 'success',
      message: 'user created',
      datas: [
        {
          id: insertResult.id,
          email: insertResult.email,
          name: insertResult.name,
          role: insertResult.role,
          accessToken,
        },
      ],
    } satisfies SuccessResponse);
  } catch (error) {
    // catch register unique email violation
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      if (error.meta?.target === 'user_email_key') {
        return res.status(400).json({
          status: 'error',
          message: 'account with presented email already exist in the database',
        } satisfies ErrorResponse);
      }
    }

    // pass internal error to global error handler
    return next(error);
  }
};

const login: RequestHandler = async (req, res, next) => {
  try {
    // parse request body
    const bodySchema = userInputSchema.omit({ name: true });
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        status: 'error',
        message: 'request body not valid',
        errors: parsedBody.error.issues,
      } satisfies ErrorResponse);
    }
    const { email, password } = parsedBody.data;

    // check email presence in the database
    const user = await prisma.user.findFirst({
      where: {
        email,
      },
    });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'email or password is wrong',
      } satisfies ErrorResponse);
    }

    // check password
    const hashedGivenPassword = (await scryptPromisified(password, PASSWORD_SECRET, 32)).toString('hex');
    if (hashedGivenPassword !== user.password) {
      return res.status(400).json({
        status: 'error',
        message: 'email or password is wrong',
      } satisfies ErrorResponse);
    }

    // generate refresh token
    const refreshToken = await jwtPromisified.sign('REFRESH_TOKEN', {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
    });

    // generate access token
    const csrfToken = req.headers['x-csrf-token'] as string;
    const accessToken = await jwtPromisified.sign(
      'ACCESS_TOKEN',
      {
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
      },
      csrfToken
    );

    // store csrf key in cache with key of refresh token
    const csrfKey = (await memcached.get(csrfToken)).result as string;
    await memcached.set(refreshToken, csrfKey, 7 * 24 * 60 * 60);

    // delete csrf key in cache with key of csrf token
    await memcached.del(csrfToken);

    // send refresh token via cookie
    res.cookie(refreshCookieName, refreshToken, cookieConfig);

    // send logged in user data and access token via response payload
    return res.status(200).json({
      status: 'success',
      message: 'logged in',
      datas: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          accessToken,
        },
      ],
    } satisfies SuccessResponse);
  } catch (error) {
    // pass internal error to global error handler
    return next(error);
  }
};

const refresh: RequestHandler = async (req, res, next) => {
  try {
    // get refresh token from cookie
    const refreshToken = req.signedCookies[refreshCookieName];

    // get user data from refresh token
    const { userEmail, userId, userName } = await jwtPromisified.decode(refreshToken);

    // generate new random 16 bytes csrf key and 32 bytes csrf token
    const csrfKey = randomBytes(16).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');

    // generate new hashed csrf token with csrf key
    const hashedCsrfToken = createHash('sha256').update(`${csrfKey}${csrfToken}`).digest('hex');

    // update cache with key of refresh token
    await memcached.set(refreshToken, csrfKey, 7 * 24 * 60 * 60);

    // generate new access token
    const accessToken = await jwtPromisified.sign('ACCESS_TOKEN', { userEmail, userId, userName }, csrfToken);

    // send hashed csrf token via cookie
    res.cookie(csrfCookieName, hashedCsrfToken, cookieConfig);

    // send new csrf token and access token via response payload
    return res.status(200).json({
      status: 'success',
      message: 'new access token generated',
      datas: [{ accessToken, csrfToken }],
    } satisfies SuccessResponse);
  } catch (error) {
    // pass internal error to global error handler
    next(error);
  }
};

const logout: RequestHandler = async (req, res) => {
  const refreshToken = req.signedCookies[refreshCookieName];
  clearSession(res, refreshToken);
  return res.status(200).json({
    status: 'success',
    message: 'logged out',
  } satisfies SuccessResponse);
};

const checkSession: RequestHandler = async (req, res) => {
  const hashedCsrfToken = req.signedCookies[csrfCookieName];
  const csrfToken = req.headers['x-csrf-token'] as string;
  const refreshToken = req.signedCookies[refreshCookieName];
  const csrfKey = (await memcached.get(refreshToken)).result as string;
  const accessTokenHeader = req.headers['authorization'] as string;
  const accessToken = accessTokenHeader.split(' ')[1];
  return res.status(200).json({
    status: 'success',
    message: 'session ok!',
    datas: [
      {
        csrfToken,
        csrfKey,
        hashedCsrfToken,
        refreshToken,
        accessToken,
      },
    ],
  } satisfies SuccessResponse);
};

const checkToken: RequestHandler = async (req, res) => {
  const hashedCsrfToken = req.signedCookies[csrfCookieName];
  const csrfToken = req.headers['x-csrf-token'] as string;
  const csrfKey = (await memcached.get(csrfToken)).result as string;
  return res.status(200).json({
    status: 'success',
    message: 'csrf token ok!',
    datas: [
      {
        csrfToken,
        csrfKey,
        hashedCsrfToken,
      },
    ],
  } satisfies SuccessResponse);
};

export const authHandlers = {
  generateCsrfToken,
  checkToken,
  login,
  register,
  refresh,
  logout,
  checkSession,
};
