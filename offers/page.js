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
            {offers.map((offer) => (
              <button
                key={offer.diamonds}
                className="offer-item"
              >
                <span>✏️ {offer.diamonds}</span>
                <strong>{offer.price}</strong>
              </button>
            ))}
          </div>

          <button className="offers-button">
            🛒 Añadir al carrito
          </button>
        </div>
      </section>

      <footer className="footer">
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>
    </main>
  );
    }
