import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),

  name: text("name").notNull(),

  description: text("description"),

  denomination: integer("denomination").notNull(),

  priceUsdt: numeric("price_usdt", {
    precision: 10,
    scale: 2,
  }).notNull(),

  imageUrl: text("image_url"),

  active: boolean("active")
    .notNull()
    .default(true),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),

  reference: text("reference")
    .notNull()
    .unique(),

  customerEmail: text("customer_email"),

  totalUsdt: numeric("total_usdt", {
    precision: 10,
    scale: 2,
  }).notNull(),

  /*
   * Importe exacto que debe enviar el cliente.
   * Lleva una pequeña fracción única para identificar
   * automáticamente el pedido.
   */
  paymentAmountUsdt: numeric("payment_amount_usdt", {
    precision: 18,
    scale: 6,
  }),

  /*
   * pending
   * paid
   * delivered
   * expired
   */
  status: text("status")
    .notNull()
    .default("pending"),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }),

  txHash: text("tx_hash").unique(),

  paidAt: timestamp("paid_at", {
    withTimezone: true,
  }),

  deliveredAt: timestamp("delivered_at", {
    withTimezone: true,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),

  orderId: integer("order_id").notNull(),

  productId: integer("product_id").notNull(),

  productName: text("product_name").notNull(),

  unitPriceUsdt: numeric("unit_price_usdt", {
    precision: 10,
    scale: 2,
  }).notNull(),

  quantity: integer("quantity").notNull(),
});

export const giftCardCodes = pgTable("gift_card_codes", {
  id: serial("id").primaryKey(),

  productId: integer("product_id").notNull(),

  code: text("code")
    .notNull()
    .unique(),

  /*
   * available
   * reserved
   * delivered
   */
  status: text("status")
    .notNull()
    .default("available"),

  orderId: integer("order_id"),

  reservedAt: timestamp("reserved_at", {
    withTimezone: true,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  deliveredAt: timestamp("delivered_at", {
    withTimezone: true,
  }),
});
