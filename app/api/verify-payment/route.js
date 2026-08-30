import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../lib/db";
import {
  orders,
  orderItems,
  giftCardCodes,
} from "../../../db/schema";

/*
 * USDT BEP-20 utiliza 18 decimales.
 */
const USDT_DECIMALS = 18;

/*
 * Firma del evento Transfer(address,address,uint256)
 */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa" +
  "952ba7f163c4a11628f55a4df523b3ef";

function toAddressTopic(address) {
  return (
    "0x000000000000000000000000" +
    address.toLowerCase().replace("0x", "")
  );
}

function formatRpcHex(number) {
  return `0x${number.toString(16)}`;
}

function decimalToUnits(value, decimals) {
  const text = String(value || "0").trim();

  if (!text || text.startsWith("-")) {
    return 0n;
  }

  const parts = text.split(".");
  const whole = parts[0] || "0";
  const fraction = parts[1] || "";

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

    /*
     * Buscamos el pedido.
     */
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
     * Si ya fue entregado, devolvemos los códigos.
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
        expired: false,
        codes: deliveredCodes,
      });
    }

    /*
     * Un pedido vencido no puede volver a usarse.
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

    /*
     * Comprobamos el tiempo límite.
     */
    const now = new Date();

    if (
      order.expiresAt &&
      now.getTime() >= new Date(order.expiresAt).getTime()
    ) {
      /*
       * Liberamos los códigos reservados.
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
        message: "El tiempo para realizar el pago ha terminado.",
      });
    }

    /*
     * Variables de configuración.
     */
    const rpcUrl = process.env.BSC_RPC_URL;

    const wallet =
      process.env.STORE_WALLET_ADDRESS ||
      process.env.NEXT_PUBLIC_STORE_WALLET_ADDRESS;

    const usdtContract =
      process.env.USDT_BEP20_CONTRACT;

    /*
     * Diagnóstico de variables.
     * No muestra los valores secretos, solamente
     * confirma si están disponibles.
     */
    if (!rpcUrl || !wallet || !usdtContract) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan variables de configuración del pago.",
          debug: {
            rpcConfigured: Boolean(rpcUrl),
            walletConfigured: Boolean(wallet),
            contractConfigured: Boolean(usdtContract),
          },
        },
        { status: 500 }
      );
    }

    const destination = wallet.toLowerCase();
    const contract = usdtContract.toLowerCase();

    /*
     * Consultamos el bloque más reciente.
     */
    const latestBlockResponse = await fetch(
      rpcUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
        cache: "no-store",
      }
    );

    if (!latestBlockResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "El servidor RPC no respondió correctamente.",
          debug: {
            rpcStatus: latestBlockResponse.status,
          },
        },
        { status: 502 }
      );
    }

    const latestBlockData =
      await latestBlockResponse.json();

    if (
      !latestBlockData.result ||
      latestBlockData.error
    ) {
      console.error(
        "RPC_BLOCK_ERROR:",
        latestBlockData
      );

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo consultar la blockchain.",
          debug: {
            rpcError: latestBlockData.error
              ? String(latestBlockData.error.message || "RPC error")
              : null,
          },
        },
        { status: 502 }
      );
    }

    const latestBlock = parseInt(
      latestBlockData.result,
      16
    );

    /*
     * Buscamos transferencias recientes.
     */
    const fromBlock = Math.max(
      0,
      latestBlock - 500
    );

    /*
     * Buscamos eventos Transfer de USDT hacia
     * nuestra billetera.
     */
    const logsResponse = await fetch(
      rpcUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getLogs",
          params: [
            {
              fromBlock: formatRpcHex(fromBlock),
              toBlock: "latest",
              address: contract,
              topics: [
                TRANSFER_TOPIC,
                null,
                toAddressTopic(destination),
              ],
            },
          ],
          id: 2,
        }),
        cache: "no-store",
      }
    );

    if (!logsResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo consultar el historial de pagos.",
          debug: {
            rpcStatus: logsResponse.status,
          },
        },
        { status: 502 }
      );
    }

    const logsData = await logsResponse.json();

    if (
      logsData.error ||
      !Array.isArray(logsData.result)
    ) {
      console.error(
        "RPC_LOGS_ERROR:",
        logsData
      );

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudieron consultar los pagos.",
          debug: {
            rpcError: logsData.error
              ? String(logsData.error.message || "RPC error")
              : null,
          },
        },
        { status: 502 }
      );
    }

    /*
     * Cantidad exacta requerida.
     */
    const requiredValue = decimalToUnits(
      order.totalUsdt,
      USDT_DECIMALS
    );

    let matchingLog = null;

    for (const log of logsData.result) {
      try {
        const txHash = String(
          log.transactionHash || ""
        );

        if (!txHash) {
          continue;
        }

        /*
         * Evitamos reutilizar una transacción.
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

        const value = BigInt(
          log.data || "0x0"
        );

        if (value < requiredValue) {
          continue;
        }

        matchingLog = log;
        break;
      } catch (error) {
        console.error(
          "RPC_LOG_PROCESS_ERROR:",
          error
        );
      }
    }

    /*
     * Todavía no encontramos un pago.
     */
    if (!matchingLog) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,
        message: "Esperando el pago...",
      });
    }

    const txHash =
      matchingLog.transactionHash;

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
     * Buscamos los códigos reservados.
     */
    const reservedCodes = await db
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

    const items = await db
      .select()
      .from(orderItems)
      .where(
        eq(
          orderItems.orderId,
          order.id
        )
      );

    const totalCodesNeeded =
      items.reduce(
        (sum, item) =>
          sum + Number(item.quantity),
        0
      );

    if (
      reservedCodes.length !== totalCodesNeeded
    ) {
      return NextResponse.json(
        {
          ok: false,
          paid: true,
          delivered: false,
          error:
            "El pedido no tiene todos los códigos reservados.",
        },
        { status: 500 }
      );
    }

    /*
     * Entregamos exclusivamente los códigos
     * reservados para este pedido.
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
          productId:
            updatedCode.productId,
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

    /*
     * Temporalmente devolvemos información básica
     * del error para poder diagnosticarlo.
     */
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno al verificar el pago.",
        debug:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
        }
