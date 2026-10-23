import { themeBootstrap } from '@/lib/theme-bootstrap';
import { ToastProvider } from '@/components/ui/toast';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reporty",
  description: "Segnalazioni e revisioni per siti e app web",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      suppressHydrationWarning
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <ToastProvider>{children}</ToastProvider>
        <Script
          src="https://reporty-extension.vercel.app/widget/reporty.js"
          data-reporty="54dadc65-faee-44d8-a633-301668ffe30b"
          strategy="afterInteractive"
          defer
        />
      </body>
    </html>
  );
}
