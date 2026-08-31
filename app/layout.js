export const metadata = {
  title: "Qva🇨🇺CHOP 🛒",
  description: "Tienda online de productos digitales",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#0b0b0f",
          color: "#ffffff",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
