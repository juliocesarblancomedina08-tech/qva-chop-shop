import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main
      className="shop-container"
      style={{
        backgroundImage: "url('/fondo pagina.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        minHeight: "100vh",
      }}
    >
      <header
        className="header"
        style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <div className="logo">🎮 Qva🇨🇺CHOP 🛒</div>

        <p className="subtitle">
          Tu tienda gaming
        </p>
      </header>

      <section className="products-section">
        /offers
          <article
            className="store-product"
            style={{
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(5px)",
            }}
          >
            <div className="product-image">
              /Images.jpeg 100vw, 500px"
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

      <footer
        className="footer"
        style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: "12px",
          padding: "10px",
        }}
      >
        ⚡ Entrega rápida · 🛡️ Compra segura
      </footer>
    </main>
  );
          }
