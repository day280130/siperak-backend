import { validatorObj as validator } from "@src/helpers/ValidatorHelpers.js";
import { baseCachedQuerySchema, baseQuerySchema } from "@src/schemas/BaseSchemas.js";
import { z } from "zod";

export const productSchema = z.object({
  code: z
    .string({
      required_error: "product code required",
    })
    .length(7, "product code have to be 7 digit")
    .refine(value => /^[A-Z]{3}-(?!000)\d{3}$/.test(value), "product code not valid"),
  name: z
    .string({ required_error: "product name required" })
    .max(100, { message: "product name too long, max 100 characters" })
    .trim()
    .refine(val => validator.isAlphanumeric(val, "en-US", { ignore: " " }), {
      message: "product name should only contains alphanumeric characters and spaces",
    })
    .transform(val => validator.escape(val)),
  price: z
    .number({ required_error: "product price required" })
    .nonnegative("product price must not be negative")
    .min(1, "product price have to be 1 or more"),
});

export const productQuerySchema = baseQuerySchema.extend({
  code: z.string().optional(),
  name: z.string().optional(),
  price_min: z.coerce
    .number()
    .gte(0)
    .lte(Number.MAX_SAFE_INTEGER - 1)
    .default(0),
  price_max: z.coerce.number().gte(1).lte(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER),
  order_by: z.enum(["code", "name", "price", "created_at"]).default("created_at"),
});

// type Test = z.infer<typeof productQuerySchema>

export const productsCachedQuerySchema = baseCachedQuerySchema.extend({ datas: z.array(productSchema) });

// type Test = z.infer<typeof productsCachedQuerySchema>;
