"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function PaymentPage() {
  const [order, setOrder] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  const intervalRef = useRef(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    loadOrder();
    loadCart();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!order?.id) return;

    startAutomaticVerification();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [order?.id]);

  function loadOrder() {
    try {
      const savedOrder =
        localStorage.getItem("qva_order");

      if (!savedOrder) {
        setError(
          "No se encontró el pedido. Regresa al checkout e inténtalo nuevamente."
        );
        setChecking(false);
        return;
      }

      const parsedOrder =
        JSON.parse(savedOrder);

      if (!parsedOrder?.id) {
        setError("El pedido no es válido.");
        setChecking(false);
        return;
      }

      setOrder(parsedOrder);
    } catch (error) {
      console.error(
        "LOAD_ORDER_ERROR:",
        error
      );

      setError(
        "No se pudo cargar el pedido."
      );

      setChecking(false);
    }
  }

  function loadCart() {
    try {
      const savedCart =
        localStorage.getItem("qva_cart");

      if (!savedCart) {
        setCart([]);
        return;
      }

      const parsed =
        JSON.parse(savedCart);

      if (!Array.isArray(parsed)) {
        setCart([]);
        return;
      }

      setCart(
        parsed.map((item) => ({
          productId: Number(
            item?.productId
          ),

          diamonds: String(
            item?.diamonds || ""
          ),

          price: Number(
            item?.price || 0
          ),

          quantity: Math.max(
            1,
            Number(
              item?.quantity || 1
            )
          ),
        }))
      );
    } catch (error) {
      console.error(
        "LOAD_PAYMENT_CART_ERROR:",
        error
      );

      setCart([]);
    }
  }

  const total = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.price || 0) *
        Number(item.quantity || 1),
    0
  );

  const paymentAmount = Number(
    order?.paymentAmountUsdt ||
      total ||
      0
  );

  /*
   * Dirección pública de la billetera
   * donde recibirás los USDT.
   */
  const walletAddress =
    process.env
      .NEXT_PUBLIC_STORE_WALLET_ADDRESS ||
    "";

  const qrUrl = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
        walletAddress
      )}`
    : "";

  async function copyAddress() {
    if (!walletAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        walletAddress
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(
        "COPY_ADDRESS_ERROR:",
        error
      );

      alert(
        "No se pudo copiar la dirección."
      );
    }
  }

  async function copyAmount() {
    try {
      await navigator.clipboard.writeText(
        paymentAmount.toFixed(6)
      );

      setCopiedAmount(true);

      setTimeout(() => {
        setCopiedAmount(false);
      }, 2000);
    } catch (error) {
      console.error(
        "COPY_AMOUNT_ERROR:",
        error
      );

      alert(
        "No se pudo copiar la cantidad."
      );
    }
  }

  async function checkPayment() {
    if (!order?.id) {
      return false;
    }

    if (checkingRef.current) {
      return false;
    }

    checkingRef.current = true;

    try {
      const response = await fetch(
        "/api/verify-payment",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            orderId: order.id,
          }),

          cache: "no-store",
        }
      );

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (
        !response.ok ||
        !data?.ok
      ) {
        console.log(
          "PAYMENT_CHECK:",
          data?.error ||
            "Pago todavía no detectado."
        );

        return false;
      }

      localStorage.setItem(
        "qva_payment_result",
        JSON.stringify(data)
      );

      if (
        data?.order?.status === "paid" ||
        data?.order?.status === "delivered" ||
        data?.status === "paid" ||
        data?.status === "delivered"
      ) {
        if (intervalRef.current) {
          clearInterval(
            intervalRef.current
          );
        }

        setChecking(false);
        setLoading(false);

        window.location.href =
          `/success?order=${encodeURIComponent(
            order.id
          )}`;

        return true;
      }

      return false;
    } catch (error) {
      console.error(
        "AUTOMATIC_PAYMENT_CHECK_ERROR:",
        error
      );

      return false;
    } finally {
      checkingRef.current = false;
    }
  }

  function startAutomaticVerification() {
    if (intervalRef.current) {
      clearInterval(
        intervalRef.current
      );
    }

    setChecking(true);

    /*
     * Primera comprobación inmediatamente.
     */
    checkPayment();

    /*
     * Después comprobamos cada 5 segundos.
     */
    intervalRef.current =
      setInterval(() => {
        checkPayment();
      }, 5000);
  }

  return (
    <main className="payment-page">

      {/* HEADER */}

      <header className="checkout-header">

        <Link
          href="/"
          className="checkout-logo"
        >
          🎮 Qva🇨🇺CHOP 🛒
        </Link>

        <div className="checkout-secure">
          🔒 Pago seguro
        </div>

      </header>

      {/* CONTENIDO */}

      <div className="payment-container">

        <div className="payment-main">

          {/* TÍTULO */}

          <div className="checkout-heading">

            <p className="checkout-step">
              PASO 2 DE 2
            </p>

            <h1>
              Completa tu pago
            </h1>

            <p>
              Realiza el pago utilizando
              USDT en la red BNB Smart
              Chain (BEP-20).
            </p>

          </div>

          {/* PEDIDO */}

          {order && (

            <section className="checkout-box">

              <div className="payment-small-title">
                PEDIDO
              </div>

              <strong>
                {order.reference}
              </strong>

            </section>

          )}

          {/* IMPORTE */}

          <section className="checkout-box payment-total-box">

            <div>

              <p className="payment-small-title">
                TOTAL A PAGAR
              </p>

              <div className="payment-big-amount">

                {paymentAmount.toFixed(6)}

                <span>
                  {" "}USDT
                </span>

              </div>

            </div>

            <div className="payment-network">
              BEP-20
            </div>

          </section>

          {/* MÉTODO */}

          <section className="checkout-box">

            <h2 className="payment-section-title">
              Método de pago
            </h2>

            <div className="payment-method">

              <div className="payment-method-icon">
                🪙
              </div>

              <div>

                <strong>
                  Tether USD (USDT)
                </strong>

                <span>
                  BNB Smart Chain · BEP-20
                </span>

              </div>

            </div>

          </section>

          {/* QR + DIRECCIÓN */}

          <section className="checkout-box">

            <h2 className="payment-section-title">
              Realiza el pago
            </h2>

            <p className="payment-text">
              Escanea el código QR o copia
              la dirección de la billetera.
            </p>

            <div className="payment-qr-card">

              {qrUrl ? (

                <img
                  src={qrUrl}
                  alt="QR de pago USDT BEP-20"
                  className="payment-qr-image"
                />

              ) : (

                <div className="qr-placeholder-large">
                  QR
                </div>

              )}

            </div>

            <p className="qr-caption">
              Escanea para copiar la dirección
              de pago
            </p>

            {/* DIRECCIÓN */}

            <div className="payment-address-box">

              <code>
                {walletAddress ||
                  "Dirección no configurada"}
              </code>

              <button
                type="button"
                onClick={copyAddress}
                className="copy-button"
                disabled={!walletAddress}
              >
                {copied
                  ? "✓ COPIADO"
                  : "📋 COPIAR"}
              </button>

            </div>

            {/* CANTIDAD */}

            <div
              style={{
                marginTop: "12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px",
                borderRadius: "12px",
                background:
                  "rgba(255,255,255,0.04)",
                border:
                  "1px solid rgba(255,255,255,0.10)",
              }}
            >

              <div
                style={{
                  flex: 1,
                }}
              >

                <div
                  style={{
                    fontSize: "12px",
                    opacity: 0.65,
                    marginBottom: "5px",
                  }}
                >
                  CANTIDAD EXACTA A ENVIAR
                </div>

                <strong
                  style={{
                    fontSize: "18px",
                  }}
                >
                  {paymentAmount.toFixed(6)}
                  {" "}USDT
                </strong>

              </div>

              <button
                type="button"
                onClick={copyAmount}
                className="copy-button"
              >
                {copiedAmount
                  ? "✓ COPIADO"
                  : "📋 COPIAR"}
              </button>

            </div>

            <div className="payment-warning">

              ⚠️{" "}
              <strong>
                Importante:
              </strong>{" "}
              envía únicamente USDT por
              la red BEP-20. No utilices
              otra red.

            </div>

          </section>

          {/* VERIFICACIÓN AUTOMÁTICA */}

          <section className="checkout-box">

            <h2 className="payment-section-title">
              Verificación automática
            </h2>

            <p className="payment-text">
              Después de realizar el pago,
              no necesitas introducir ningún
              TX Hash.
            </p>

            <div
              style={{
                marginTop: "16px",
                padding: "18px",
                borderRadius: "12px",
                background:
                  "rgba(255,255,255,0.04)",
                border:
                  "1px solid rgba(255,255,255,0.08)",
                textAlign: "center",
              }}
            >

              <div
                style={{
                  fontSize: "28px",
                  marginBottom: "8px",
                }}
              >
                {checking
                  ? "⏳"
                  : "✅"}
              </div>

              <strong>
                {checking
                  ? "Esperando tu pago..."
                  : "Pago detectado"}
              </strong>

              <p
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  opacity: 0.65,
                }}
              >
                {checking
                  ? "Estamos comprobando automáticamente la blockchain."
                  : "Preparando la entrega de tu pedido."}
              </p>

            </div>

            {error && (

              <div
                style={{
                  marginTop: "14px",
                  padding: "14px",
                  borderRadius: "10px",
                  background:
                    "rgba(255,60,60,0.10)",
                  border:
                    "1px solid rgba(255,60,60,0.35)",
                  color: "#ff6b6b",
                }}
              >
                ⚠️ {error}
              </div>

            )}

          </section>

          <Link
            href="/cart"
            className="back-link"
          >
            ← Volver al carrito
          </Link>

        </div>

        {/* RESUMEN */}

        <aside className="checkout-summary">

          <div className="summary-header">

            <h2>
              Tu pedido
            </h2>

            <span>
              {cart.length} producto
              {cart.length !== 1
                ? "s"
                : ""}
            </span>

          </div>

          <div className="summary-items">

            {cart.map((item) => (

              <div
                className="summary-item"
                key={item.productId}
              >

                <span>
                  💎 {item.diamonds} ×{" "}
                  {item.quantity}
                </span>

                <strong>
                  {(
                    Number(
                      item.price
                    ) *
                    Number(
                      item.quantity
                    )
                  ).toFixed(2)}
                </strong>

              </div>

            ))}

          </div>

          <div className="summary-line">

            <span>
              Subtotal
            </span>

            <span>
              {total.toFixed(2)} USDT
            </span>

          </div>

          <div className="summary-total">

            <span>
              Total
            </span>

            <strong>
              {paymentAmount.toFixed(6)}
              {" "}USDT
            </strong>

          </div>

          <div className="checkout-security">

            <div>
              🔒
            </div>

            <p>
              Comprueba siempre que
              la dirección y la red
              sean correctas antes
              de enviar.
            </p>

          </div>

        </aside>

      </div>

    </main>
  );
        }
