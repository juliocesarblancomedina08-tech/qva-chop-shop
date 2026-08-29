import "./globals.css";

export const metadata = {
  title: "Qva🇨🇺CHOP 🛒",
  description: "Tienda de productos digitales",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
