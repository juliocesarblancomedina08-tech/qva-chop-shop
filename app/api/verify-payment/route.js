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

    if (
      order.expiresAt &&
      now.getTime() >= new Date(order.expiresAt).getTime()
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

    const rpcUrl = process.env.BSC_RPC_URL;

    const wallet =
      process.env.STORE_WALLET_ADDRESS ||
      process.env.NEXT_PUBLIC_STORE_WALLET_ADDRESS;

    const usdtContract = process.env.USDT_BEP20_CONTRACT;

    if (!rpcUrl || !wallet || !usdtContract) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan variables de configuración del pago.",
        },
        { status: 500 }
      );
    }

    const destination = wallet.toLowerCase();
    const contract = usdtContract.toLowerCase();

    const latestBlockResponse = await fetch(rpcUrl, {
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
    });

    if (!latestBlockResponse.ok) {
      console.error(
        "RPC_HTTP_ERROR:",
        latestBlockResponse.status
      );

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo conectar con la blockchain.",
        },
        { status: 502 }
      );
    }

    const latestBlockData = await latestBlockResponse.json();

    if (
      !latestBlockData.result ||
      latestBlockData.error
    ) {
      console.error(
        "RPC_BLOCK_ERROR:",
        latestBlockData
      );

      return NextResponse.json({
        ok: false,
        error: "No se pudo consultar la blockchain.",
      });
    }

    const latestBlock = parseInt(
      latestBlockData.result,
      16
    );

    const fromBlock = Math.max(
      0,
      latestBlock - 500
    );

    const logsResponse = await fetch(rpcUrl, {
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
    });

    if (!logsResponse.ok) {
      console.error(
        "RPC_LOGS_HTTP_ERROR:",
        logsResponse.status
      );

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudieron consultar los pagos.",
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

      return NextResponse.json({
        ok: false,
        error: "No se pudieron consultar los pagos.",
      });
    }

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

    await db
      .update(orders)
      .set({
        status: "paid",
        txHash,
        paidAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    const reservedCodes = await db
      .select()
      .from(giftCardCodes)
      .where(
        and(
          eq(giftCardCodes.orderId, order.id),
          eq(giftCardCodes.status, "reserved")
        )
      );

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const totalCodesNeeded = items.reduce(
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
