import { NextResponse } from "next/server";
import { eq, and, lt } from "drizzle-orm";
import { db } from "../../../../lib/db";
import {
  orders,
  orderItems,
  products,
  giftCardCodes,
} from "../../../../db/schema";

const RESERVATION_MINUTES = 3;

export async function POST(request) {
  try {
    /*
     * LIMPIEZA AUTOMÁTICA DE PEDIDOS VENCIDOS
     *
     * Antes de crear un pedido nuevo, buscamos los
     * pedidos pendientes cuyo tiempo ya terminó y
     * liberamos sus códigos reservados.
     */
    const now = new Date();

    const expiredOrders = await db
      .select({
        id: orders.id,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "pending"),
          lt(orders.expiresAt, now)
        )
      );

    for (const expiredOrder of expiredOrders) {
      /*
       * Devolvemos los códigos reservados al inventario.
       */
      await db
        .update(giftCardCodes)
        .set({
          status: "available",
          orderId: null,
          reservedAt: null,
        })
        .where(
          and(
            eq(giftCardCodes.orderId, expiredOrder.id),
            eq(giftCardCodes.status, "reserved")
          )
        );

      /*
       * Marcamos el pedido como vencido.
       */
      await db
        .update(orders)
        .set({
          status: "expired",
        })
        .where(
          and(
            eq(orders.id, expiredOrder.id),
            eq(orders.status, "pending")
          )
        );
    }

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

    /*
     * Verificamos todos los productos y las
     * cantidades solicitadas.
     */
    const validatedItems = [];

    for (const item of cart) {
      const productId = Number(
        item?.productId || item?.id
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

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product || !product.active) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Uno de los productos ya no está disponible.",
          },
          { status: 400 }
        );
      }

      const quantity = Math.max(
        1,
        Math.floor(Number(item?.quantity) || 1)
      );

      validatedItems.push({
        product,
        quantity,
      });
    }

    /*
     * Antes de crear el pedido comprobamos que
     * existan suficientes códigos disponibles.
     */
    for (const item of validatedItems) {
      const availableCodes = await db
        .select({
          id: giftCardCodes.id,
        })
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

      if (
        availableCodes.length < item.quantity
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              `No hay suficientes códigos disponibles para ${item.product.name}.`,
          },
          { status: 400 }
        );
      }
    }

    /*
     * Calculamos el total utilizando los precios
     * guardados en la base de datos.
     */
    const total = validatedItems.reduce(
      (sum, item) =>
        sum +
        Number(item.product.priceUsdt) *
          item.quantity,
      0
    );

    /*
     * Creamos una referencia única.
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
     * El pedido vence exactamente en 3 minutos.
     */
    const expiresAt = new Date(
      now.getTime() +
      RESERVATION_MINUTES * 60 * 1000
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
        status: "pending",
        expiresAt,
      })
      .returning();

    /*
     * Guardamos los productos y reservamos
     * los códigos específicos para este pedido.
     */
    const reservedCodes = [];

    for (const item of validatedItems) {
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: item.product.id,
        productName: item.product.name,
        unitPriceUsdt: Number(
          item.product.priceUsdt
        ).toFixed(2),
        quantity: item.quantity,
      });

      /*
       * Buscamos los códigos disponibles para
       * este producto.
       */
      const availableCodes = await db
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

      /*
       * Los reservamos inmediatamente para que
       * ningún otro pedido pueda utilizarlos.
       */
      for (const code of availableCodes) {
        const [reservedCode] = await db
          .update(giftCardCodes)
          .set({
            status: "reserved",
            orderId: order.id,
            reservedAt: now,
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
          )
          .returning();

        if (!reservedCode) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Uno de los códigos acaba de ser reservado. Inténtalo nuevamente.",
            },
            { status: 409 }
          );
        }

        reservedCodes.push(reservedCode);
      }
    }

    /*
     * Respondemos con la información necesaria
     * para mostrar el pago y el contador.
     */
    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        customerEmail: order.customerEmail,
        totalUsdt: Number(order.totalUsdt),
        status: order.status,
        expiresAt: order.expiresAt,
        reservedCodes: reservedCodes.length,
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
        error: "No se pudo crear el pedido.",
      },
      { status: 500 }
    );
  }
