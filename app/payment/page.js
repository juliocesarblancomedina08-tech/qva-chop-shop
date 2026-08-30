"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [cart, setCart] = useState([]);
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState(null);
  const [creatingOrder, setCreatingOrder] =
    useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const savedCart = localStorage.getItem("qva_cart");

    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch {
        setCart([]);
      }
    }
  }, []);

  const localTotal = cart.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0
  );

  const total = order
    ? Number(order.totalUsdt)
    : localTotal;

  const walletAddress =
    process.env.NEXT_PUBLIC_STORE_WALLET_ADDRESS || "";

  const qrUrl = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
        walletAddress
      )}`
    : "";

  async function createOrder() {
    if (!email.trim()) {
      setError(
        "Introduce tu correo electrónico para continuar."
      );
      return;
    }

    if (!cart.length) {
      setError("Tu carrito está vacío.");
      return;
    }

    setCreatingOrder(true);
    setError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          cart,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error ||
            "No se pudo crear el pedido."
        );
      }

      setOrder(data.order);

      /*
       * Guardamos la referencia del pedido
       * para usarla durante la verificación.
       */
      localStorage.setItem(
        "qva_order_reference",
        data.order.reference
      );
    } catch (error) {
      setError(
        error.message ||
          "Ocurrió un error al crear el pedido."
      );
    } finally {
      setCreatingOrder(false);
    }
  }

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
              PAGO
            </p>

            <h1>
              Completa tu pago
            </h1>

            <p>
              Realiza el pago utilizando USDT en la
              red BNB Smart Chain (BEP-20).
            </p>
          </div>

          {/* CORREO Y CREACIÓN DEL PEDIDO */}

          {!order && (
            <section className="checkout-box">

              <h2 className="payment-section-title">
                Información de contacto
              </h2>

              <p className="payment-text">
                Introduce tu correo para enviarte la
                información de tu pedido y ayudarte en
                caso de cualquier inconveniente.
              </p>

              <label className="checkout-label">
                Correo electrónico
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="tu@email.com"
                className="checkout-input"
              />

              {error && (
                <p
                  style={{
                    marginTop: "12px",
                    color: "#e57373",
                    fontSize: "14px",
                  }}
                >
                  ⚠️ {error}
                </p>
              )}

              <button
                type="button"
                className="checkout-primary-button payment-submit"
                onClick={createOrder}
                disabled={
                  creatingOrder ||
                  !email.trim() ||
                  !cart.length
                }
              >
                {creatingOrder
                  ? "⏳ CREANDO PEDIDO..."
                  : "CONTINUAR AL PAGO →"}
              </button>

            </section>
          )}

          {/* IMPORTE */}

          {order && (
            <>
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

              {/* MÉTODO */}

              <section className="checkout-box">

                <h2 className="payment-section-title">
                  Método de pago
                </h2>

                <div className="payment-method">

                  <div className="payment-method-icon">
                    <svg
                      width="46"
                      height="46"
                      viewBox="0 0 64 64"
                      aria-label="USDT"
                    >
                      <circle
                        cx="32"
                        cy="32"
                        r="30"
                        fill="#26A17B"
                      />

                      <path
                        d="M14 17h36v7H37v5.5c7.8.6 13 2.4 13 4.6 0 2.8-8 5-18 5s-18-2.2-18-5c0-2.2 5.2-4 13-4.6V24H14v-7zm18 16c-7.5 0-12.5.8-12.5 1.7 0 .9 5 1.8 12.5 1.8s12.5-.9 12.5-1.8c0-.9-5-1.7-12.5-1.7z"
                        fill="white"
                      />
                    </svg>
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
                  Envía exactamente{" "}
                  <strong>
                    {total.toFixed(2)} USDT
                  </strong>{" "}
                  a la dirección indicada.
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
                  Escanea para copiar la dirección de pago
                </p>

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
                  BEP-20. No utilices otra red.
                </div>

              </section>

              {/* VERIFICACIÓN AUTOMÁTICA */}

              <section className="checkout-box">

                <h2 className="payment-section-title">
                  Verificación automática
                </h2>

                <p className="payment-text">
                  🤖 Nuestro sistema verificará
                  automáticamente la recepción del pago.
                </p>

                <div className="payment-warning">
                  ⏳{" "}
                  <strong>
                    Esperando confirmación del pago...
                  </strong>

                  <br />

                  No es necesario introducir ningún
                  TX Hash. La entrega continuará
                  automáticamente cuando el pago sea
                  confirmado.
                </div>

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

        {/* RESUMEN DEL PEDIDO */}

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
              {total.toFixed(2)} USDT
            </strong>
          </div>

          <div className="checkout-security">
            <div>
              🔒
            </div>

            <p>
              Comprueba siempre que la dirección y la
              red sean correctas antes de enviar.
            </p>
          </div>

        </aside>

      </div>

    </main>
  );
            }
