"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CartButton() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const loadCart = () => {
      const savedCart = localStorage.getItem("qva_cart");

      if (savedCart) {
        try {
          setItems(JSON.parse(savedCart));
        } catch {
          setItems([]);
        }
      } else {
        setItems([]);
      }
    };

    loadCart();

    window.addEventListener("cartUpdated", loadCart);

    return () => {
      window.removeEventListener("cartUpdated", loadCart);
    };
  }, []);

  return (
    <Link href="/cart" className="cart-icon">
      🛒
      {items.length > 0 && (
        <span className="cart-count">
          {items.length}
        </span>
      )}
    </Link>
  );
    }
