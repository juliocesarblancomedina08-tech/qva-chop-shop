import "./globals.css";
import CartButton from "./CartButton";

export const metadata = {
  title: "Qva🇨🇺CHOP 🛒",
  description: "Tienda de productos digitales",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <CartButton />
        {children}
      </body>
    </html>
  );
}
