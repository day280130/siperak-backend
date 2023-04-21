import { prisma } from '@src/helpers/PrismaHelpers.js';
import { RequestHandler } from 'express';
import * as z from 'zod';

const getAll: RequestHandler = (req, res) => {
  res.status(200).json({
    route: '/todo',
    req: req.body,
  });
};

const todoInputSchema = z.object({
  content: z.string(),
  creatorId: z.string().uuid(),
});

const post: RequestHandler = async (req, res) => {
  const parsedReqBody = todoInputSchema.safeParse(req.body);
  if (!parsedReqBody.success) {
    return res.status(400).json({ status: 'error', message: 'request body not valid' });
  }

  const createTodo = await prisma.todo.create({
    data: parsedReqBody.data,
  });

  return res.status(200).json({
    status: 'success',
    todo: createTodo,
  });
};

export const todoHandlers = { getAll, post };
