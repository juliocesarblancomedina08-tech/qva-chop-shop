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

export const giftCardCodes = pgTable("gift_card_codes", {
  id: serial("id").primaryKey(),

  productId: integer("product_id").notNull(),

  code: text("code").notNull().unique(),

  status: text("status")
    .notNull()
    .default("available"),

  /*
   * El pedido que tiene reservado o recibió
   * este código.
   */
  orderId: integer("order_id"),

  /*
   * Momento en que el código fue reservado.
   */
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
   * pending, paid, delivered o expired
   */
  status: text("status")
    .notNull()
    .default("pending"),

  /*
   * Momento máximo para realizar el pago.
   */
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

  quantity: integer("quantity")
    .notNull(),
});
