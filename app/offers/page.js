"use client";

import { useState } from "react";
import Link from "next/link";

const offers = [
  { id: 8, diamonds: "100", price: 1.01 },
  { id: 9, diamonds: "210", price: 2.0 },
  { id: 10, diamonds: "530", price: 5.0 },
  { id: 11, diamonds: "1080", price: 10.0 },
  { id: 12, diamonds: "2200", price: 20.0 },
];

export default function OffersPage() {
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [added, setAdded] = useState(false);

  const addToCart = () => {
    if (!selectedOffer) return;

    const savedCart = localStorage.getItem("qva_cart");

    const currentCart = savedCart
      ? JSON.parse(savedCart)
      : [];

    const newCart = [...currentCart, selectedOffer];

    localStorage.setItem(
      "qva_cart",
      JSON.stringify(newCart)
    );

    window.dispatchEvent(new Event("cartUpdated"));

    setAdded(true);
  };

  return (
    <main className="shop-container">
      <header className="header">
        <div className="logo">🤖 Qva🇨🇺CHOP 🛒</div>

        <p className="subtitle">🇸🇬 💎 Diamond Singapur</p>
      </header>

      <section className="product-section">
        <div className="product-card">
          <div className="product-icon">💎</div>

          <h1 className="product-title">
            Diamonds Singapur
          </h1>

          <p className="product-description">
            Selecciona la cantidad de diamantes que deseas comprar.
          </p>

          <div className="offers-list">
            {offers.map((offer) => {
              const isSelected =
                selectedOffer?.id === offer.id;

              return (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => {
                    setSelectedOffer(offer);
                    setAdded(false);
                  }}
                  className={`offer-item ${
                    isSelected ? "offer-selected" : ""
                  }`}
                >
                  <span>
                    {isSelected ? "✅" : "💎"}{" "}
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
              <p>Oferta seleccionada:</p>

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

          <Link href="/" className="back-link">
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
