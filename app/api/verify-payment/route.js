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

    // Si ya fue entregado, devolvemos los códigos
    // sin volver a entregar otros.
    if (order.status === "delivered") {
      const deliveredCodes = await db
        .select({
          code: giftCardCodes.code,
          productId: giftCardCodes.productId,
        })
        .from(giftCardCodes)
        .where(eq(giftCardCodes.orderId, order.id));

      return NextResponse.json({
        ok: true,
        paid: true,
        delivered: true,
        codes: deliveredCodes,
      });
    }

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

    // Consultamos las transferencias de USDT BEP-20
    // recibidas por nuestra billetera.
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
        message: "Esperando el pago...",
      });
    }

    const destination = wallet.toLowerCase();

    // BscScan devuelve el valor en la unidad mínima
    // del token. USDT BEP-20 utiliza 18 decimales.
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

      if (txValue < requiredAmount) {
        continue;
      }

      if (confirmations < 1) {
        continue;
      }

      const txHash = tx.hash;

      if (!txHash) {
        continue;
      }

      // Evitamos utilizar la misma transacción
      // para pagar dos pedidos diferentes.
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

    if (!matchingTransaction) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        message: "Esperando el pago...",
      });
    }

    const txHash = matchingTransaction.hash;

    // Marcamos el pedido como pagado.
    await db
      .update(orders)
      .set({
        status: "paid",
        txHash,
        paidAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    // Obtenemos los productos del pedido.
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    // Cantidad total de códigos que debemos entregar.
    const totalCodesNeeded = items.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    );

    const deliveredCodes = [];

    // Entregamos un código por cada unidad comprada.
    for (const item of items) {
      for (
        let i = 0;
        i < Number(item.quantity);
        i++
      ) {
        const [availableCode] = await db
          .select()
          .from(giftCardCodes)
          .where(
            and(
              eq(
                giftCardCodes.productId,
                item.productId
              ),
              eq(
                giftCardCodes.status,
                "available"
              )
            )
          )
          .limit(1);

        if (!availableCode) {
          continue;
        }

        const [updatedCode] = await db
          .update(giftCardCodes)
          .set({
            status: "delivered",
            orderId: order.id,
            deliveredAt: new Date(),
          })
          .where(
            and(
              eq(
                giftCardCodes.id,
                availableCode.id
              ),
              eq(
                giftCardCodes.status,
                "available"
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
