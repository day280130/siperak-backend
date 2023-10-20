import { productSchema } from "@src/schemas/ProductSchemas.js";
import { validatorObj as validator } from "@src/helpers/ValidatorHelpers.js";
import { z } from "zod";
import { baseCachedQuerySchema, baseQuerySchema } from "@src/schemas/BaseSchemas.js";

export const transactionSchema = z.object({
  id: z.string().uuid(),
  taxInvoiceNumber: z
    .string({
      required_error: "tax invoice number required",
    })
    .length(19, "tax invoice number have to be 19 digit")
    .refine(
      value => /^\d{3}\.\d{3}-\d{2}\.\d{8}$/.test(value),
      "tax invoice number not valid. Example: 012.345-67.89012345"
    )
    .optional(),
  customer: z.object({
    name: z
      .string({ required_error: "customer name required" })
      .max(100, { message: "customer name too long, max 100 characters" })
      .trim()
      .refine(val => validator.isAlphanumeric(val, "en-US", { ignore: " .-" }), {
        message: "allowed characters: alphanumeric, space, '.', and '-'",
      })
      .transform(val => validator.escape(val)),
    address: z
      .string()
      .max(255, { message: "customer address too long, max 255 characters" })
      .trim()
      .refine(val => validator.isAlphanumeric(val, "en-US", { ignore: " ./:-" }), {
        message: "allowed characters: alphanumeric, space, '.', '/', ':', and '-'",
      })
      .transform(val => validator.escape(val))
      .optional(),
    npwpNumber: z
      .string({
        required_error: "NPWP number required",
      })
      .length(20, "NPWP number have to be 20 digit")
      .refine(
        value => /^\d{2}\.\d{3}\.\d{3}\.\d{1}-\d{3}\.\d{3}$/.test(value),
        "NPWP number not valid. Example: 01.234.567.8-901.234"
      ),
  }),
  products: z.array(
    z.object({
      relId: z.string().uuid(),
      product: productSchema,
      quantity: z.number().nonnegative(),
    })
  ),
  total: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  dpp: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});

export const transactionQuerySchema = baseQuerySchema.extend({
  customer_name: z.string().optional(),
  customer_npwp: z.string().optional(),
  total_min: z.coerce
    .number()
    .gte(0)
    .lte(Number.MAX_SAFE_INTEGER - 1)
    .default(0),
  total_max: z.coerce.number().gte(1).lte(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER),
  tax_min: z.coerce
    .number()
    .gte(0)
    .lte(Number.MAX_SAFE_INTEGER - 1)
    .default(0),
  tax_max: z.coerce.number().gte(1).lte(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER),
  created_date_min: z.string().datetime().default("1970-01-01T00:00:00.000Z"),
  created_date_max: z.string().datetime().default(new Date(Date.now()).toISOString()),
  order_by: z.enum(["created_at", "customer", "tax", "total"]).default("created_at"),
});

export const transactionCachedQuerySchema = baseCachedQuerySchema.extend({
  datas: z.array(transactionSchema),
});
