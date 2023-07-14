import { PrismaClient, Prisma } from "@prisma/client";

export const prisma = new PrismaClient();

export const PrismaClientKnownRequestError = Prisma.PrismaClientKnownRequestError;

export const isPrismaError = (error: unknown) => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError
  );
};
