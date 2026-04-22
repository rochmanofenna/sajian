// Order request schemas. Validated at API boundary.

import { z } from 'zod';

export const orderTypeSchema = z.enum(['dine_in', 'takeaway', 'delivery']);
export const paymentMethodSchema = z.enum(['cashier', 'dana', 'qris', 'ovo', 'gopay']);

export const cartModifierSchema = z.object({
  groupName: z.string(),
  optionLabel: z.string(),
  priceDelta: z.number(),
});

export const cartItemSchema = z.object({
  lineId: z.string(),
  menuItemId: z.string(),
  esbMenuId: z.string().optional(),
  name: z.string(),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  modifiers: z.array(cartModifierSchema).default([]),
  notes: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const submitOrderSchema = z.object({
  branchCode: z.string().min(1),
  orderType: orderTypeSchema,
  paymentMethod: paymentMethodSchema,
  tableNumber: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(6),
  items: z.array(cartItemSchema).min(1),
  customerNotes: z.string().optional().nullable(),
});

export type SubmitOrderRequest = z.infer<typeof submitOrderSchema>;
