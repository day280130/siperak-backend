import { validatorObj as validator } from "@src/helpers/ValidatorHelpers.js";
import { baseCachedQuerySchema, baseQuerySchema } from "@src/schemas/BaseSchemas.js";
import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z
    .string({ required_error: "email required" })
    .email({ message: "email not valid" })
    .max(100, { message: "email too long, max 100 characters" })
    .trim()
    .transform(val => validator.escape(val))
    .transform(val => validator.normalizeEmail(val, { gmail_remove_dots: false })),
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
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

/**
 * Schema for stripping password from user data
 */
export const userSafeSchema = userSchema.omit({ password: true });

/**
 * UserData without password
 */
export type UserSafeData = z.infer<typeof userSafeSchema>;

/**
 * Schema for stripping password and id from user data
 */
export const userSafeNoIDSchema = userSchema.omit({ id: true, password: true });

export const userQuerySchema = baseQuerySchema.extend({
  name: z.string().optional(),
  email: z.string().optional(),
  role: userSafeSchema.shape.role.optional(),
  order_by: z.enum(["name", "email", "role", "created_at"]).default("created_at"),
});

// type Test = z.infer<typeof userQuerySchema>

export const usersDataCachedQuerySchema = baseCachedQuerySchema.extend({
  datas: z.array(userSchema.omit({ password: true })),
});

// type Test = z.infer<typeof userQuerySchema>
