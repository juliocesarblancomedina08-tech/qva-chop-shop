import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  orders,
  orderItems,
  giftCardCodes,
} from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const orderId = Number(id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "ID de pedido inválido.",
        },
        { status: 400 }
      );
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return NextResponse.json(
        {
          ok: false,
          error: "Pedido no encontrado.",
        },
        { status: 404 }
      );
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    const codes = await db
      .select({
        id: giftCardCodes.id,
        productId: giftCardCodes.productId,
        code: giftCardCodes.code,
        status: giftCardCodes.status,
        deliveredAt: giftCardCodes.deliveredAt,
      })
      .from(giftCardCodes)
      .where(eq(giftCardCodes.orderId, orderId));

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        customerEmail: order.customerEmail,
        totalUsdt: Number(order.totalUsdt),
        paymentAmountUsdt: Number(
          order.paymentAmountUsdt
        ),
        status: order.status,
        paidAt: order.paidAt,
        deliveredAt: order.deliveredAt,
        expiresAt: order.expiresAt,
        createdAt: order.createdAt,
      },
      items,
      codes,
    });
  } catch (error) {
    console.error(
      "GET_ORDER_ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo consultar el pedido.",
      },
      { status: 500 }
    );
  }
}
