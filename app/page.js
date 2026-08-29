import Link from "next/link";

export default function Home() {
  return (
    <main className="shop-container">
      <header className="header">
        <div className="logo">🎮 Qva🇨🇺CHOP 🛒</div>

        <p className="subtitle">
          Tu tienda gaming rápida y segura
        </p>
      </header>

      <section className="product-section">
        <div className="product-card">
          <div className="product-icon">💎</div>

          <h1 className="product-title">
            100 — 2200💎
          </h1>

          <p className="diamond-label">
            Diamond Singapur
          </p>

          <p className="product-description">
            Selecciona la cantidad de diamantes que deseas
            y continúa con tu compra.
          </p>

          <Link href="/offers" className="offers-button">
            🛒 VER OFERTAS
          </Link>
        </div>
      </section>

      <footer className="footer">
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>
    </main>
  );
}
