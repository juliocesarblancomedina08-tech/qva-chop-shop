"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [paymentStatus, setPaymentStatus] =
    useState("waiting");

  const [deliveredCodes, setDeliveredCodes] =
    useState([]);

  const [copied, setCopied] = useState(false);

  const [timeLeft, setTimeLeft] = useState(180);

  const walletAddress =
    process.env.NEXT_PUBLIC_STORE_WALLET_ADDRESS || "";

  useEffect(() => {
    async function startPayment() {
      const savedCart =
        localStorage.getItem("qva_cart");

      const savedEmail =
        localStorage.getItem("qva_customer_email");

      const savedReference =
        localStorage.getItem("qva_order_reference");

      const savedTotal =
        localStorage.getItem("qva_order_total");

      const savedExpiresAt =
        localStorage.getItem("qva_order_expires_at");

      let currentCart = [];

      if (savedCart) {
        try {
          currentCart = JSON.parse(savedCart);
          setCart(currentCart);
        } catch {
          currentCart = [];
          setCart([]);
        }
      }

      /*
       * Si ya existe un pedido creado,
       * lo recuperamos desde localStorage.
       */
      if (
        savedReference &&
        savedTotal &&
        savedExpiresAt
      ) {
        setOrder({
          reference: savedReference,
          totalUsdt: Number(savedTotal),
          expiresAt: savedExpiresAt,
        });

        setLoading(false);
        return;
      }

      /*
       * Debemos tener correo y productos.
       */
      if (!savedEmail || !currentCart.length) {
        setError(
          "Faltan datos del pedido. Regresa al carrito e inténtalo nuevamente."
        );

        setLoading(false);
        return;
      }

      try {
        /*
         * Creamos el pedido automáticamente.
         */
        const response = await fetch(
          "/api/verify-payment/create-order",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: savedEmail,
              cart: currentCart,
            }),
          }
        );

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            "El servidor no respondió correctamente."
          );
        }

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error ||
              "No se pudo crear el pedido."
          );
        }

        setOrder(data.order);

        localStorage.setItem(
          "qva_order_reference",
          data.order.reference
        );

        localStorage.setItem(
          "qva_order_total",
          String(data.order.totalUsdt)
        );

        if (data.order.expiresAt) {
          localStorage.setItem(
            "qva_order_expires_at",
            data.order.expiresAt
          );
        }
      } catch (err) {
        setError(
          err.message ||
            "No se pudo crear el pedido."
        );
      } finally {
        setLoading(false);
      }
    }

    startPayment();
  }, []);

  /*
   * Calculamos el tiempo restante usando expiresAt.
   */
  useEffect(() => {
    if (!order?.expiresAt) return;

    function updateTimer() {
      const now = Date.now();

      const expires =
        new Date(order.expiresAt).getTime();

      const remaining = Math.max(
        0,
        Math.ceil((expires - now) / 1000)
      );

      setTimeLeft(remaining);

      if (remaining <= 0) {
        setPaymentStatus("expired");
      }
    }

    updateTimer();

    const interval = setInterval(
      updateTimer,
      1000
    );

    return () => clearInterval(interval);
  }, [order?.expiresAt]);

  const minutes = Math.floor(timeLeft / 60);

  const seconds = timeLeft % 60;

  const formattedTime =
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")}`;

  const total = order
    ? Number(order.totalUsdt)
    : cart.reduce(
        (sum, item) =>
          sum + Number(item.price || 0),
        0
      );

  const qrUrl = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
        walletAddress
      )}`
    : "";

  async function verifyPayment() {
    if (!order?.reference) return;

    if (paymentStatus === "expired") return;

    try {
      const response = await fetch(
        "/api/verify-payment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderReference: order.reference,
          }),
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "Error al verificar el pago."
        );
      }

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
            "No se pudo verificar el pago."
        );
      }

      if (data.expired) {
        setPaymentStatus("expired");
        return;
      }

      if (data.delivered) {
        setPaymentStatus("delivered");

        setDeliveredCodes(
          data.codes || []
        );

        localStorage.removeItem("qva_cart");

        return;
      }

      if (data.paid) {
        setPaymentStatus("paid");
        return;
      }

      setPaymentStatus("waiting");
    } catch {
      /*
       * Si hay un error temporal,
       * volveremos a intentarlo.
       */
    }
  }

  /*
   * Verificamos automáticamente cada 15 segundos,
   * mientras el pedido esté activo.
   */
  useEffect(() => {
    if (!order?.reference) return;

    if (
      paymentStatus === "delivered" ||
      paymentStatus === "expired"
    ) {
      return;
    }

    verifyPayment();

    const interval = setInterval(() => {
      verifyPayment();
    }, 15000);

    return () => clearInterval(interval);
  }, [order?.reference, paymentStatus]);

  async function copyAddress() {
    if (!walletAddress) return;

    try {
      await navigator.clipboard.writeText(
        walletAddress
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      alert("No se pudo copiar la dirección.");
    }
  }

  return (
    <main className="payment-page">

      <header className="checkout-header">
        <Link href="/" className="checkout-logo">
          🤖 Qva🇨🇺CHOP 🛒
        </Link>

        <div className="checkout-secure">
          🔒 Pago seguro
        </div>
      </header>

      <div className="payment-container">

        <div className="payment-main">

          <div className="checkout-heading">
            <p className="checkout-step">
              PASO 2 DE 2
            </p>

            <h1>
              Completa tu pago
            </h1>

            <p>
              Realiza el pago utilizando USDT en la
              red BNB Smart Chain (BEP-20).
            </p>
          </div>

          {loading && (
            <section className="checkout-box">
              <h2 className="payment-section-title">
                Preparando tu pedido...
              </h2>

              <p className="payment-text">
                ⏳ Estamos creando tu pedido de forma segura.
              </p>
            </section>
          )}

          {error && (
            <section className="checkout-box">
              <h2 className="payment-section-title">
                Ocurrió un problema
              </h2>

              <p className="payment-text">
                ⚠️ {error}
              </p>
            </section>
          )}

          {!loading && !error && order && (
            <>

              <section className="checkout-box payment-total-box">
                <div>
                  <p className="payment-small-title">
                    TIEMPO PARA PAGAR
                  </p>

                  <div className="payment-big-amount">
                    ⏱️ {formattedTime}
                  </div>

                  {paymentStatus === "waiting" && (
                    <p className="payment-text">
                      Tu pedido está reservado durante
                      este tiempo.
                    </p>
                  )}

                  {paymentStatus === "expired" && (
                    <p className="payment-text">
                      ❌ El tiempo para realizar el pago
                      ha finalizado.
                    </p>
                  )}
                </div>
              </section>

              <section className="checkout-box payment-total-box">
                <div>
                  <p className="payment-small-title">
                    TOTAL A PAGAR
                  </p>

                  <div className="payment-big-amount">
                    {total.toFixed(2)}
                    <span> USDT</span>
                  </div>
                </div>

                <div className="payment-network">
                  BEP-20
                </div>
              </section>

              <section className="checkout-box">

                <h2 className="payment-section-title">
                  Pedido creado correctamente
                </h2>

                <p className="payment-text">
                  📦 Referencia de tu pedido:
                </p>

                <strong>
                  {order.reference}
                </strong>

              </section>

              {paymentStatus !== "expired" && (
                <section className="checkout-box">

                  <h2 className="payment-section-title">
                    Realiza el pago
                  </h2>

                  <p className="payment-text">
                    Envía exactamente{" "}
                    <strong>
                      {total.toFixed(2)} USDT
                    </strong>{" "}
                    a la siguiente dirección.
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

                  <div className="payment-warning">
                    ⚠️ <strong>Importante:</strong>{" "}
                    envía únicamente USDT por la red
                    BEP-20.
                  </div>

                </section>
              )}

              <section className="checkout-box">

                <h2 className="payment-section-title">
                  Verificación automática
                </h2>

                {paymentStatus === "waiting" && (
                  <div className="payment-warning">
                    ⏳ <strong>
                      Esperando confirmación del pago...
                    </strong>

                    <br />

                    Nuestro sistema está verificando
                    automáticamente la recepción del USDT.
                  </div>
                )}

                {paymentStatus === "paid" && (
                  <div className="payment-warning">
                    ✅ <strong>
                      ¡Pago confirmado!
                    </strong>
                  </div>
                )}

                {paymentStatus === "expired" && (
                  <div className="payment-warning">
                    ❌ <strong>
                      Pedido vencido.
                    </strong>

                    <br />

                    El tiempo de pago finalizó y la reserva
                    de los códigos fue liberada.
                  </div>
                )}

                {paymentStatus === "delivered" && (
                  <div className="payment-warning">
                    🎉 <strong>
                      ¡Pedido entregado correctamente!
                    </strong>

                    {deliveredCodes.length > 0 && (
                      <>
                        <br />
                        <br />

                        <strong>
                          Tus códigos:
                        </strong>

                        {deliveredCodes.map(
                          (item, index) => (
                            <p key={index}>
                              🎁 {item.code}
                            </p>
                          )
                        )}
                      </>
                    )}
                  </div>
                )}

              </section>

            </>
          )}

          <Link
            href="/cart"
            className="back-link"
          >
            ← Volver al carrito
          </Link>

        </div>

        <aside className="checkout-summary">

          <div className="summary-header">
            <h2>
              Tu pedido
            </h2>

            <span>
              {cart.length} producto
              {cart.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="summary-items">

            {cart.map((item, index) => (
              <div
                className="summary-item"
                key={`${item.id || item.diamonds}-${index}`}
              >
                <span>
                  💎 {item.diamonds} Diamonds
                </span>

                <strong>
                  {Number(
                    item.price || 0
                  ).toFixed(2)} USDT
                </strong>
              </div>
            ))}

          </div>

          <div className="summary-total">
            <span>Total</span>

            <strong>
              {total.toFixed(2)} USDT
            </strong>
          </div>

        </aside>

      </div>

    </main>
  );
            }
