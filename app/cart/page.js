"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CartPage() {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const savedCart = localStorage.getItem("qva_cart");

    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  }, []);

  const removeItem = (index) => {
    const newCart = cart.filter((_, i) => i !== index);

    setCart(newCart);
    localStorage.setItem("qva_cart", JSON.stringify(newCart));
  };

  const total = cart.reduce((sum, item) => {
    return sum + item.price;
  }, 0);

  return (
    <main className="shop-container">
      <header className="header">
        <div className="logo">🎮 Qva🇨🇺CHOP 🛒</div>

        <p className="subtitle">
          🛒 Tu carrito
        </p>
      </header>

      <section className="product-section">
        <div className="product-card">

          <h1 className="product-title">
            🛒 Carrito
          </h1>

          {cart.length === 0 ? (
            <>
              <p className="product-description">
                Tu carrito está vacío.
              </p>

              <Link
                href="/offers"
                className="offers-button"
              >
                💎 VER OFERTAS
              </Link>
            </>
          ) : (
            <>
              <div className="cart-list">
                {cart.map((item, index) => (
                  <div
                    className="cart-item"
                    key={`${item.diamonds}-${index}`}
                  >
                    <div>
                      <strong>
                        💎 {item.diamonds}
                      </strong>

                      <p>
                        {item.price.toFixed(2)} USDT
                      </p>
                    </div>

                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => removeItem(index)}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>

              <div className="cart-total">
                <span>Total</span>

                <strong>
                  {total.toFixed(2)} USDT
                </strong>
              </div>

              <Link
                href="/checkout"
                className="offers-button"
              >
                💳 CONTINUAR AL CHECKOUT
              </Link>

              <Link
                href="/offers"
                className="back-link"
              >
                ← Seguir comprando
              </Link>
            </>
          )}
        </div>
      </section>

      <footer className="footer">
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>
    </main>
  );
    }
