import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { LanguageProvider } from "@/lib/i18n/LanguageContext"
import { ConnectionStatusProvider } from "@/contexts/ConnectionStatusContext"
import "@/app/dashboard/theme.css"
import { SonnerToaster } from '@/components/ui/sonner-config';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SLURM Container Manager",
  description: "Web interface for managing SLURM containers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased theme-default`}>
        <ThemeProvider 
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="ui-theme"
        >
          <LanguageProvider>
            <ConnectionStatusProvider
              cacheEnabled={true}
              cacheTTL={60000} // 1 minute cache
              refreshInterval={30000} // 30 second auto-refresh
              enableAutoRefresh={true}
            >
              {children}
              <SonnerToaster />
            </ConnectionStatusProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
