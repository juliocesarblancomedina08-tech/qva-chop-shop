import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="shop-container">
      <header className="header">
        <div className="logo">🎮 Qva🇨🇺CHOP 🛒</div>

        <p className="subtitle">
          Tu tienda gaming
        </p>
      </header>

      <section className="products-section">
        <Link
          href="/offers"
          className="product-link"
        >
          <article className="store-product">

            <div className="product-image">
              <Image
                src="/Images.jpeg"
                alt="Diamonds Singapur"
                fill
                sizes="(max-width: 600px) 100vw, 500px"
              />
            </div>

            <div className="store-product-info">
              <h1>
                💎 100 — 2200💎
              </h1>

              <p>
                Diamonds Singapur
              </p>
            </div>

          </article>
        </Link>
      </section>

      <footer className="footer">
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>
    </main>
  );
}
