import { NextResponse } from "next/server";

import { eq, and } from "drizzle-orm";

import { db } from "../../../../lib/db";

import {
  orders,
  giftCardCodes,
} from "../../../../db/schema";

export const dynamic = "force-dynamic";

const USDT_DECIMALS = 18;

/*
 * Evento ERC-20:
 *
 * Transfer(address,address,uint256)
 */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa" +
  "952ba7f163c4a11628f55a4df523b3ef";

/*
 * Convierte una dirección en topic.
 */
function addressToTopic(address) {
  const clean = String(address || "")
    .toLowerCase()
    .replace(/^0x/, "");

  return (
    "0x000000000000000000000000" +
    clean
  );
}

/*
 * Convierte número decimal a hexadecimal RPC.
 */
function toRpcHex(number) {
  return (
    "0x" +
    Number(number).toString(16)
  );
}

/*
 * Convierte una cantidad USDT a unidades
 * de 18 decimales usando BigInt.
 */
function usdtToUnits(value) {
  const text = String(
    value ?? "0"
  ).trim();

  if (!text || text.startsWith("-")) {
    return 0n;
  }

  const parts = text.split(".");

  const whole =
    parts[0] || "0";

  const fraction =
    parts[1] || "";

  const padded = (
    fraction +
    "0".repeat(USDT_DECIMALS)
  ).slice(0, USDT_DECIMALS);

  return (
    BigInt(whole) *
      10n ** BigInt(USDT_DECIMALS) +
    BigInt(padded || "0")
  );
}

/*
 * Realiza una petición JSON-RPC.
 */
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
        "Content-Type":
          "application/json",
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

/*
 * Obtiene los códigos entregados.
 */
async function getDeliveredCodes(
  orderId
) {
  return await db
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
          orderId
        ),

        eq(
          giftCardCodes.status,
          "delivered"
        )
      )
    );
}

export async function POST(
  request
) {
  try {
    /*
     * ============================
     * 1. LEER PEDIDO
     * ============================
     */

    const body =
      await request.json();

    const orderId =
      Number(body?.orderId);

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ID de pedido inválido.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ============================
     * 2. BUSCAR PEDIDO
     * ============================
     */

    const [order] =
      await db
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
        {
          status: 404,
        }
      );
    }

    /*
     * ============================
     * 3. SI YA FUE ENTREGADO
     * ============================
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
     * ============================
     * 4. PEDIDO EXPIRADO
     * ============================
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
     * ============================
     * 5. COMPROBAR EXPIRACIÓN
     * ============================
     */

    if (
      order.expiresAt &&
      Date.now() >=
        new Date(
          order.expiresAt
        ).getTime()
    ) {
      /*
       * Liberamos códigos reservados.
       */

      await db
        .update(giftCardCodes)
        .set({
          status:
            "available",

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

      /*
       * Marcamos pedido expirado.
       */

      await db
        .update(orders)
        .set({
          status:
            "expired",
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
     * ============================
     * 6. VARIABLES DE PAGO
     * ============================
     */

    const rpcUrl =
      process.env.BSC_RPC_URL;

    const wallet =
      process.env.STORE_WALLET_ADDRESS ||
      process.env
        .NEXT_PUBLIC_STORE_WALLET_ADDRESS;

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
          rpc:
            Boolean(rpcUrl),

          wallet:
            Boolean(wallet),

          contract:
            Boolean(
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
        {
          status: 500,
        }
      );
    }

    const destination =
      wallet.toLowerCase();

    const contract =
      usdtContract.toLowerCase();

    /*
     * ============================
     * 7. CANTIDAD EXACTA DEL PEDIDO
     * ============================
     *
     * IMPORTANTE:
     *
     * Usamos paymentAmountUsdt,
     * NO totalUsdt.
     *
     */

    const requiredValue =
      usdtToUnits(
        order.paymentAmountUsdt
      );

    if (
      requiredValue <= 0n
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "La cantidad de pago del pedido no es válida.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================
     * 8. BLOQUE ACTUAL
     * ============================
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
     * Buscamos aproximadamente
     * los últimos 20 minutos.
     *
     * BSC produce bloques muy rápido,
     * por eso utilizamos una ventana
     * limitada para evitar errores
     * de RPC.
     */

    const BLOCK_WINDOW = 2500;

    const fromBlock =
      Math.max(
        0,
        latestBlock -
          BLOCK_WINDOW
      );

    /*
     * ============================
     * 9. BUSCAR TRANSFERENCIAS USDT
     * ============================
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

            /*
             * SOLO este contrato.
             */

            address:
              contract,

            /*
             * Evento Transfer.
             *
             * topics[2] =
             * dirección receptora.
             */

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
        "Respuesta RPC inválida."
      );
    }

    /*
     * ============================
     * 10. BUSCAR PAGO CORRECTO
     * ============================
     */

    let matchingLog =
      null;

    for (
      const log of logs
    ) {
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
         * Evitamos utilizar
         * una transacción que
         * ya haya sido utilizada.
         */

        const [
          alreadyUsed,
        ] = await db
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

        if (alreadyUsed) {
          continue;
        }

        /*
         * Cantidad enviada.
         */

        const value =
          BigInt(
            log.data ||
              "0x0"
          );

        /*
         * El pago debe cubrir
         * como mínimo la cantidad
         * exacta solicitada.
         */

        if (
          value <
          requiredValue
        ) {
          continue;
        }

        /*
         * Encontramos un pago
         * compatible.
         */

        matchingLog =
          log;

        break;
      } catch (
        logError
      ) {
        console.error(
          "PAYMENT_LOG_ERROR:",
          logError
        );
      }
    }

    /*
     * ============================
     * 11. TODAVÍA NO PAGÓ
     * ============================
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

    /*
     * ============================
     * 12. OBTENER TX HASH
     * ============================
     */

    const txHash =
      String(
        matchingLog.transactionHash
      );

    /*
     * ============================
     * 13. VERIFICAR RECEIPT
     * ============================
     *
     * Nos aseguramos de que la
     * transacción realmente terminó
     * correctamente.
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
          "Pago detectado. Esperando confirmación de la red...",
      });
    }

    /*
     * status 0x1 = éxito.
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
          "La transacción no fue confirmada correctamente.",
      });
    }

    /*
     * ============================
     * 14. CONFIRMACIONES
     * ============================
     *
     * Esperamos varias confirmaciones
     * antes de entregar el código.
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
          `Pago detectado. Esperando confirmaciones (${confirmations}/${REQUIRED_CONFIRMATIONS})...`,
      });
    }

    /*
     * ============================
     * 15. COMPROBAR CÓDIGOS
     * ============================
     */

    const reservedCodes =
      await db
        .select()
        .from(
          giftCardCodes
        )
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
      /*
       * Puede que otro intento
       * ya haya entregado los códigos.
       */

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
            "El pedido no tiene códigos reservados disponibles.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================
     * 16. MARCAR PAGO
     * ============================
     */

    await db
      .update(orders)
      .set({
        status: "paid",

        txHash,

        paidAt:
          new Date(),
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
      );

    /*
     * ============================
     * 17. ENTREGAR CÓDIGOS
     * ============================
     */

    const deliveredCodes =
      [];

    for (
      const reservedCode of
        reservedCodes
    ) {
      const [
        updatedCode,
      ] = await db
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
     * ============================
     * 18. COMPROBAR ENTREGA
     * ============================
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
            "El pago fue confirmado, pero no se pudieron entregar todos los códigos.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================
     * 19. MARCAR PEDIDO ENTREGADO
     * ============================
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

    /*
     * ============================
     * 20. RESPUESTA FINAL
     * ============================
     */

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
      {
        status: 500,
      }
    );
  }
}
