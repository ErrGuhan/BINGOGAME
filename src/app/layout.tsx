import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PWAProvider } from "@/context/PWAContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { UpdateToast } from "@/components/UpdateToast";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BingoDuel — Real-time 1v1 Bingo",
  description: "Real-time 1v1 head-to-head Bingo duels on synchronized boards.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BingoDuel",
  },
  icons: {
    icon: [
      { url: "/logo.svg" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f1222",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${plusJakarta.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="bg-surface font-body-md text-on-surface min-h-screen relative overflow-x-hidden select-none antialiased">
        {/* Atmospheric Ambient Mesh Gradient Background from Stitch */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-primary-container/15 blur-[80px]" />
          <div className="absolute top-1/3 -right-24 w-88 h-88 rounded-full bg-secondary-container/25 blur-[90px]" />
          <div className="absolute -bottom-20 left-1/4 w-72 h-72 rounded-full bg-primary-container/10 blur-[80px]" />
        </div>
        <PWAProvider>
          <ServiceWorkerRegistration />
          <UpdateToast />
          <ErrorBoundary>{children}</ErrorBoundary>
        </PWAProvider>
      </body>
    </html>
  );
}
