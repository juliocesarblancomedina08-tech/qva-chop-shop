"use client";

import { useState } from "react";
import Link from "next/link";

const offers = [
  {
    diamonds: "100 💎",
    price: "1.01 USDT",
  },
  {
    diamonds: "210 💎",
    price: "2.00 USDT",
  },
  {
    diamonds: "530 💎",
    price: "5.00 USDT",
  },
  {
    diamonds: "1080 💎",
    price: "10.00 USDT",
  },
  {
    diamonds: "2200 💎",
    price: "20.00 USDT",
  },
];

export default function OffersPage() {
  const [selectedOffer, setSelectedOffer] = useState(null);

  return (
    <main className="shop-container">
      <header className="header">
        <div className="logo">🎮 Qva🇨🇺CHOP 🛒</div>

        <p className="subtitle">
          💎 Diamond Singapur
        </p>
      </header>

      <section className="product-section">
        <div className="product-card">
          <div className="product-icon">💎</div>

          <h1 className="product-title">
            Selecciona tu oferta
          </h1>

          <p className="product-description">
            Elige la cantidad de diamantes que deseas comprar.
          </p>

          <div className="offers-list">
            {offers.map((offer) => {
              const isSelected =
                selectedOffer?.diamonds === offer.diamonds;

              return (
                <button
                  key={offer.diamonds}
                  type="button"
                  onClick={() => setSelectedOffer(offer)}
                  className={`offer-item ${
                    isSelected ? "offer-selected" : ""
                  }`}
                >
                  <span>
                    {isSelected ? "✅" : "✏️"} {offer.diamonds}
                  </span>

                  <strong>{offer.price}</strong>
                </button>
              );
            })}
          </div>

          {selectedOffer && (
            <div className="selected-offer">
              <p>Oferta seleccionada:</p>

              <strong>
                {selectedOffer.diamonds} — {selectedOffer.price}
              </strong>
            </div>
          )}

          <button
            type="button"
            className="offers-button"
            disabled={!selectedOffer}
          >
            🛒 AÑADIR AL CARRITO
          </button>

          <Link href="/" className="back-link">
            ← Volver
          </Link>
        </div>
      </section>

      <footer className="footer">
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>
    </main>
  );
                    }
