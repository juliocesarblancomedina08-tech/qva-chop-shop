"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CartPage() {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const loadCart = () => {
      const savedCart = localStorage.getItem("qva_cart");

      if (savedCart) {
        try {
          setCart(JSON.parse(savedCart));
        } catch {
          setCart([]);
        }
      } else {
        setCart([]);
      }
    };

    loadCart();

    window.addEventListener("cartUpdated", loadCart);

    return () => {
      window.removeEventListener("cartUpdated", loadCart);
    };
  }, []);

  const removeItem = (index) => {
    const newCart = cart.filter((_, i) => i !== index);

    setCart(newCart);

    localStorage.setItem(
      "qva_cart",
      JSON.stringify(newCart)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );
  };

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
          🛒 Carrito de compra
        </p>
      </header>

      <section className="product-section">

        <div className="product-card">

          <h1 className="product-title">
            🛒 Tu carrito
          </h1>

          {cart.length === 0 ? (
            <>
              <p className="product-description">
                Tu carrito está vacío.
              </p>

              <Link
                href="/"
                className="offers-button"
              >
                🛍️ IR A LA TIENDA
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
                        💎 {item.diamonds} Diamonds
                      </strong>

                      <p>
                        {Number(item.price).toFixed(2)} USDT
                      </p>
                    </div>

                    <button
                      type="button"
                      className="remove-button"
                      onClick={() =>
                        removeItem(index)
                      }
                    >
                      🗑️
                    </button>

                  </div>
                ))}

              </div>

              <div className="cart-total">

                <span>
                  TOTAL
                </span>

                <strong>
                  {total.toFixed(2)} USDT
                </strong>

              </div>

              <Link
                href="/checkout"
                className="offers-button"
              >
                CHECKOUT
              </Link>

              <Link
                href="/"
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
