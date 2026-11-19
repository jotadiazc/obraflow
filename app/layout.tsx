import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ObraFlow · Control de instalaciones",
  description: "Órdenes de trabajo, avances de terreno y recepciones firmadas.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-CL">
      <body className="antialiased">{children}</body>
    </html>
  );
}
