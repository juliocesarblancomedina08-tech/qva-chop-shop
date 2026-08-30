import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../lib/db";
import {
  orders,
  orderItems,
  giftCardCodes,
} from "../../../db/schema";

const USDT_DECIMALS = 18;

export async function POST(request) {
  try {
    const body = await request.json();

    const orderReference = body?.orderReference;

    if (!orderReference) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta la referencia del pedido.",
        },
        { status: 400 }
      );
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.reference, orderReference))
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

    /*
     * Si el pedido ya fue entregado,
     * devolvemos los mismos códigos.
     */
    if (order.status === "delivered") {
      const deliveredCodes = await db
        .select({
          code: giftCardCodes.code,
          productId: giftCardCodes.productId,
        })
        .from(giftCardCodes)
        .where(
          and(
            eq(giftCardCodes.orderId, order.id),
            eq(giftCardCodes.status, "delivered")
          )
        );

      return NextResponse.json({
        ok: true,
        paid: true,
        delivered: true,
        codes: deliveredCodes,
      });
    }

    /*
     * Si el pedido ya venció anteriormente,
     * no volvemos a aceptar pagos.
     */
    if (order.status === "expired") {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: true,
        message: "Este pedido ha vencido.",
      });
    }

    const now = new Date();

    /*
     * Comprobamos si los 3 minutos terminaron.
     */
    if (
      order.expiresAt &&
      now.getTime() >=
        new Date(order.expiresAt).getTime()
    ) {
      /*
       * Liberamos únicamente los códigos
       * reservados para este pedido.
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
            eq(giftCardCodes.orderId, order.id),
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
        .where(eq(orders.id, order.id));

      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: true,
        message:
          "El tiempo para realizar el pago ha terminado.",
      });
    }

    /*
     * Configuración del sistema de pagos.
     */
    const wallet =
      process.env.STORE_WALLET_ADDRESS ||
      process.env.NEXT_PUBLIC_STORE_WALLET_ADDRESS;

    const apiKey = process.env.BSCSCAN_API_KEY;

    const usdtContract =
      process.env.USDT_BEP20_CONTRACT;

    if (!wallet || !apiKey || !usdtContract) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Faltan variables de configuración del pago.",
        },
        { status: 500 }
      );
    }

    /*
     * Consultamos las transferencias recibidas
     * de USDT BEP-20.
     */
    const url =
      `https://api.bscscan.com/api` +
      `?module=account` +
      `&action=tokentx` +
      `&contractaddress=${encodeURIComponent(
        usdtContract
      )}` +
      `&address=${encodeURIComponent(wallet)}` +
      `&page=1` +
      `&offset=50` +
      `&sort=desc` +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo consultar BscScan.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.result)) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,
        message: "Esperando el pago...",
      });
    }

    const destination = wallet.toLowerCase();

    /*
     * Calculamos la cantidad exacta requerida.
     */
    const requiredAmount =
      Number(order.totalUsdt) *
      10 ** USDT_DECIMALS;

    let matchingTransaction = null;

    for (const tx of data.result) {
      const txTo = String(
        tx.to || ""
      ).toLowerCase();

      const txContract = String(
        tx.contractAddress || ""
      ).toLowerCase();

      const txValue = Number(tx.value || 0);

      const confirmations = Number(
        tx.confirmations || 0
      );

      if (
        txTo !== destination ||
        txContract !== usdtContract.toLowerCase()
      ) {
        continue;
      }

      /*
       * El pago debe ser igual o superior al
       * total del pedido.
       */
      if (txValue < requiredAmount) {
        continue;
      }

      /*
       * Esperamos al menos una confirmación.
       */
      if (confirmations < 1) {
        continue;
      }

      const txHash = tx.hash;

      if (!txHash) {
        continue;
      }

      /*
       * Evitamos que una misma transacción
       * pague más de un pedido.
       */
      const [alreadyUsed] = await db
        .select({
          id: orders.id,
        })
        .from(orders)
        .where(eq(orders.txHash, txHash))
        .limit(1);

      if (alreadyUsed) {
        continue;
      }

      matchingTransaction = tx;
      break;
    }

    /*
     * Todavía no encontramos el pago.
     */
    if (!matchingTransaction) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,
        message: "Esperando el pago...",
      });
    }

    const txHash = matchingTransaction.hash;

    /*
     * Marcamos el pedido como pagado.
     */
    await db
      .update(orders)
      .set({
        status: "paid",
        txHash,
        paidAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    /*
     * Buscamos exclusivamente los códigos
     * que fueron reservados para este pedido.
     */
    const reservedCodes = await db
      .select()
      .from(giftCardCodes)
      .where(
        and(
          eq(giftCardCodes.orderId, order.id),
          eq(giftCardCodes.status, "reserved")
        )
      );

    /*
     * Verificamos cuántos códigos necesita
     * realmente el pedido.
     */
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const totalCodesNeeded = items.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    );

    /*
     * Si falta algún código reservado, no
     * entregamos códigos nuevos por error.
     */
    if (
      reservedCodes.length !== totalCodesNeeded
    ) {
      return NextResponse.json({
        ok: false,
        paid: true,
        delivered: false,
        error:
          "El pedido no tiene todos los códigos reservados.",
      });
    }

    /*
     * Convertimos todos los códigos reservados
     * en códigos entregados.
     */
    const deliveredCodes = [];

    for (const reservedCode of reservedCodes) {
      const [updatedCode] = await db
        .update(giftCardCodes)
        .set({
          status: "delivered",
          deliveredAt: new Date(),
        })
        .where(
          and(
            eq(
              giftCardCodes.id,
              reservedCode.id
            ),
            eq(
              giftCardCodes.status,
              "reserved"
            ),
            eq(
              giftCardCodes.orderId,
              order.id
            )
          )
        )
        .returning();

      if (updatedCode) {
        deliveredCodes.push({
          productId: updatedCode.productId,
          code: updatedCode.code,
        });
      }
    }

    const delivered =
      deliveredCodes.length === totalCodesNeeded;

    if (delivered) {
      await db
        .update(orders)
        .set({
          status: "delivered",
          deliveredAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    return NextResponse.json({
      ok: true,
      paid: true,
      delivered,
      expired: false,
      txHash,
      codes: deliveredCodes,
      message: delivered
        ? "Pago confirmado y pedido entregado."
        : "Pago confirmado. Estamos preparando tu pedido.",
    });
  } catch (error) {
    console.error(
      "VERIFY_PAYMENT_ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Error interno al verificar el pago.",
      },
      { status: 500 }
    );
  }
      }
