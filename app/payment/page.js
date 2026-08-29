"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [cart, setCart] = useState([]);
  const [txHash, setTxHash] = useState("");
  const [copied, setCopied] = useState(false);

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

  const walletAddress = "TU_DIRECCION_USDT_BEP20";

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="payment-page">

      {/* HEADER */}

      <header className="checkout-header">

        <Link
          href="/"
          className="checkout-logo"
        >
          🎮 Qva🇨🇺CHOP 🛒
        </Link>

        <div className="checkout-secure">
          🔒 Pago seguro
        </div>

      </header>

      {/* CONTENT */}

      <div className="payment-container">

        <div className="payment-main">

          {/* TITLE */}

          <div className="checkout-heading">

            <p className="checkout-step">
              PASO 2 DE 2
            </p>

            <h1>
              Realiza tu pago
            </h1>

            <p>
              Envía exactamente el importe indicado
              utilizando USDT en la red BEP-20.
            </p>

          </div>

          {/* PAYMENT METHOD */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                1
              </span>

              <div>
                <h2>
                  Método de pago
                </h2>

                <p>
                  Red seleccionada
                </p>
              </div>

            </div>

            <div className="payment-method">

              <div className="payment-method-icon">
                🪙
              </div>

              <div>
                <strong>
                  USDT
                </strong>

                <span>
                  BNB Smart Chain · BEP-20
                </span>
              </div>

            </div>

          </section>

          {/* AMOUNT */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                2
              </span>

              <div>
                <h2>
                  Importe a pagar
                </h2>

                <p>
                  Envía exactamente esta cantidad.
                </p>
              </div>

            </div>

            <div className="payment-amount">
              <span>
                {total.toFixed(2)}
              </span>

              <strong>
                USDT
              </strong>
            </div>

          </section>

          {/* ADDRESS */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                3
              </span>

              <div>
                <h2>
                  Dirección de pago
                </h2>

                <p>
                  Envía USDT únicamente mediante BEP-20.
                </p>
              </div>

            </div>

            <div className="payment-address-box">

              <code>
                {walletAddress}
              </code>

              <button
                type="button"
                onClick={copyAddress}
                className="copy-button"
              >
                {copied ? "✓ COPIADO" : "📋 COPIAR"}
              </button>

            </div>

            <div className="payment-warning">
              ⚠️ No envíes fondos desde otra red.
              El pago debe realizarse mediante BEP-20.
            </div>

          </section>

          {/* QR */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                4
              </span>

              <div>
                <h2>
                  Código QR
                </h2>

                <p>
                  Escanea para realizar el pago.
                </p>
              </div>

            </div>

            <div className="payment-qr">

              <div className="qr-placeholder-large">
                QR
              </div>

            </div>

          </section>

          {/* TX HASH */}

          <section className="checkout-box">

            <div className="checkout-box-title">

              <span className="checkout-number">
                5
              </span>

              <div>
                <h2>
                  Confirmar pago
                </h2>

                <p>
                  Introduce el TX Hash después de realizar
                  el pago.
                </p>
              </div>

            </div>

            <label className="checkout-label">
              TX Hash
            </label>

            <input
              type="text"
              value={txHash}
              onChange={(e) =>
                setTxHash(e.target.value)
              }
              placeholder="Pega aquí el hash de la transacción"
              className="checkout-input"
            />

            <button
              type="button"
              className="checkout-primary-button payment-submit"
              disabled={!txHash.trim()}
            >
              🔍 VERIFICAR PAGO
              <span>→</span>
            </button>

          </section>

        </div>

        {/* ORDER SUMMARY */}

        <aside className="checkout-summary">

          <div className="summary-header">

            <h2>
              Tu pedido
            </h2>

            <span>
              {cart.length} producto
              {cart.length !== 1 ? "s" : ""}
            </span>

          </div>

          <div className="summary-items">

            {cart.map((item, index) => (

              <div
                className="summary-item"
                key={`${item.diamonds}-${index}`}
              >

                <span>
                  💎 {item.diamonds} Diamonds
                </span>

                <strong>
                  {Number(item.price).toFixed(2)}
                </strong>

              </div>

            ))}

          </div>

          <div className="summary-total">

            <span>
              Total
            </span>

            <strong>
              {total.toFixed(2)} USDT
            </strong>

          </div>

          <div className="checkout-security">

            <div>
              🔒
            </div>

            <p>
              Pago mediante USDT BEP-20.
              <br />
              No compartas tu TX Hash con terceros.
            </p>

          </div>

        </aside>

      </div>

    </main>
  );
            }
