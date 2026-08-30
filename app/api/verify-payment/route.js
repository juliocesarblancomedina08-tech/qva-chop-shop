import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../lib/db";
import {
  orders,
  orderItems,
  giftCardCodes,
} from "../../../db/schema";

const USDT_DECIMALS = 18;

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa" +
  "952ba7f163c4a11628f55a4df523b3ef";

function addressTopic(address) {
  return (
    "0x000000000000000000000000" +
    address
      .toLowerCase()
      .replace("0x", "")
  );
}

function toUnits(value) {
  const [whole, fraction = ""] =
    String(value).split(".");

  const padded = (
    fraction +
    "0".repeat(USDT_DECIMALS)
  ).slice(0, USDT_DECIMALS);

  return (
    BigInt(whole || "0") *
      10n ** 18n +
    BigInt(padded || "0")
  );
}

function fromHex(value) {
  return parseInt(value, 16);
}

async function rpc(rpcUrl, method, params) {
  const response = await fetch(
    rpcUrl,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: Date.now(),
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `RPC HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (data.error) {
    throw new Error(
      data.error.message ||
        "RPC error"
    );
  }

  return data.result;
}

export async function POST(request) {
  try {
    const body =
      await request.json();

    const reference =
      String(
        body?.orderReference || ""
      ).trim();

    if (!reference) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta la referencia del pedido.",
        },
        { status: 400 }
      );
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(
        eq(
          orders.reference,
          reference
        )
      )
      .limit(1);

    if (!order) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Pedido no encontrado.",
        },
        { status: 404 }
      );
    }

    /*
     * Si ya fue entregado,
     * devolvemos el resultado.
     */
    if (
      order.status ===
      "delivered"
    ) {
      const codes =
        await db
          .select({
            productId:
              giftCardCodes.productId,
            code:
              giftCardCodes.code,
          })
          .from(giftCardCodes)
          .where(
            and(
              eq(
                giftCardCodes.orderId,
                order.id
              ),
              eq(
                giftCardCodes.status,
                "delivered"
              )
            )
          );

      return NextResponse.json({
        ok: true,
        paid: true,
        delivered: true,
        codes,
      });
    }

    /*
     * Expiración.
     */
    if (
      order.expiresAt &&
      Date.now() >=
        new Date(
          order.expiresAt
        ).getTime()
    ) {

      await db
        .update(giftCardCodes)
        .set({
          status: "available",
          orderId: null,
          reservedAt: null,
        })
        .where(
          and(
            eq(
              giftCardCodes.orderId,
              order.id
            ),
            eq(
              giftCardCodes.status,
              "reserved"
            )
          )
        );

      await db
        .update(orders)
        .set({
          status: "expired",
        })
        .where(
          eq(
            orders.id,
            order.id
          )
        );

      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: true,
        message:
          "El pedido ha expirado.",
      });
    }

    const rpcUrl =
      process.env.BSC_RPC_URL ||
      "https://bsc-dataseed.binance.org";

    const wallet =
      process.env.STORE_WALLET_ADDRESS ||
      process.env
        .NEXT_PUBLIC_STORE_WALLET_ADDRESS;

    const usdt =
      process.env.USDT_BEP20_CONTRACT;

    if (!wallet || !usdt) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta configurar la billetera o el contrato USDT.",
        },
        { status: 500 }
      );
    }

    if (
      !order.paymentAmountUsdt
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El pedido no tiene un importe de pago configurado.",
        },
        { status: 500 }
      );
    }

    /*
     * Obtenemos el bloque actual.
     */
    const latestHex =
      await rpc(
        rpcUrl,
        "eth_blockNumber",
        []
      );

    const latestBlock =
      fromHex(latestHex);

    /*
     * Buscamos los últimos ~30 minutos
     * aproximadamente.
     */
    const fromBlock =
      Math.max(
        0,
        latestBlock - 700
      );

    /*
     * Buscamos transferencias USDT
     * hacia nuestra billetera.
     */
    const logs =
      await rpc(
        rpcUrl,
        "eth_getLogs",
        [
          {
            fromBlock:
              `0x${fromBlock.toString(
                16
              )}`,

            toBlock: "latest",

            address:
              usdt.toLowerCase(),

            topics: [
              TRANSFER_TOPIC,
              null,
              addressTopic(wallet),
            ],
          },
        ]
      );

    const required =
      toUnits(
        order.paymentAmountUsdt
      );

    let matchingLog = null;

    for (const log of logs) {
      try {
        const txHash =
          String(
            log.transactionHash ||
              ""
          );

        if (!txHash) {
          continue;
        }

        /*
         * No permitimos reutilizar
         * una transacción.
         */
        const [used] =
          await db
            .select({
              id: orders.id,
            })
            .from(orders)
            .where(
              eq(
                orders.txHash,
                txHash
              )
            )
            .limit(1);

        if (used) {
          continue;
        }

        const value =
          BigInt(
            log.data || "0x0"
          );

        /*
         * Exigimos el importe exacto.
         */
        if (
          value !== required
        ) {
          continue;
        }

        /*
         * Esperamos algunas confirmaciones.
         */
        const txBlock =
          fromHex(
            log.blockNumber
          );

        const confirmations =
          latestBlock -
          txBlock +
          1;

        if (
          confirmations < 3
        ) {
          continue;
        }

        matchingLog = log;
        break;

      } catch (error) {
        console.error(
          "LOG_PROCESS_ERROR:",
          error
        );
      }
    }

    /*
     * Todavía no llegó.
     */
    if (!matchingLog) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,
        message:
          "Esperando el pago...",
      });
    }

    const txHash =
      matchingLog.transactionHash;

    /*
     * Marcamos como pagado.
     */
    await db
      .update(orders)
      .set({
        status: "paid",
        txHash,
        paidAt: new Date(),
      })
      .where(
        eq(
          orders.id,
          order.id
        )
      );

    /*
     * Recuperamos los códigos
     * reservados para este pedido.
     */
    const reserved =
      await db
        .select()
        .from(giftCardCodes)
        .where(
          and(
            eq(
              giftCardCodes.orderId,
              order.id
            ),
            eq(
              giftCardCodes.status,
              "reserved"
            )
          )
        );

    const items =
      await db
        .select()
        .from(orderItems)
        .where(
          eq(
            orderItems.orderId,
            order.id
          )
        );

    const requiredCodes =
      items.reduce(
        (sum, item) =>
          sum +
          Number(
            item.quantity
          ),
        0
      );

    if (
      reserved.length <
      requiredCodes
    ) {
      return NextResponse.json(
        {
          ok: false,
          paid: true,
          delivered: false,
          error:
            "El pago llegó, pero no hay suficientes códigos reservados para completar el pedido.",
        },
        { status: 500 }
      );
    }

    const delivered = [];

    for (
      const code of reserved
    ) {

      if (
        delivered.length >=
        requiredCodes
      ) {
        break;
      }

      const [updated] =
        await db
          .update(
            giftCardCodes
          )
          .set({
            status:
              "delivered",
            deliveredAt:
              new Date(),
          })
          .where(
            and(
              eq(
                giftCardCodes.id,
                code.id
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

      if (updated) {
        delivered.push({
          productId:
            updated.productId,
          code:
            updated.code,
        });
      }
    }

    const isDelivered =
      delivered.length ===
      requiredCodes;

    if (isDelivered) {
      await db
        .update(orders)
        .set({
          status:
            "delivered",
          deliveredAt:
            new Date(),
        })
        .where(
          eq(
            orders.id,
            order.id
          )
        );
    }

    return NextResponse.json({
      ok: true,
      paid: true,
      delivered:
        isDelivered,
      expired: false,
      txHash,
      codes: delivered,
      message:
        isDelivered
          ? "Pago confirmado y pedido entregado."
          : "Pago confirmado.",
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
        debug:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
        }
