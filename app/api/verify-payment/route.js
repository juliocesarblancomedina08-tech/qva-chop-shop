import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../../lib/db";
import {
  orders,
  orderItems,
  giftCardCodes,
} from "../../../../db/schema";

const BSC_CHAIN_ID = "56";
const USDT_DECIMALS = 18;

function toTokenUnits(amount, decimals) {
  const value = String(amount).trim();

  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("Cantidad de USDT inválida.");
  }

  const [whole, fraction = ""] = value.split(".");

  const paddedFraction = (
    fraction + "0".repeat(decimals)
  ).slice(0, decimals);

  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(paddedFraction || "0")
  );
}

export async function POST(request) {
  try {
    const body = await request.json();

    const orderReference = String(
      body?.orderReference || ""
    ).trim();

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
     * Si ya fue entregado, devolvemos los códigos
     * sin volver a entregar otros.
     */
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
        message: "Este pedido ya fue entregado.",
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

    /*
     * Consultamos las transferencias ERC-20
     * usando Etherscan API V2 para BNB Smart Chain.
     */
    const url =
      `https://api.etherscan.io/v2/api` +
      `?chainid=${BSC_CHAIN_ID}` +
      `&module=account` +
      `&action=tokentx` +
      `&contractaddress=${encodeURIComponent(
        usdtContract
      )}` +
      `&address=${encodeURIComponent(wallet)}` +
      `&page=1` +
      `&offset=100` +
      `&sort=desc` +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo consultar el servicio de verificación.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    /*
     * Cuando no hay transacciones, la API puede
     * devolver un resultado que no sea un array.
     */
    if (!Array.isArray(data.result)) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        message: "Esperando el pago...",
      });
    }

    const destination = wallet.toLowerCase();

    /*
     * Convertimos el total del pedido a unidades
     * completas del token sin perder precisión.
     */
    const requiredAmount = toTokenUnits(
      order.totalUsdt,
      USDT_DECIMALS
    );

    let matchingTransaction = null;

    for (const tx of data.result) {
      const txTo = String(
        tx.to || ""
      ).toLowerCase();

      const txContract = String(
        tx.contractAddress || ""
      ).toLowerCase();

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
       * Verificamos que el token recibido tenga
       * exactamente 18 decimales.
       */
      const tokenDecimals = Number(
        tx.tokenDecimal || USDT_DECIMALS
      );

      if (tokenDecimals !== USDT_DECIMALS) {
        continue;
      }

      let txValue;

      try {
        txValue = BigInt(String(tx.value || "0"));
      } catch {
        continue;
      }

      /*
       * El pago debe ser igual o mayor al total.
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

      const txHash = String(tx.hash || "").trim();

      if (!txHash) {
        continue;
      }

      /*
       * Una misma transacción no puede utilizarse
       * para pagar dos pedidos.
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

    if (!matchingTransaction) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        message: "Esperando confirmación del pago...",
      });
    }

    const txHash = String(
      matchingTransaction.hash
    ).trim();

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
     * Obtenemos los productos del pedido.
     */
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    /*
     * Cantidad total de códigos necesarios.
     */
    const totalCodesNeeded = items.reduce(
      (sum, item) =>
        sum + Number(item.quantity),
      0
    );

    const deliveredCodes = [];

    /*
     * Entregamos un código por cada unidad.
     */
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

        /*
         * No hay códigos disponibles para este
         * producto.
         */
        if (!availableCode) {
          continue;
        }

        /*
         * Marcamos el código como entregado.
         */
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

    /*
     * Solo marcamos el pedido como entregado si
     * conseguimos todos los códigos necesarios.
     */
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
