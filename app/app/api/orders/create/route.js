import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../../lib/db";
import {
  products,
  orders,
  orderItems,
  giftCardCodes,
} from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();

    const email = String(body?.email || "")
      .trim()
      .toLowerCase();

    const cart = Array.isArray(body?.cart)
      ? body.cart
      : [];

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          error: "El correo electrónico es obligatorio.",
        },
        { status: 400 }
      );
    }

    if (!cart.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "El carrito está vacío.",
        },
        { status: 400 }
      );
    }

    const requested = new Map();

    for (const item of cart) {
      const productId = Number(item?.productId);
      const quantity = Number(item?.quantity || 1);

      if (!Number.isInteger(productId) || productId <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Producto inválido.",
          },
          { status: 400 }
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "Cantidad inválida.",
          },
          { status: 400 }
        );
      }

      requested.set(
        productId,
        (requested.get(productId) || 0) + quantity
      );
    }

    const validatedItems = [];

    for (const [productId, quantity] of requested) {
      const [product] = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.active, true)
          )
        )
        .limit(1);

      if (!product) {
        return NextResponse.json(
          {
            ok: false,
            error: "Uno de los productos no está disponible.",
          },
          { status: 400 }
        );
      }

      const availableResult = await db
        .select({
          count: sql`count(*)`,
        })
        .from(giftCardCodes)
        .where(
          and(
            eq(giftCardCodes.productId, productId),
            eq(giftCardCodes.status, "available")
          )
        );

      const availableCount = Number(
        availableResult[0]?.count || 0
      );

      if (availableCount < quantity) {
        return NextResponse.json(
          {
            ok: false,
            error: `No hay suficientes códigos disponibles para ${product.name}.`,
          },
          { status: 400 }
        );
      }

      validatedItems.push({
        product,
        quantity,
      });
    }

    const total = validatedItems.reduce(
      (sum, item) =>
        sum +
        Number(item.product.priceUsdt) *
          item.quantity,
      0
    );

    /*
     * Generamos una pequeña diferencia única
     * para identificar automáticamente el pago.
     */
    const uniquePart =
      Math.floor(Math.random() * 900000) + 100000;

    const paymentAmount =
      Number(total.toFixed(2)) +
      uniquePart / 100000000;

    const reference =
      "QVA-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000
    );

    const [order] = await db
      .insert(orders)
      .values({
        reference,
        customerEmail: email,
        totalUsdt: total.toFixed(8),
        paymentAmountUsdt: paymentAmount.toFixed(8),
        status: "pending",
        expiresAt,
      })
      .returning();

    for (const item of validatedItems) {
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: item.product.id,
        productName: item.product.name,
        unitPriceUsdt: Number(
          item.product.priceUsdt
        ).toFixed(8),
        quantity: item.quantity,
      });
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        totalUsdt: Number(order.totalUsdt),
        paymentAmountUsdt: Number(
          order.paymentAmountUsdt
        ),
        expiresAt: order.expiresAt,
      },
    });
  } catch (error) {
    console.error("CREATE_ORDER_ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo crear el pedido.",
      },
      { status: 500 }
    );
  }
      }
