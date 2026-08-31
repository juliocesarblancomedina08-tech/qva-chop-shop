import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db } from "../../../lib/db";

import {
  orders,
  giftCardCodes,
} from "../../../db/schema";

export const dynamic = "force-dynamic";

const USDT_DECIMALS = 18;

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa" +
  "952ba7f163c4a11628f55a4df523b3ef";

function addressToTopic(address) {
  const clean = String(address || "")
    .toLowerCase()
    .replace(/^0x/, "");

  if (!/^[0-9a-f]{40}$/.test(clean)) {
    throw new Error("Dirección de wallet inválida.");
  }

  return (
    "0x000000000000000000000000" +
    clean
  );
}

function toRpcHex(number) {
  return (
    "0x" +
    Number(number).toString(16)
  );
}

function usdtToUnits(value) {
  const text = String(value ?? "0").trim();

  if (!text || text.startsWith("-")) {
    return 0n;
  }

  const parts = text.split(".");

  const whole = parts[0] || "0";
  const fraction = parts[1] || "";

  if (!/^\d+$/.test(whole)) {
    throw new Error("Cantidad USDT inválida.");
  }

  if (fraction && !/^\d+$/.test(fraction)) {
    throw new Error("Cantidad USDT inválida.");
  }

  if (fraction.length > USDT_DECIMALS) {
    throw new Error("Cantidad USDT con demasiados decimales.");
  }

  const padded =
    fraction +
    "0".repeat(
      USDT_DECIMALS - fraction.length
    );

  return (
    BigInt(whole) *
      10n ** BigInt(USDT_DECIMALS) +
    BigInt(padded || "0")
  );
}

async function rpcRequest(
  rpcUrl,
  method,
  params
) {
  const response = await fetch(
    rpcUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `RPC HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      data.error.message ||
        "Error RPC de BNB Smart Chain."
    );
  }

  return data.result;
}

async function getDeliveredCodes(orderId) {
  return await db
    .select({
      productId: giftCardCodes.productId,
      code: giftCardCodes.code,
    })
    .from(giftCardCodes)
    .where(
      and(
        eq(
          giftCardCodes.orderId,
          orderId
        ),
        eq(
          giftCardCodes.status,
          "delivered"
        )
      )
    );
}

export async function POST(request) {
  try {
    const body = await request.json();

    const orderId = Number(
      body?.orderId
    );

    const reference = String(
      body?.reference || ""
    ).trim();

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0 ||
      !reference
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ID o referencia de pedido inválidos.",
        },
        { status: 400 }
      );
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(
        eq(
          orders.id,
          orderId
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

    if (
      order.reference !== reference
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Referencia de pedido inválida.",
        },
        { status: 403 }
      );
    }

    /*
     * PEDIDO YA ENTREGADO
     */

    if (
      order.status ===
      "delivered"
    ) {
      const codes =
        await getDeliveredCodes(
          order.id
        );

      return NextResponse.json({
        ok: true,
        paid: true,
        delivered: true,
        expired: false,

        order: {
          id: order.id,
          reference:
            order.reference,
          status: "delivered",
        },

        codes,
      });
    }

    /*
     * PEDIDO EXPIRADO
     */

    if (
      order.status ===
      "expired"
    ) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: true,

        order: {
          id: order.id,
          reference:
            order.reference,
          status: "expired",
        },

        message:
          "Este pedido ha vencido.",
      });
    }

    /*
     * COMPROBAR EXPIRACIÓN
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

        order: {
          id: order.id,
          reference:
            order.reference,
          status: "expired",
        },

        message:
          "El tiempo para realizar el pago ha terminado.",
      });
    }

    /*
     * CONFIGURACIÓN
     */

    const rpcUrl =
      process.env.BSC_RPC_URL;

    const wallet =
      process.env.STORE_WALLET_ADDRESS;

    const usdtContract =
      process.env.USDT_BEP20_CONTRACT;

    if (
      !rpcUrl ||
      !wallet ||
      !usdtContract
    ) {
      console.error(
        "PAYMENT_CONFIG_ERROR",
        {
          rpc: Boolean(rpcUrl),
          wallet: Boolean(wallet),
          contract: Boolean(
            usdtContract
          ),
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Faltan variables de configuración del pago.",
        },
        { status: 500 }
      );
    }

    const destination =
      wallet.toLowerCase();

    const contract =
      usdtContract.toLowerCase();

    if (
      !/^0x[a-f0-9]{40}$/.test(
        destination
      )
    ) {
      throw new Error(
        "STORE_WALLET_ADDRESS no es válida."
      );
    }

    if (
      !/^0x[a-f0-9]{40}$/.test(
        contract
      )
    ) {
      throw new Error(
        "USDT_BEP20_CONTRACT no es válida."
      );
    }

    /*
     * CANTIDAD EXACTA
     *
     * Esta cantidad es la que el cliente
     * debe enviar.
     */

    const requiredValue =
      usdtToUnits(
        order.paymentAmountUsdt
      );

    if (
      requiredValue <= 0n
    ) {
      throw new Error(
        "Cantidad de pago inválida."
      );
    }

    /*
     * BLOQUE ACTUAL
     */

    const latestBlockHex =
      await rpcRequest(
        rpcUrl,
        "eth_blockNumber",
        []
      );

    const latestBlock =
      parseInt(
        latestBlockHex,
        16
      );

    /*
     * Buscamos una ventana amplia
     * suficiente para el período del pedido.
     */

    const BLOCK_WINDOW = 10000;

    const fromBlock =
      Math.max(
        0,
        latestBlock -
          BLOCK_WINDOW
      );

    /*
     * BUSCAR TRANSFERENCIAS USDT
     */

    const logs =
      await rpcRequest(
        rpcUrl,
        "eth_getLogs",
        [
          {
            fromBlock:
              toRpcHex(
                fromBlock
              ),

            toBlock:
              "latest",

            address:
              contract,

            topics: [
              TRANSFER_TOPIC,
              null,
              addressToTopic(
                destination
              ),
            ],
          },
        ]
      );

    if (
      !Array.isArray(logs)
    ) {
      throw new Error(
        "Respuesta inválida de la blockchain."
      );
    }

    /*
     * BUSCAR EL PAGO EXACTO
     */

    let matchingLog = null;

    for (
      const log of logs
    ) {
      try {
        const txHash =
          String(
            log?.transactionHash ||
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
            log?.data ||
              "0x0"
          );

        /*
         * IMPORTANTE:
         *
         * Debe ser EXACTAMENTE la cantidad
         * generada para este pedido.
         *
         * No usamos >= porque eso podría
         * permitir asociar el pago de otra
         * persona.
         */

        if (
          value !==
          requiredValue
        ) {
          continue;
        }

        matchingLog =
          log;

        break;
      } catch (error) {
        console.error(
          "PAYMENT_LOG_ERROR:",
          error
        );
      }
    }

    /*
     * TODAVÍA NO HAY PAGO
     */

    if (!matchingLog) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,

        order: {
          id: order.id,
          reference:
            order.reference,
          status:
            order.status,
        },

        message:
          "Esperando el pago...",
      });
    }

    const txHash =
      String(
        matchingLog.transactionHash
      );

    /*
     * COMPROBAR RECEIPT
     */

    const receipt =
      await rpcRequest(
        rpcUrl,
        "eth_getTransactionReceipt",
        [txHash]
      );

    if (!receipt) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,

        order: {
          id: order.id,
          reference:
            order.reference,
          status:
            order.status,
        },

        message:
          "Pago detectado. Esperando confirmación...",
      });
    }

    /*
     * LA TRANSACCIÓN DEBE HABER TERMINADO
     * CORRECTAMENTE.
     */

    if (
      receipt.status !==
      "0x1"
    ) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,

        order: {
          id: order.id,
          reference:
            order.reference,
          status:
            order.status,
        },

        message:
          "La transacción no fue confirmada.",
      });
    }

    /*
     * CONFIRMACIONES
     */

    const transactionBlock =
      parseInt(
        receipt.blockNumber,
        16
      );

    const confirmations =
      latestBlock -
      transactionBlock +
      1;

    const REQUIRED_CONFIRMATIONS = 3;

    if (
      confirmations <
      REQUIRED_CONFIRMATIONS
    ) {
      return NextResponse.json({
        ok: true,
        paid: false,
        delivered: false,
        expired: false,

        order: {
          id: order.id,
          reference:
            order.reference,
          status:
            order.status,
        },

        confirmations,

        requiredConfirmations:
          REQUIRED_CONFIRMATIONS,

        message:
          `Pago detectado. Confirmaciones ${confirmations}/${REQUIRED_CONFIRMATIONS}...`,
      });
    }

    /*
     * CÓDIGOS RESERVADOS
     */

    const reservedCodes =
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

    if (
      reservedCodes.length ===
      0
    ) {
      const deliveredCodes =
        await getDeliveredCodes(
          order.id
        );

      if (
        deliveredCodes.length >
        0
      ) {
        await db
          .update(orders)
          .set({
            status:
              "delivered",

            txHash,

            paidAt:
              order.paidAt ||
              new Date(),

            deliveredAt:
              order.deliveredAt ||
              new Date(),
          })
          .where(
            eq(
              orders.id,
              order.id
            )
          );

        return NextResponse.json({
          ok: true,
          paid: true,
          delivered: true,
          expired: false,

          order: {
            id: order.id,
            reference:
              order.reference,
            status:
              "delivered",
          },

          txHash,
          codes:
            deliveredCodes,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "El pedido no tiene códigos reservados.",
        },
        { status: 500 }
      );
    }

    /*
     * MARCAR COMO PAGADO
     */

    const [updatedOrder] =
      await db
        .update(orders)
        .set({
          status: "paid",
          txHash,
          paidAt: new Date(),
        })
        .where(
          and(
            eq(
              orders.id,
              order.id
            ),
            eq(
              orders.status,
              "pending"
            )
          )
        )
        .returning();

    /*
     * Si otro proceso ya lo marcó,
     * volvemos a leer los códigos.
     */

    if (!updatedOrder) {
      const [currentOrder] =
        await db
          .select()
          .from(orders)
          .where(
            eq(
              orders.id,
              order.id
            )
          )
          .limit(1);

      if (
        currentOrder?.status ===
        "delivered"
      ) {
        const codes =
          await getDeliveredCodes(
            order.id
          );

        return NextResponse.json({
          ok: true,
          paid: true,
          delivered: true,
          expired: false,

          order: {
            id: order.id,
            reference:
              order.reference,
            status:
              "delivered",
          },

          txHash,
          codes,
        });
      }
    }

    /*
     * ENTREGAR CÓDIGOS
     */

    const deliveredCodes = [];

    for (
      const reservedCode of
        reservedCodes
    ) {
      const [
        updatedCode,
      ] = await db
        .update(giftCardCodes)
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
              reservedCode.id
            ),

            eq(
              giftCardCodes.orderId,
              order.id
            ),

            eq(
              giftCardCodes.status,
              "reserved"
            )
          )
        )
        .returning();

      if (updatedCode) {
        deliveredCodes.push({
          productId:
            updatedCode.productId,

          code:
            updatedCode.code,
        });
      }
    }

    /*
     * VERIFICAR ENTREGA
     */

    if (
      deliveredCodes.length !==
      reservedCodes.length
    ) {
      console.error(
        "PARTIAL_DELIVERY",
        {
          orderId:
            order.id,

          reserved:
            reservedCodes.length,

          delivered:
            deliveredCodes.length,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          paid: true,
          delivered: false,

          error:
            "El pago fue confirmado, pero hubo un problema entregando los códigos.",
        },
        { status: 500 }
      );
    }

    /*
     * MARCAR COMO ENTREGADO
     */

    await db
      .update(orders)
      .set({
        status:
          "delivered",

        txHash,

        paidAt:
          order.paidAt ||
          new Date(),

        deliveredAt:
          new Date(),
      })
      .where(
        eq(
          orders.id,
          order.id
        )
      );

    return NextResponse.json({
      ok: true,

      paid: true,

      delivered: true,

      expired: false,

      order: {
        id: order.id,

        reference:
          order.reference,

        status:
          "delivered",
      },

      txHash,

      confirmations,

      codes:
        deliveredCodes,

      message:
        "Pago confirmado y pedido entregado.",
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
