import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracker",
  description: "Plataforma de rastreamento veicular",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tracker",
  },
};

export const viewport: Viewport = {
  themeColor: "#111118",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body
        className="antialiased font-sans"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {children}
      </body>
    </html>
  );
}
