"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [cart, setCart] = useState([]);

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

  return (
    <main className="shop-container">

      <header className="header">
        <div className="logo">
          🎮 Qva🇨🇺CHOP 🛒
        </div>

        <p className="subtitle">
          💳 Pago seguro
        </p>
      </header>

      <section className="checkout-section">

        <div className="checkout-card">

          <h1 className="checkout-title">
            💰 Pago con USDT
          </h1>

          <p className="checkout-description">
            Realiza el pago utilizando USDT en la red
            BEP-20.
          </p>

          <div className="checkout-total">
            <span>
              TOTAL A PAGAR
            </span>

            <strong>
              {total.toFixed(2)} USDT
            </strong>
          </div>

          <div className="payment-box">

            <h2>
              🪙 USDT BEP-20
            </h2>

            <p>
              Red: BNB Smart Chain (BEP-20)
            </p>

            <p className="payment-warning">
              ⚠️ Envía únicamente USDT mediante
              BEP-20.
            </p>

          </div>

          <div className="payment-address">

            <p>
              Dirección de pago
            </p>

            <div className="address-box">
              TU_DIRECCION_USDT_BEP20
            </div>

          </div>

          <div className="qr-placeholder">
            <span>QR</span>
          </div>

          <label className="checkout-label">
            TX Hash
          </label>

          <input
            type="text"
            placeholder="Introduce el hash de la transacción"
            className="checkout-input"
          />

          <button
            type="button"
            className="offers-button"
          >
            🔍 VERIFICAR PAGO
          </button>

          <Link
            href="/checkout"
            className="back-link"
          >
            ← Volver al checkout
          </Link>

        </div>

      </section>

      <footer className="footer">
        🛡️ Pago seguro · ⚡ Entrega automática
      </footer>

    </main>
  );
    }
