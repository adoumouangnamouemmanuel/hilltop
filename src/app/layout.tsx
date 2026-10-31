import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/toaster";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Hilltop · The Ashesi student marketplace",
    template: "%s · Hilltop",
  },
  description: "Buy and sell with verified Ashesi students. Payments are held until you collect your item.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme class is set by the inline script before hydration.
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <main id="main" className="flex-1 pb-28 md:pb-0">
            {children}
          </main>
          <Footer />
          <MobileTabBar />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
