import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import {
  orders,
  orderItems,
  products,
} from "../../../../db/schema";
import { eq } from "drizzle-orm";

export async function POST(request) {
  try {
    const body = await request.json();

    const email = String(body?.email || "").trim();
    const cart = Array.isArray(body?.cart) ? body.cart : [];

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
     * No confiamos en los precios enviados
     * por el navegador.
     *
     * Buscamos los productos reales en Neon
     * y calculamos el total desde la base de datos.
     */

    const validatedItems = [];

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

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product || !product.active) {
        return NextResponse.json(
          {
            ok: false,
            error: "Uno de los productos ya no está disponible.",
          },
          { status: 400 }
        );
      }

      const quantity = Math.max(
        1,
        Number(item?.quantity || 1)
      );

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
     * Referencia única del pedido.
     */
    const reference =
      "QVA-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    /*
     * Creamos el pedido.
     */
    const [order] = await db
      .insert(orders)
      .values({
        reference,
        customerEmail: email,
        totalUsdt: total.toFixed(2),
        status: "pending",
      })
      .returning();

    /*
     * Guardamos los productos del pedido.
     */
    for (const item of validatedItems) {
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: item.product.id,
        productName: item.product.name,
        unitPriceUsdt:
          Number(item.product.priceUsdt).toFixed(2),
        quantity: item.quantity,
      });
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        totalUsdt: Number(order.totalUsdt),
        status: order.status,
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
