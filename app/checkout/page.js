"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CheckoutPage() {
  const [cart, setCart] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCart();
  }, []);

  function loadCart() {
    try {
      const savedCart =
        localStorage.getItem("qva_cart");

      if (!savedCart) {
        setCart([]);
        return;
      }

      const parsed = JSON.parse(savedCart);

      if (!Array.isArray(parsed)) {
        setCart([]);
        return;
      }

      const cleanCart = parsed
        .filter((item) => {
          return Number.isInteger(
            Number(item?.productId)
          );
        })
        .map((item) => ({
          productId: Number(
            item.productId
          ),
          diamonds: String(
            item.diamonds || ""
          ),
          price: Number(
            item.price || 0
          ),
          quantity: Math.max(
            1,
            Number(
              item.quantity || 1
            )
          ),
        }));

      setCart(cleanCart);
    } catch (error) {
      console.error(
        "CHECKOUT_CART_ERROR:",
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

  const totalItems = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 1),
    0
  );

  async function continueToPayment() {
    setError("");

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setError(
        "Introduce tu correo electrónico."
      );
      return;
    }

    if (!cleanEmail.includes("@")) {
      setError(
        "Introduce un correo electrónico válido."
      );
      return;
    }

    if (cart.length === 0) {
      setError(
        "Tu carrito está vacío."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "/api/verify-payment/create-order",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            email: cleanEmail,

            cart: cart.map((item) => ({
              productId:
                Number(item.productId),

              quantity:
                Number(
                  item.quantity || 1
                ),
            })),
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data?.error ||
            "No se pudo crear el pedido."
        );
      }

      /*
       * Guardamos los datos del pedido
       * para utilizarlos en payment.
       */
      localStorage.setItem(
        "qva_order",
        JSON.stringify({
          id: data.order.id,

          reference:
            data.order.reference,

          totalUsdt:
            data.order.totalUsdt,

          paymentAmountUsdt:
            data.order.paymentAmountUsdt,

          expiresAt:
            data.order.expiresAt,

          email: cleanEmail,
        })
      );

      /*
       * Vamos a la página de pago.
       */
      window.location.href =
        "/payment";
    } catch (error) {
      console.error(
        "CHECKOUT_ERROR:",
        error
      );

      setError(
        error?.message ||
          "No se pudo crear el pedido."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="checkout-page">

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

      {/* CONTENT */}

      <div className="checkout-container">

        <div className="checkout-main">

          {/* TITLE */}

          <div className="checkout-heading">

            <p className="checkout-step">
              PASO 1 DE 2
            </p>

            <h1>
              Finalizar compra
            </h1>

            <p>
              Completa tus datos para
              continuar con el pago.
            </p>

          </div>

          {/* EMAIL */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                1
              </span>

              <div>

                <h2>
                  Información de contacto
                </h2>

                <p>
                  Recibirás la confirmación
                  del pedido aquí.
                </p>

              </div>

            </div>

            <label className="checkout-label">
              Correo electrónico
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="tu@email.com"
              className="checkout-input"
              disabled={loading}
            />

          </section>

          {/* ORDER */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                2
              </span>

              <div>

                <h2>
                  Resumen del pedido
                </h2>

                <p>
                  Revisa los productos antes
                  de pagar.
                </p>

              </div>

            </div>

            {cart.length === 0 ? (

              <div className="checkout-empty">

                <p>
                  Tu carrito está vacío.
                </p>

                <Link
                  href="/offers"
                  className="checkout-secondary-button"
                >
                  🛍️ Volver a la tienda
                </Link>

              </div>

            ) : (

              <div className="checkout-products">

                {cart.map((item) => (

                  <div
                    className="checkout-product"
                    key={item.productId}
                  >

                    <div className="checkout-product-icon">
                      💎
                    </div>

                    <div className="checkout-product-info">

                      <strong>
                        {item.diamonds} Diamonds
                      </strong>

                      <span>
                        Diamonds Singapur
                      </span>

                      <span>
                        Cantidad:{" "}
                        {item.quantity}
                      </span>

                    </div>

                    <strong className="checkout-product-price">
                      {(
                        Number(
                          item.price
                        ) *
                        Number(
                          item.quantity
                        )
                      ).toFixed(2)}{" "}
                      USDT
                    </strong>

                  </div>

                ))}

              </div>

            )}

          </section>

          {/* ERROR */}

          {error && (

            <div
              style={{
                marginTop: "16px",
                padding: "14px",
                borderRadius: "10px",
                background:
                  "rgba(255, 60, 60, 0.10)",
                border:
                  "1px solid rgba(255, 60, 60, 0.35)",
                color: "#ff6b6b",
              }}
            >
              ⚠️ {error}
            </div>

          )}

          {/* CONTINUE */}

          {cart.length > 0 && (

            <button
              type="button"
              className="checkout-primary-button"
              onClick={
                continueToPayment
              }
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "20px",
              }}
            >

              {loading
                ? "CREANDO PEDIDO..."
                : "CONTINUAR AL PAGO"}

              <span>
                {loading
                  ? "⏳"
                  : "→"}
              </span>

            </button>

          )}

          <Link
            href="/cart"
            className="back-link"
          >
            ← Volver al carrito
          </Link>

        </div>

        {/* ORDER SUMMARY */}

        <aside className="checkout-summary">

          <div className="summary-header">

            <h2>
              Tu pedido
            </h2>

            <span>
              {totalItems} producto
              {totalItems !== 1
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
              {total.toFixed(2)} USDT
            </strong>

          </div>

          <div className="checkout-security">

            <div>
              🔒
            </div>

            <p>
              Tus datos están protegidos.
              <br />
              Pago seguro con USDT BEP-20.
            </p>

          </div>

        </aside>

      </div>

    </main>
  );
  }
