import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavSidebar } from "@/components/nav-sidebar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AlertOptimizer — Soutenance de rattrapage",
  description:
    "Filtrage intelligent des faux positifs SAST par apprentissage automatique — re-validation expérimentale sur 66 227 alertes réelles (OWASP Benchmark + NIST Juliet).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <KeyboardShortcuts />
        <div className="flex min-h-screen">
          <NavSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
