"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CheckoutPage() {
  const [cart, setCart] = useState([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const savedCart = localStorage.getItem("qva_cart");
    const savedEmail = localStorage.getItem("qva_customer_email");

    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch {
        setCart([]);
      }
    }

    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const total = cart.reduce(
    (sum, item) =>
      sum + Number(item.price || 0),
    0
  );

  const canContinue =
    email.trim() !== "" && cart.length > 0;

  function handleContinue() {
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

    /*
     * Guardamos el correo para utilizarlo
     * en la página de pago.
     */
    localStorage.setItem(
      "qva_customer_email",
      email.trim().toLowerCase()
    );

    window.location.href = "/payment";
  }

  return (
    <main className="checkout-page">

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

      <div className="checkout-container">

        <div className="checkout-main">

          <div className="checkout-heading">

            <p className="checkout-step">
              PASO 1 DE 2
            </p>

            <h1>
              Finalizar compra
            </h1>

            <p>
              Completa tus datos para continuar con el pago.
            </p>

          </div>

          {/* INFORMACIÓN DE CONTACTO */}

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
                  Recibirás la confirmación y la información
                  de tu pedido en este correo.
                </p>
              </div>
            </div>

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
                  marginTop: "10px",
                  fontSize: "14px",
                }}
              >
                ⚠️ {error}
              </p>
            )}

          </section>

          {/* RESUMEN DEL PEDIDO */}

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
                  Revisa los productos antes de pagar.
                </p>
              </div>

            </div>

            {cart.length === 0 ? (

              <div className="checkout-empty">

                <p>
                  Tu carrito está vacío.
                </p>

                <Link
                  href="/"
                  className="checkout-secondary-button"
                >
                  🛍️ Volver a la tienda
                </Link>

              </div>

            ) : (

              <div className="checkout-products">

                {cart.map((item, index) => (

                  <div
                    className="checkout-product"
                    key={`${item.id || item.diamonds}-${index}`}
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

                    </div>

                    <strong className="checkout-product-price">
                      {Number(
                        item.price || 0
                      ).toFixed(2)} USDT
                    </strong>

                  </div>

                ))}

              </div>

            )}

          </section>

        </div>

        {/* RESUMEN LATERAL */}

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
                key={`${item.id || item.diamonds}-summary-${index}`}
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

          <button
            type="button"
            onClick={handleContinue}
            className={
              canContinue
                ? "checkout-primary-button"
                : "checkout-primary-button disabled"
            }
            disabled={!canContinue}
          >
            CONTINUAR AL PAGO
            <span>→</span>
          </button>

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
