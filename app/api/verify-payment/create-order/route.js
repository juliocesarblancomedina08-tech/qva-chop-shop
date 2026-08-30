import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../../lib/db";
import {
  products,
  orders,
  orderItems,
  giftCardCodes,
} from "../../../db/schema";

export async function POST(request) {
  try {
    const body = await request.json();

    const email = String(
      body?.email || ""
    )
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

    /*
     * Agrupamos productos.
     */
    const requested = new Map();

    for (const item of cart) {
      const productId = Number(
        item?.productId
      );

      if (!Number.isInteger(productId)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Producto inválido.",
          },
          { status: 400 }
        );
      }

      const quantity = Math.max(
        1,
        Math.min(
          20,
          Number(item?.quantity || 1)
        )
      );

      requested.set(
        productId,
        (requested.get(productId) || 0) +
          quantity
      );
    }

    /*
     * Buscamos y validamos los productos
     * directamente en la base de datos.
     */
    const validatedItems = [];

    for (const [
      productId,
      quantity,
    ] of requested.entries()) {

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
            error:
              "Uno de los productos ya no está disponible.",
          },
          { status: 400 }
        );
      }

      /*
       * Comprobamos que existen suficientes
       * códigos disponibles.
       */
      const available = await db
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
        available[0]?.count || 0
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

    /*
     * Calculamos el total real desde Neon.
     */
    const total = validatedItems.reduce(
      (sum, item) =>
        sum +
        Number(item.product.priceUsdt) *
          item.quantity,
      0
    );

    /*
     * Creamos una pequeña fracción única.
     *
     * Esto permite que el servidor identifique
     * automáticamente el pago sin pedir TX Hash.
     */
    const uniquePart =
      Math.floor(
        Math.random() * 900000
      ) + 100000;

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

    /*
     * El pedido dura 30 minutos.
     */
    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000
    );

    /*
     * Creamos el pedido.
     */
    const [order] = await db
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

    /*
     * Guardamos los artículos.
     */
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

    /*
     * Reservamos los códigos para este pedido.
     */
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
        paymentAmountUsdt:
          Number(
            order.paymentAmountUsdt
          ),
        expiresAt:
          order.expiresAt,
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
