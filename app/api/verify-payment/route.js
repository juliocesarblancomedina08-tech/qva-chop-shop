import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { db } from "../../../lib/db";

import {
  orders,
  giftCardCodes,
} from "../../../db/schema";

export const runtime = "nodejs";

const USDT_DECIMALS = 6;

function normalizeAddress(address) {
  return String(address || "")
    .trim()
    .toLowerCase();
}

function normalizeHash(hash) {
  return String(hash || "")
    .trim()
    .toLowerCase();
}

function isValidTxHash(hash) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function isValidBscAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function decimalToUnits(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return BigInt(
    Math.round(
      number * 10 ** USDT_DECIMALS
    )
  );
}

export async function POST(request) {
  try {
    /*
     * ------------------------------------------------
     * 1. LEER DATOS DEL CLIENTE
     * ------------------------------------------------
     */

    const body = await request.json();

    const orderId = Number(
      body?.orderId
    );

    const txHash = normalizeHash(
      body?.txHash
    );

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
        { status: 400 }
      );
    }

    if (!isValidTxHash(txHash)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El TX Hash no tiene un formato válido.",
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 2. COMPROBAR CONFIGURACIÓN
     * ------------------------------------------------
     */

    const apiKey =
      process.env.BSCSCAN_API_KEY;

    const storeWallet =
      normalizeAddress(
        process.env.STORE_WALLET_ADDRESS
      );

    const usdtContract =
      normalizeAddress(
        process.env.USDT_BEP20_CONTRACT
      );

    if (!apiKey) {
      console.error(
        "VERIFY_PAYMENT_ERROR: falta BSCSCAN_API_KEY"
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "El sistema de verificación no está configurado.",
        },
        { status: 500 }
      );
    }

    if (
      !isValidBscAddress(
        storeWallet
      )
    ) {
      console.error(
        "VERIFY_PAYMENT_ERROR: STORE_WALLET_ADDRESS inválida"
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "La billetera de recepción no está configurada correctamente.",
        },
        { status: 500 }
      );
    }

    if (
      !isValidBscAddress(
        usdtContract
      )
    ) {
      console.error(
        "VERIFY_PAYMENT_ERROR: USDT_BEP20_CONTRACT inválido"
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "El contrato USDT BEP-20 no está configurado correctamente.",
        },
        { status: 500 }
      );
    }

    /*
     * ------------------------------------------------
     * 3. BUSCAR PEDIDO
     * ------------------------------------------------
     */

    const orderResult = await db
      .select()
      .from(orders)
      .where(
        eq(
          orders.id,
          orderId
        )
      )
      .limit(1);

    const order = orderResult[0];

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
     * ------------------------------------------------
     * 4. SI YA ESTÁ PAGADO
     * ------------------------------------------------
     */

    if (
      order.status === "paid" ||
      order.status === "delivered"
    ) {
      return NextResponse.json({
        ok: true,
        message:
          "Este pedido ya fue pagado.",
        order: {
          id: order.id,
          reference:
            order.reference,
          status:
            order.status,
        },
      });
    }

    /*
     * ------------------------------------------------
     * 5. COMPROBAR EXPIRACIÓN
     * ------------------------------------------------
     */

    if (
      order.expiresAt &&
      new Date(order.expiresAt).getTime() <
        Date.now()
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este pedido ha expirado. Crea un nuevo pedido.",
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 6. COMPROBAR QUE EL TX NO SE USÓ ANTES
     * ------------------------------------------------
     */

    const existingTx = await db
      .select()
      .from(orders)
      .where(
        eq(
          orders.txHash,
          txHash
        )
      )
      .limit(1);

    if (existingTx.length > 0) {
      const previousOrder =
        existingTx[0];

      if (
        previousOrder.id !==
        order.id
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Esta transacción ya fue utilizada en otro pedido.",
          },
          { status: 400 }
        );
      }
    }

    /*
     * ------------------------------------------------
     * 7. CONSULTAR LA BLOCKCHAIN
     * ------------------------------------------------
     */

    const apiUrl =
      "https://api.bscscan.com/api" +
      "?module=account" +
      "&action=tokentx" +
      "&contractaddress=" +
      encodeURIComponent(
        usdtContract
      ) +
      "&address=" +
      encodeURIComponent(
        storeWallet
      ) +
      "&page=1" +
      "&offset=100" +
      "&sort=desc" +
      "&apikey=" +
      encodeURIComponent(
        apiKey
      );

    const blockchainResponse =
      await fetch(apiUrl, {
        method: "GET",
        cache: "no-store",
      });

    if (
      !blockchainResponse.ok
    ) {
      console.error(
        "BSCSCAN HTTP ERROR:",
        blockchainResponse.status
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo consultar la blockchain. Inténtalo nuevamente.",
        },
        { status: 502 }
      );
    }

    const blockchainData =
      await blockchainResponse.json();

    /*
     * ------------------------------------------------
     * 8. COMPROBAR RESPUESTA DE BSCSCAN
     * ------------------------------------------------
     */

    if (
      !blockchainData ||
      !Array.isArray(
        blockchainData.result
      )
    ) {
      console.error(
        "BSCSCAN INVALID RESPONSE:",
        blockchainData
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "La respuesta de la blockchain no es válida.",
        },
        { status: 502 }
      );
    }

    /*
     * ------------------------------------------------
     * 9. BUSCAR LA TRANSACCIÓN
     * ------------------------------------------------
     */

    const transaction =
      blockchainData.result.find(
        (tx) =>
          normalizeHash(
            tx.hash
          ) === txHash
      );

    if (!transaction) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No encontramos esa transacción en la red BNB Smart Chain.",
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 10. COMPROBAR CONTRATO USDT
     * ------------------------------------------------
     */

    const transactionContract =
      normalizeAddress(
        transaction.contractAddress
      );

    if (
      transactionContract !==
      usdtContract
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La transacción no corresponde al contrato USDT configurado.",
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 11. COMPROBAR DESTINO
     * ------------------------------------------------
     */

    const transactionTo =
      normalizeAddress(
        transaction.to
      );

    if (
      transactionTo !==
      storeWallet
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El pago no fue enviado a la billetera de la tienda.",
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 12. COMPROBAR QUE LA TRANSACCIÓN TERMINÓ BIEN
     * ------------------------------------------------
     */

    if (
      String(
        transaction.isError
      ) !== "0"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La transacción fue rechazada o falló.",
        },
        { status: 400 }
      );
    }

    if (
      String(
        transaction.txreceipt_status
      ) !== "1"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La transacción todavía no tiene una confirmación válida.",
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 13. COMPROBAR CONFIRMACIONES
     * ------------------------------------------------
     */

    const confirmations =
      Number(
        transaction.confirmations ||
          0
      );

    if (
      !Number.isFinite(
        confirmations
      ) ||
      confirmations < 3
    ) {
      return NextResponse.json({
        ok: false,
        pending: true,
        message:
          "El pago fue encontrado, pero todavía estamos esperando confirmaciones de la red.",
        confirmations,
        requiredConfirmations: 3,
      });
    }

    /*
     * ------------------------------------------------
     * 14. COMPROBAR IMPORTE
     * ------------------------------------------------
     */

    const blockchainAmount =
      BigInt(
        String(
          transaction.value ||
            "0"
        )
      );

    const requiredAmount =
      decimalToUnits(
        order.paymentAmountUsdt
      );

    if (
      requiredAmount === null
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El importe del pedido no es válido.",
        },
        { status: 500 }
      );
    }

    if (
      blockchainAmount <
      requiredAmount
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `El pago recibido es insuficiente. Debes enviar ${order.paymentAmountUsdt} USDT.`,
        },
        { status: 400 }
      );
    }

    /*
     * ------------------------------------------------
     * 15. MARCAR PEDIDO COMO PAGADO
     * ------------------------------------------------
     */

    const paidAt =
      new Date();

    const updatedOrders =
      await db
        .update(orders)
        .set({
          status: "paid",
          txHash,
          paidAt,
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
     * Si otro proceso lo pagó
     * primero, no volvemos a
     * procesarlo.
     */

    if (
      updatedOrders.length === 0
    ) {
      const currentOrderResult =
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

      const currentOrder =
        currentOrderResult[0];

      if (
        currentOrder?.status ===
        "paid"
      ) {
        return NextResponse.json({
          ok: true,
          message:
            "El pedido ya fue confirmado.",
          order: {
            id:
              currentOrder.id,
            reference:
              currentOrder.reference,
            status:
              currentOrder.status,
          },
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo actualizar el pedido.",
        },
        { status: 409 }
      );
    }

    /*
     * ------------------------------------------------
     * 16. OBTENER LOS CÓDIGOS RESERVADOS
     * ------------------------------------------------
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

    /*
     * ------------------------------------------------
     * 17. ENTREGAR LOS CÓDIGOS
     * ------------------------------------------------
     */

    const deliveredCodes = [];

    for (
      const code of reservedCodes
    ) {
      const updatedCodes =
        await db
          .update(giftCardCodes)
          .set({
            status: "delivered",
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

      if (
        updatedCodes.length > 0
      ) {
        deliveredCodes.push(
          updatedCodes[0]
        );
      }
    }

    /*
     * ------------------------------------------------
     * 18. MARCAR PEDIDO COMO ENTREGADO
     * ------------------------------------------------
     */

    const deliveredAt =
      new Date();

    const finalStatus =
      deliveredCodes.length > 0
        ? "delivered"
        : "paid";

    await db
      .update(orders)
      .set({
        status:
          finalStatus,
        deliveredAt:
          finalStatus ===
          "delivered"
            ? deliveredAt
            : null,
      })
      .where(
        eq(
          orders.id,
          order.id
        )
      );

    /*
     * ------------------------------------------------
     * 19. DEVOLVER CÓDIGOS AL CLIENTE
     * ------------------------------------------------
     */

    return NextResponse.json({
      ok: true,

      message:
        finalStatus ===
        "delivered"
          ? "Pago confirmado y pedido entregado."
          : "Pago confirmado. El pedido está siendo procesado.",

      order: {
        id: order.id,
        reference:
          order.reference,
        status:
          finalStatus,
      },

      codes:
        deliveredCodes.map(
          (code) => ({
            id: code.id,
            code: code.code,
            productId:
              code.productId,
          })
        ),

      transaction: {
        hash: txHash,
        confirmations,
        amountUsdt:
          Number(
            transaction.value
          ) /
          10 ** USDT_DECIMALS,
      },
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
          "Ocurrió un error al verificar el pago.",
      },
      { status: 500 }
    );
  }
            }
