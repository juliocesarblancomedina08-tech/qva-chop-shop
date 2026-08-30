"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] =
    useState(false);

  const [paymentStatus, setPaymentStatus] =
    useState("waiting");

  const [deliveredCodes, setDeliveredCodes] =
    useState([]);

  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const walletAddress =
    process.env
      .NEXT_PUBLIC_STORE_WALLET_ADDRESS ||
    "";

  const qrUrl = walletAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
        walletAddress
      )}`
    : "";

  function formatUsdt(value) {
    return Number(value || 0).toFixed(6);
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
      setError(
        "No se pudo copiar la dirección."
      );
    }
  }

  /*
   * Crear pedido automáticamente.
   */
  async function createOrder(currentCart) {
    const email =
      localStorage.getItem(
        "qva_customer_email"
      );

    if (!email) {
      throw new Error(
        "Falta el correo electrónico. Regresa al checkout."
      );
    }

    setCreatingOrder(true);

    const response = await fetch(
      "/api/create-order",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          email,
          cart: currentCart,
        }),
      }
    );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.ok
    ) {
      throw new Error(
        data.error ||
          "No se pudo crear el pedido."
      );
    }

    localStorage.setItem(
      "qva_order_reference",
      data.order.reference
    );

    localStorage.setItem(
      "qva_order_total",
      String(
        data.order.totalUsdt
      )
    );

    localStorage.setItem(
      "qva_payment_amount",
      String(
        data.order.paymentAmountUsdt
      )
    );

    if (
      data.order.expiresAt
    ) {
      localStorage.setItem(
        "qva_order_expires_at",
        data.order.expiresAt
      );
    }

    setOrder(
      data.order
    );

    setCreatingOrder(false);

    return data.order;
  }

  /*
   * Verificación automática.
   */
  async function verifyPayment(
    reference
  ) {
    try {
      const response =
        await fetch(
          "/api/verify-payment",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              orderReference:
                reference,
            }),
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Error verificando el pago."
        );
      }

      if (
        data.expired
      ) {
        setPaymentStatus(
          "expired"
        );
        return true;
      }

      if (
        data.paid &&
        data.delivered
      ) {
        setDeliveredCodes(
          data.codes || []
        );

        setPaymentStatus(
          "delivered"
        );

        localStorage.removeItem(
          "qva_cart"
        );

        return true;
      }

      setPaymentStatus(
        "waiting"
      );

      return false;

    } catch (err) {
      console.error(
        "PAYMENT_CHECK:",
        err
      );

      /*
       * No mostramos un error cada
       * 15 segundos al cliente.
       *
       * El sistema seguirá intentando.
       */
      return false;
    }
  }

  /*
   * Inicializar página.
   */
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const savedCart =
          localStorage.getItem(
            "qva_cart"
          );

        if (!savedCart) {
          throw new Error(
            "Tu carrito está vacío."
          );
        }

        const currentCart =
          JSON.parse(
            savedCart
          );

        if (
          !Array.isArray(
            currentCart
          ) ||
          !currentCart.length
        ) {
          throw new Error(
            "Tu carrito está vacío."
          );
        }

        if (!mounted) return;

        setCart(
          currentCart
        );

        /*
         * Si ya existe un pedido,
         * continuamos con él.
         */
        const savedReference =
          localStorage.getItem(
            "qva_order_reference"
          );

        const savedTotal =
          localStorage.getItem(
            "qva_order_total"
          );

        const savedPaymentAmount =
          localStorage.getItem(
            "qva_payment_amount"
          );

        const savedExpires =
          localStorage.getItem(
            "qva_order_expires_at"
          );

        if (
          savedReference &&
          savedTotal &&
          savedPaymentAmount
        ) {
          const expired =
            savedExpires &&
            new Date(
              savedExpires
            ).getTime() <=
              Date.now();

          if (!expired) {
            setOrder({
              reference:
                savedReference,
              totalUsdt:
                Number(
                  savedTotal
                ),
              paymentAmountUsdt:
                Number(
                  savedPaymentAmount
                ),
              expiresAt:
                savedExpires,
            });

            setLoading(false);

            return;
          }

          localStorage.removeItem(
            "qva_order_reference"
          );

          localStorage.removeItem(
            "qva_order_total"
          );

          localStorage.removeItem(
            "qva_payment_amount"
          );

          localStorage.removeItem(
            "qva_order_expires_at"
          );
        }

        await createOrder(
          currentCart
        );

        if (mounted) {
          setLoading(false);
        }

      } catch (err) {
        console.error(
          "PAYMENT_INIT:",
          err
        );

        if (mounted) {
          setError(
            err.message ||
              "No se pudo iniciar el pago."
          );

          setLoading(false);
          setCreatingOrder(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Polling automático.
   *
   * No hay botón "Verificar".
   * No hay TX Hash.
   */
  useEffect(() => {
    if (
      !order?.reference ||
      paymentStatus ===
        "delivered" ||
      paymentStatus ===
        "expired"
    ) {
      return;
    }

    let stopped = false;

    async function check() {
      if (stopped) return;

      await verifyPayment(
        order.reference
      );
    }

    check();

    const interval =
      setInterval(
        check,
        10000
      );

    return () => {
      stopped = true;
      clearInterval(
        interval
      );
    };
  }, [
    order?.reference,
    paymentStatus,
  ]);

  if (loading) {
    return (
      <main className="payment-page">

        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "18px",
          }}
        >

          <div className="payment-spinner" />

          <h2>
            Preparando tu pedido...
          </h2>

          <p>
            Estamos preparando tu
            dirección de pago.
          </p>

        </div>

      </main>
    );
  }

  if (error) {
    return (
      <main className="payment-page">

        <header className="checkout-header">

          <Link
            href="/"
            className="checkout-logo"
          >
            🤖 Qva🇨🇺CHOP 🛒
          </Link>

        </header>

        <div
          className="payment-container"
          style={{
            display: "block",
            maxWidth: "700px",
            margin: "0 auto",
          }}
        >

          <section className="checkout-box">

            <h1>
              ⚠️ No pudimos preparar el pago
            </h1>

            <p>
              {error}
            </p>

            <Link
              href="/checkout"
              className="checkout-primary-button"
            >
              ← Volver al checkout
            </Link>

          </section>

        </div>

      </main>
    );
  }

  /*
   * PEDIDO ENTREGADO
   */
  if (
    paymentStatus ===
    "delivered"
  ) {
    return (
      <main className="payment-page">

        <header className="checkout-header">

          <Link
            href="/"
            className="checkout-logo"
          >
            🤖 Qva🇨🇺CHOP 🛒
          </Link>

          <div className="checkout-secure">
            ✅ Pago confirmado
          </div>

        </header>

        <div
          className="payment-container"
          style={{
            display: "block",
            maxWidth: "760px",
            margin: "0 auto",
          }}
        >

          <section className="checkout-box">

            <div
              style={{
                textAlign: "center",
              }}
            >

              <div
                style={{
                  fontSize: "60px",
                  marginBottom: "10px",
                }}
              >
                🎉
              </div>

              <h1>
                ¡Pedido entregado!
              </h1>

              <p>
                Tu pago fue confirmado
                automáticamente.
              </p>

            </div>

            <div
              style={{
                marginTop: "25px",
              }}
            >

              <h2>
                🎁 Tu código
              </h2>

              {deliveredCodes.map(
                (item, index) => (
                  <div
                    key={`${item.code}-${index}`}
                    style={{
                      marginTop:
                        "14px",
                      padding:
                        "18px",
                      borderRadius:
                        "12px",
                      background:
                        "rgba(255,255,255,0.05)",
                      textAlign:
                        "center",
                    }}
                  >

                    <strong
                      style={{
                        fontSize:
                          "20px",
                        wordBreak:
                          "break-all",
                      }}
                    >
                      {item.code}
                    </strong>

                  </div>
                )
              )}

            </div>

            <div
              style={{
                marginTop: "25px",
                textAlign: "center",
                fontSize: "14px",
                opacity: 0.75,
              }}
            >
              Pedido:{" "}
              {order?.reference}
            </div>

            <Link
              href="/"
              className="checkout-primary-button"
              style={{
                marginTop: "20px",
                display: "flex",
              }}
            >
              🛍️ Volver a la tienda
            </Link>

          </section>

        </div>

      </main>
    );
  }

  /*
   * PEDIDO EXPIRADO
   */
  if (
    paymentStatus ===
    "expired"
  ) {
    return (
      <main className="payment-page">

        <div
          className="payment-container"
          style={{
            display: "block",
            maxWidth: "700px",
            margin: "0 auto",
          }}
        >

          <section className="checkout-box">

            <div
              style={{
                textAlign: "center",
              }}
            >

              <div
                style={{
                  fontSize: "55px",
                }}
              >
                ⏰
              </div>

              <h1>
                Pedido expirado
              </h1>

              <p>
                El tiempo para realizar
                el pago terminó.
              </p>

              <Link
                href="/"
                className="checkout-primary-button"
                style={{
                  marginTop: "20px",
                  display: "flex",
                }}
              >
                🛍️ Volver a la tienda
              </Link>

            </div>

          </section>

        </div>

      </main>
    );
  }

  /*
   * PÁGINA DE PAGO
   */
  return (
    <main className="payment-page">

      <header className="checkout-header">

        <Link
          href="/"
          className="checkout-logo"
        >
          🤖 Qva🇨🇺CHOP 🛒
        </Link>

        <div className="checkout-secure">
          🔒 Pago seguro
        </div>

      </header>

      <div
        className="payment-container"
      >

        <div className="payment-main">

          <div className="checkout-heading">

            <p className="checkout-step">
              PAGO
            </p>

            <h1>
              Completa tu pago
            </h1>

            <p>
              Envía exactamente el importe
              indicado usando USDT BEP-20.
              Después no necesitas hacer nada.
            </p>

          </div>

          {/* IMPORTE */}

          <section
            className="checkout-box payment-total-box"
          >

            <div>

              <p className="payment-small-title">
                IMPORTE EXACTO A ENVIAR
              </p>

              <div className="payment-big-amount">

                {formatUsdt(
                  order?.paymentAmountUsdt
                )}

                <span>
                  {" "}USDT
                </span>

              </div>

              <p
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  opacity: 0.7,
                }}
              >
                El importe contiene una
                pequeña fracción para
                identificar automáticamente
                tu pedido.
              </p>

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

          {/* QR */}

          <section className="checkout-box">

            <h2 className="payment-section-title">
              Realiza el pago
            </h2>

            <p className="payment-text">
              Escanea el QR o copia la
              dirección de la billetera.
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
                onClick={
                  copyAddress
                }
                className="copy-button"
                disabled={
                  !walletAddress
                }
              >
                {copied
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
              la red BEP-20 y exactamente
              el importe indicado arriba.

            </div>

          </section>

          {/* ESTADO AUTOMÁTICO */}

          <section className="checkout-box">

            <div
              style={{
                textAlign: "center",
              }}
            >

              <div className="payment-spinner" />

              <h2
                className="payment-section-title"
                style={{
                  marginTop: "18px",
                }}
              >
                Esperando el pago...
              </h2>

              <p className="payment-text">
                No necesitas introducir
                TX Hash ni confirmar nada.
              </p>

              <p
                style={{
                  fontSize: "13px",
                  opacity: 0.65,
                  marginTop: "12px",
                }}
              >
                Comprobamos automáticamente
                la blockchain cada pocos
                segundos.
              </p>

            </div>

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

            {cart.map(
              (item, index) => (
                <div
                  className="summary-item"
                  key={`${item.productId}-${index}`}
                >

                  <span>
                    💎{" "}
                    {item.diamonds}
                    {" Diamonds"}
                  </span>

                  <strong>
                    {Number(
                      item.price
                    ).toFixed(2)}
                  </strong>

                </div>
              )
            )}

          </div>

          <div className="summary-line">

            <span>
              Total
            </span>

            <span>
              {Number(
                order?.totalUsdt || 0
              ).toFixed(2)}
              {" "}USDT
            </span>

          </div>

          <div className="checkout-security">

            <div>
              🔒
            </div>

            <p>
              El pago se verifica
              automáticamente.
            </p>

          </div>

        </aside>

      </div>

    </main>
  );
      }
