import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "../../../lib/db";
import {
  orders,
  orderItems,
  giftCardCodes,
} from "../../../db/schema";

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
        expired: false,
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

    /*
     * Comprobamos si el tiempo del pedido terminó.
     */
    const now = new Date();

    if (
      order.expiresAt &&
      now.getTime() >=
        new Date(order.expiresAt).getTime()
    ) {
      /*
       * Liberamos los códigos reservados
       * exclusivamente para este pedido.
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
     * Configuración del pago.
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
     * API V2 de Etherscan/BscScan.
     * chainid=56 corresponde a BNB Smart Chain.
     */
    const url =
      `https://api.etherscan.io/v2/api` +
      `?chainid=56` +
      `&module=account` +
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
      console.error(
        "BSCSCAN_HTTP_ERROR:",
        response.status
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo consultar el explorador de pagos.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    /*
     * Esto aparecerá en los logs del servidor
     * y nos ayudará a diagnosticar problemas.
     */
    console.log(
      "PAYMENT_API_RESPONSE:",
      JSON.stringify(data)
    );

    if (!Array.isArray(data.result)) {
      console.error(
        "PAYMENT_API_INVALID_RESULT:",
        data
      );

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
     * Usamos los decimales que devuelve la propia
     * transacción, evitando asumir siempre 18.
     */
    const orderAmount = Number(order.totalUsdt);

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

      const decimals = Number(
        tx.tokenDecimal || 18
      );

      /*
       * BigInt evita errores de precisión con
       * cantidades grandes en la unidad mínima.
       */
      let txValue = 0n;

      try {
        txValue = BigInt(tx.value || "0");
      } catch {
        continue;
      }

      const requiredValue = BigInt(
        Math.round(
          orderAmount * 10 ** decimals
        )
      );

      if (
        txTo !== destination ||
        txContract !==
          usdtContract.toLowerCase()
      ) {
        continue;
      }

      /*
       * El pago debe ser igual o superior
       * al total del pedido.
       */
      if (txValue < requiredValue) {
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
       * Evitamos reutilizar una misma
       * transacción para otro pedido.
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
     * Aún no se detectó un pago válido.
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
     * Obtenemos únicamente los códigos
     * reservados para este pedido.
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
     * Obtenemos la cantidad de códigos
     * necesarios para el pedido.
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
     * Por seguridad no entregamos códigos
     * diferentes a los reservados.
     */
    if (
      reservedCodes.length !== totalCodesNeeded
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "El pedido no tiene todos los códigos reservados.",
        },
        { status: 500 }
      );
    }

    /*
     * Convertimos los códigos reservados
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
