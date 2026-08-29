"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CheckoutPage() {
  const [cart, setCart] = useState([]);
  const [email, setEmail] = useState("");

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

  const total = cart.reduce(
    (sum, item) => sum + Number(item.price),
    0
  );

  const canContinue =
    email.trim() !== "" && cart.length > 0;

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
              Completa tus datos para continuar con el pago.
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
                  Recibirás la confirmación del pedido aquí.
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
                    key={`${item.diamonds}-${index}`}
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
                      {Number(item.price).toFixed(2)} USDT
                    </strong>

                  </div>

                ))}

              </div>

            )}

          </section>

        </div>

        {/* ORDER SUMMARY */}

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
                key={`${item.diamonds}-summary-${index}`}
              >

                <span>
                  💎 {item.diamonds} Diamonds
                </span>

                <strong>
                  {Number(item.price).toFixed(2)}
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

          {canContinue ? (

            <Link
              href="/payment"
              className="checkout-primary-button"
            >
              CONTINUAR AL PAGO
              <span>→</span>
            </Link>

          ) : (

            <div className="checkout-primary-button disabled">
              CONTINUAR AL PAGO
              <span>→</span>
            </div>

          )}

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
