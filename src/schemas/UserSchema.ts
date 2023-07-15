import { validatorObj as validator } from "@src/helpers/ValidatorHelpers.js";
import * as z from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z
    .string({ required_error: "email required" })
    .email({ message: "email not valid" })
    .max(100, { message: "email too long, max 100 characters" })
    .trim()
    .transform(val => validator.escape(val))
    .transform(val => validator.normalizeEmail(val) as string),
  name: z
    .string({ required_error: "name required" })
    .max(100, { message: "name too long, max 100 characters" })
    .trim()
    .refine(val => validator.isAlpha(val, "en-US", { ignore: " " }), {
      message: "name should only contains alpha characters and spaces",
    })
    .transform(val => validator.escape(val)),
  password: z
    .string({ required_error: "password required" })
    .max(256, { message: "password too long, max 256 characters" })
    .trim()
    .refine(val => validator.isStrongPassword(val), {
      message: "password should be at least 8 characters containing uppercases, lowercases, numbers, and symbols",
    }),
  role: z.enum(["ADMIN", "USER"]),
});

export type UserData = z.infer<typeof userSchema>;

/**
 * Schema for stripping password from user data
 */
export const userSafeSchema = userSchema.omit({ password: true });
export type UserSafeSchema = z.infer<typeof userSafeSchema>;

/**
 * Schema for stripping password and id from user data
 */
export const userSafeNoIDSchema = userSchema.omit({ id: true, password: true });
export type UserSafeNoIDSchema = z.infer<typeof userSafeNoIDSchema>;
