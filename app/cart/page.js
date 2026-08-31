"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CartPage() {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    loadCart();

    function handleCartUpdated() {
      loadCart();
    }

    window.addEventListener(
      "cartUpdated",
      handleCartUpdated
    );

    return () => {
      window.removeEventListener(
        "cartUpdated",
        handleCartUpdated
      );
    };
  }, []);

  function loadCart() {
    try {
      const savedCart =
        localStorage.getItem("qva_cart");

      if (!savedCart) {
        setCart([]);
        return;
      }

      const parsed = JSON.parse(savedCart);

      if (!Array.isArray(parsed)) {
        setCart([]);
        return;
      }

      const cleanCart = parsed
        .filter(
          (item) =>
            Number.isInteger(
              Number(item?.productId)
            )
        )
        .map((item) => ({
          productId: Number(
            item.productId
          ),

          diamonds: String(
            item.diamonds || ""
          ),

          price: Number(
            item.price || 0
          ),

          quantity: Math.max(
            1,
            Number(
              item.quantity || 1
            )
          ),
        }));

      setCart(cleanCart);
    } catch (error) {
      console.error(
        "LOAD_CART_ERROR:",
        error
      );

      setCart([]);
    }
  }

  function saveCart(newCart) {
    setCart(newCart);

    localStorage.setItem(
      "qva_cart",
      JSON.stringify(newCart)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );
  }

  function increaseQuantity(productId) {
    const newCart = cart.map((item) => {
      if (
        item.productId === productId
      ) {
        return {
          ...item,
          quantity:
            item.quantity + 1,
        };
      }

      return item;
    });

    saveCart(newCart);
  }

  function decreaseQuantity(productId) {
    const newCart = cart
      .map((item) => {
        if (
          item.productId === productId
        ) {
          return {
            ...item,
            quantity:
              item.quantity - 1,
          };
        }

        return item;
      })
      .filter(
        (item) => item.quantity > 0
      );

    saveCart(newCart);
  }

  function removeItem(productId) {
    const newCart = cart.filter(
      (item) =>
        item.productId !== productId
    );

    saveCart(newCart);
  }

  function clearCart() {
    localStorage.removeItem(
      "qva_cart"
    );

    setCart([]);

    window.dispatchEvent(
      new Event("cartUpdated")
    );
  }

  const total = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.price || 0) *
        Number(item.quantity || 1),
    0
  );

  const totalItems = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 1),
    0
  );

  return (
    <main className="checkout-page">

      {/* HEADER */}

      <header className="checkout-header">

        <Link
          href="/"
          className="checkout-logo"
        >
          🎮 Qva🇨🇺CHOP 🛒
        </Link>

        <div className="checkout-secure">
          🔒 Compra segura
        </div>

      </header>

      {/* CONTENIDO */}

      <div className="checkout-container">

        <div className="checkout-main">

          {/* TÍTULO */}

          <div className="checkout-heading">

            <p className="checkout-step">
              CARRITO
            </p>

            <h1>
              Tu carrito
            </h1>

            <p>
              Revisa tus productos antes
              de continuar con el pago.
            </p>

          </div>

          {/* CARRITO VACÍO */}

          {cart.length === 0 ? (

            <section className="checkout-box">

              <div className="checkout-empty">

                <div
                  style={{
                    fontSize: "50px",
                    marginBottom: "15px",
                  }}
                >
                  🛒
                </div>

                <h2>
                  Tu carrito está vacío
                </h2>

                <p>
                  Todavía no has añadido
                  ningún producto.
                </p>

                <Link
                  href="/offers"
                  className="checkout-primary-button"
                  style={{
                    display: "inline-flex",
                    marginTop: "20px",
                  }}
                >
                  💎 VER OFERTAS
                  <span>→</span>
                </Link>

              </div>

            </section>

          ) : (

            <section className="checkout-box">

              <div className="checkout-box-title">

                <span className="checkout-number">
                  {totalItems}
                </span>

                <div>

                  <h2>
                    Productos
                  </h2>

                  <p>
                    {totalItems} producto
                    {totalItems !== 1
                      ? "s"
                      : ""} en tu carrito.
                  </p>

                </div>

              </div>

              <div className="checkout-products">

                {cart.map((item) => (

                  <div
                    className="checkout-product"
                    key={item.productId}
                  >

                    <div className="checkout-product-icon">
                      💎
                    </div>

                    <div className="checkout-product-info">

                      <strong>
                        {item.diamonds} Diamonds
                      </strong>

                      <span>
                        Diamonds Singapur
                      </span>

                      <span>
                        {Number(
                          item.price
                        ).toFixed(2)}{" "}
                        USDT c/u
                      </span>

                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginLeft: "auto",
                      }}
                    >

                      <button
                        type="button"
                        onClick={() =>
                          decreaseQuantity(
                            item.productId
                          )
                        }
                        style={{
                          width: "32px",
                          height: "32px",
                          cursor: "pointer",
                        }}
                      >
                        −
                      </button>

                      <strong>
                        {item.quantity}
                      </strong>

                      <button
                        type="button"
                        onClick={() =>
                          increaseQuantity(
                            item.productId
                          )
                        }
                        style={{
                          width: "32px",
                          height: "32px",
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>

                    </div>

                    <strong className="checkout-product-price">
                      {(
                        Number(
                          item.price
                        ) *
                        Number(
                          item.quantity
                        )
                      ).toFixed(2)}{" "}
                      USDT
                    </strong>

                    <button
                      type="button"
                      onClick={() =>
                        removeItem(
                          item.productId
                        )
                      }
                      style={{
                        cursor: "pointer",
                        marginLeft: "8px",
                      }}
                      aria-label="Eliminar producto"
                    >
                      🗑️
                    </button>

                  </div>

                ))}

              </div>

              <button
                type="button"
                onClick={clearCart}
                className="back-link"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  marginTop: "20px",
                }}
              >
                🗑️ Vaciar carrito
              </button>

            </section>

          )}

          <Link
            href="/offers"
            className="back-link"
          >
            ← Seguir comprando
          </Link>

        </div>

        {/* RESUMEN */}

        <aside className="checkout-summary">

          <div className="summary-header">

            <h2>
              Tu pedido
            </h2>

            <span>
              {totalItems} producto
              {totalItems !== 1
                ? "s"
                : ""}
            </span>

          </div>

          <div className="summary-items">

            {cart.map((item) => (

              <div
                className="summary-item"
                key={item.productId}
              >

                <span>
                  💎 {item.diamonds} ×{" "}
                  {item.quantity}
                </span>

                <strong>
                  {(
                    Number(
                      item.price
                    ) *
                    Number(
                      item.quantity
                    )
                  ).toFixed(2)}
                </strong>

              </div>

            ))}

          </div>

          <div className="summary-line">

            <span>
              Subtotal
            </span>

            <span>
              {total.toFixed(2)} USDT
            </span>

          </div>

          <div className="summary-total">

            <span>
              Total
            </span>

            <strong>
              {total.toFixed(2)} USDT
            </strong>

          </div>

          {cart.length > 0 ? (

            <Link
              href="/checkout"
              className="checkout-primary-button"
            >
              CHECKOUT
              <span>→</span>
            </Link>

          ) : (

            <div
              className="checkout-primary-button disabled"
            >
              CHECKOUT
              <span>→</span>
            </div>

          )}

          <div className="checkout-security">

            <div>
              🔒
            </div>

            <p>
              Pago seguro con USDT BEP-20.
            </p>

          </div>

        </aside>

      </div>

    </main>
  );
          }
