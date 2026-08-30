"use client";

import { useState } from "react";
import Link from "next/link";

const offers = [
  {
    productId: 8,
    diamonds: "100",
    price: 1.01,
  },
  {
    productId: 9,
    diamonds: "210",
    price: 2.0,
  },
  {
    productId: 10,
    diamonds: "530",
    price: 5.0,
  },
  {
    productId: 11,
    diamonds: "1080",
    price: 10.0,
  },
  {
    productId: 12,
    diamonds: "2200",
    price: 20.0,
  },
];

export default function OffersPage() {
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [added, setAdded] = useState(false);

  function addToCart() {
    if (!selectedOffer) {
      return;
    }

    try {
      const savedCart =
        localStorage.getItem("qva_cart");

      let currentCart = [];

      if (savedCart) {
        try {
          const parsed = JSON.parse(savedCart);

          if (Array.isArray(parsed)) {
            currentCart = parsed;
          }
        } catch {
          currentCart = [];
        }
      }

      const existingIndex =
        currentCart.findIndex(
          (item) =>
            Number(item.productId) ===
            Number(selectedOffer.productId)
        );

      if (existingIndex >= 0) {
        currentCart[existingIndex] = {
          ...currentCart[existingIndex],
          quantity:
            Number(
              currentCart[existingIndex].quantity || 1
            ) + 1,
        };
      } else {
        currentCart.push({
          productId:
            selectedOffer.productId,

          diamonds:
            selectedOffer.diamonds,

          price:
            selectedOffer.price,

          quantity: 1,
        });
      }

      localStorage.setItem(
        "qva_cart",
        JSON.stringify(currentCart)
      );

      window.dispatchEvent(
        new Event("cartUpdated")
      );

      setAdded(true);
    } catch (error) {
      console.error(
        "ADD_TO_CART_ERROR:",
        error
      );

      alert(
        "No se pudo añadir el producto al carrito."
      );
    }
  }

  return (
    <main className="shop-container">

      <header className="header">

        <div className="logo">
          🎮 Qva🇨🇺CHOP 🛒
        </div>

        <p className="subtitle">
          💎 Diamond Singapur
        </p>

      </header>

      <section className="product-section">

        <div className="product-card">

          <div className="product-icon">
            💎
          </div>

          <h1 className="product-title">
            Diamonds Singapur
          </h1>

          <p className="product-description">
            Selecciona la cantidad de diamantes
            que deseas comprar.
          </p>

          <div className="offers-list">

            {offers.map((offer) => {

              const isSelected =
                selectedOffer?.productId ===
                offer.productId;

              return (
                <button
                  key={offer.productId}
                  type="button"
                  onClick={() => {
                    setSelectedOffer(offer);
                    setAdded(false);
                  }}
                  className={`offer-item ${
                    isSelected
                      ? "offer-selected"
                      : ""
                  }`}
                >

                  <span>
                    {isSelected
                      ? "✅"
                      : "💎"}{" "}
                    {offer.diamonds} 💎
                  </span>

                  <strong>
                    {offer.price.toFixed(2)} USDT
                  </strong>

                </button>
              );
            })}

          </div>

          {selectedOffer && (

            <div className="selected-offer">

              <p>
                Oferta seleccionada:
              </p>

              <strong>
                💎 {selectedOffer.diamonds} —{" "}
                {selectedOffer.price.toFixed(2)} USDT
              </strong>

            </div>

          )}

          <button
            type="button"
            className="offers-button"
            disabled={!selectedOffer}
            onClick={addToCart}
          >
            🛒 AÑADIR AL CARRITO
          </button>

          {added && (

            <p
              style={{
                marginTop: "14px",
                color: "#aaaaaa",
                fontSize: "14px",
              }}
            >
              ✅ Añadido al carrito
            </p>

          )}

          <Link
            href="/cart"
            className="back-link"
          >
            🛒 Ver carrito
          </Link>

          <Link
            href="/"
            className="back-link"
          >
            ← Volver a la tienda
          </Link>

        </div>

      </section>

      <footer className="footer">
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>

    </main>
  );
              }
