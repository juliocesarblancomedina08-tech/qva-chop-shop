import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";

import { db } from "../../../../lib/db";

import {
  products,
  orders,
  orderItems,
  giftCardCodes,
} from "../../../../db/schema";

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

    if (cart.length === 0) {
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

      if (!Number.isInteger(productId)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Producto inválido.",
          },
          { status: 400 }
        );
      }

      const quantityNumber = Number(
        item?.quantity || 1
      );

      if (
        !Number.isFinite(quantityNumber) ||
        quantityNumber < 1
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "Cantidad inválida.",
          },
          { status: 400 }
        );
      }

      const quantity = Math.min(
        20,
        Math.floor(quantityNumber)
      );

      requested.set(
        productId,
        (requested.get(productId) || 0) + quantity
      );
    }

    const validatedItems = [];

    for (const [productId, quantity] of requested.entries()) {
      const productResult = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, productId),
            eq(products.active, true)
          )
        )
        .limit(1);

      const product = productResult[0];

      if (!product) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Uno de los productos ya no está disponible.",
          },
          { status: 400 }
        );
      }

      const stockResult = await db
        .select({
          count: sql`count(*)`,
        })
        .from(giftCardCodes)
        .where(
          and(
            eq(
              giftCardCodes.productId,
              productId
            ),
            eq(
              giftCardCodes.status,
              "available"
            )
          )
        );

      const availableCount = Number(
        stockResult[0]?.count || 0
      );

      if (availableCount < quantity) {
        return NextResponse.json(
          {
            ok: false,
            error:
              `No hay suficientes códigos disponibles para ${product.name}.`,
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
      (sum, item) => {
        return (
          sum +
          Number(item.product.priceUsdt) *
            item.quantity
        );
      },
      0
    );

    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "El importe del pedido no es válido.",
        },
        { status: 400 }
      );
    }

    const uniquePart =
      Math.floor(Math.random() * 900000) + 100000;

    const paymentAmount =
      Number(total.toFixed(2)) +
      uniquePart / 100000000;

    const reference =
      "QVA-" +
      Date.now()
        .toString(36)
        .toUpperCase() +
      "-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000
    );

    const orderResult = await db
      .insert(orders)
      .values({
        reference,
        customerEmail: email,
        totalUsdt: total.toFixed(2),
        paymentAmountUsdt:
          paymentAmount.toFixed(6),
        status: "pending",
        expiresAt,
      })
      .returning();

    const order = orderResult[0];

    if (!order) {
      throw new Error(
        "No se pudo crear el pedido."
      );
    }

    for (const item of validatedItems) {
      await db
        .insert(orderItems)
        .values({
          orderId: order.id,
          productId: item.product.id,
          productName: item.product.name,
          unitPriceUsdt:
            Number(
              item.product.priceUsdt
            ).toFixed(2),
          quantity: item.quantity,
        });
    }

    for (const item of validatedItems) {
      const codes = await db
        .select()
        .from(giftCardCodes)
        .where(
          and(
            eq(
              giftCardCodes.productId,
              item.product.id
            ),
            eq(
              giftCardCodes.status,
              "available"
            )
          )
        )
        .limit(item.quantity);

      if (codes.length !== item.quantity) {
        throw new Error(
          "No se pudieron reservar todos los códigos."
        );
      }

      for (const code of codes) {
        await db
          .update(giftCardCodes)
          .set({
            status: "reserved",
            orderId: order.id,
            reservedAt: new Date(),
          })
          .where(
            and(
              eq(
                giftCardCodes.id,
                code.id
              ),
              eq(
                giftCardCodes.status,
                "available"
              )
            )
          );
      }
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        totalUsdt: Number(
          order.totalUsdt
        ),
        paymentAmountUsdt: Number(
          order.paymentAmountUsdt
        ),
        expiresAt: order.expiresAt,
      },
    });
  } catch (error) {
    console.error(
      "CREATE_ORDER_ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo crear el pedido.",
      },
      { status: 500 }
    );
  }
              }
