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
    <main className="shop-container">

      <header className="header">
        <div className="logo">
          🎮 Qva🇨🇺CHOP 🛒
        </div>

        <p className="subtitle">
          💳 Checkout
        </p>
      </header>

      <section className="checkout-section">

        <div className="checkout-card">

          <h1 className="checkout-title">
            📧 Datos de compra
          </h1>

          <p className="checkout-description">
            Introduce tu correo electrónico para recibir
            la confirmación de tu pedido.
          </p>

          <label className="checkout-label">
            Correo electrónico
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="checkout-input"
          />

          <h2 className="checkout-subtitle">
            📋 Resumen del pedido
          </h2>

          {cart.length === 0 ? (
            <p className="checkout-empty">
              Tu carrito está vacío.
            </p>
          ) : (
            <div className="checkout-items">

              {cart.map((item, index) => (
                <div
                  className="checkout-item"
                  key={`${item.diamonds}-${index}`}
                >
                  <span>
                    💎 {item.diamonds} Diamonds
                  </span>

                  <strong>
                    {Number(item.price).toFixed(2)} USDT
                  </strong>
                </div>
              ))}

            </div>
          )}

          <div className="checkout-total">

            <span>
              TOTAL
            </span>

            <strong>
              {total.toFixed(2)} USDT
            </strong>

          </div>

          {canContinue ? (
            <Link
              href="/payment"
              className="offers-button"
            >
              CONTINUAR AL PAGO
            </Link>
          ) : (
            <div
              className="offers-button"
              style={{
                opacity: 0.4,
                cursor: "not-allowed",
              }}
            >
              CONTINUAR AL PAGO
            </div>
          )}

          <Link
            href="/cart"
            className="back-link"
          >
            ← Volver al carrito
          </Link>

        </div>

      </section>

      <footer className="footer">
        🛡️ Compra segura · ⚡ Entrega rápida
      </footer>

    </main>
  );
    }
