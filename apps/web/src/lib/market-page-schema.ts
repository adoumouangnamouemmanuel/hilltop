import { z } from "zod";

export const marketCursorSchema = z.object({
  score: z.string().regex(/^-?\d+(\.\d+)?$/),
  id: z.string().min(1).max(64),
  asOf: z.string().datetime({ offset: true }),
});
export type MarketCursor = z.infer<typeof marketCursorSchema>;
const counts = z.record(z.string(), z.number().int().nonnegative());
export const marketFacetsSchema = z.object({
  all: z.number().int().nonnegative(),
  categories: counts,
  conditions: counts,
  pickup: counts,
  sale: z.number().int().nonnegative(),
  deals: z.number().int().nonnegative(),
  attrs: z.record(z.string(), counts),
  price: z.object({ ceiling: z.number().positive(), bins: z.array(z.number().int().nonnegative()).length(24) }),
});
export type MarketFacets = z.infer<typeof marketFacetsSchema>;
const seller = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  shop_name: z.string().nullable(),
  specialty: z.string().nullable(),
  class_of: z.number().nullable(),
  major: z.string().nullable(),
  response_time: z.string().nullable(),
  sales: z.number(),
  verified: z.boolean(),
  created_at: z.string(),
});
const card = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  price: z.number().finite(),
  original_price: z.number().nullable(),
  category: z.string(),
  condition: z.string().nullable(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
  pickup: z.string(),
  stock: z.number().nullable(),
  food: z.object({ cutoff: z.string(), slots: z.array(z.string()) }).nullable(),
  move_out: z.boolean(),
  promoted_until: z.string().nullable(),
  status: z.string(),
  posted_at: z.string(),
  updated_at: z.string(),
  views: z.number(),
  saves: z.number(),
  seller_id: z.string(),
  photos: z.array(z.string()),
  seller: seller.nullable(),
  rating: z.object({ seller_id: z.string(), rating: z.number(), reviews: z.number() }).nullable(),
});
export const marketPageSchema = z.object({
  items: z.array(card),
  next: marketCursorSchema.nullable(),
  total: z.number().int().nonnegative(),
  facets: marketFacetsSchema,
});
