import { ErrorResponse, SuccessResponse } from '@src/helpers/HandlerHelpers.js';
import { prisma } from '@src/helpers/PrismaHelpers.js';
import { userSchema } from '@src/schemas/UserSchema.js';
import { RequestHandler } from 'express';

const userDataSchema = userSchema.omit({ password: true });

const getUser: RequestHandler = async (req, res, next) => {
  try {
    const inputSchema = userSchema.pick({ id: true });
    const parsedParams = inputSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json({
        status: 'error',
        message: 'no valid id provided',
      } satisfies ErrorResponse);
    }
    const { id } = parsedParams.data;

    const userData = await prisma.user.findFirst({
      where: {
        id,
      },
    });

    const safeUserData = userDataSchema.parse(userData);

    return res.status(200).json({
      status: 'success',
      message: 'user found',
      datas: [safeUserData],
    } satisfies SuccessResponse);
  } catch (error) {
    next(error);
  }
};

export const userHandlers = {
  getUser,
};
