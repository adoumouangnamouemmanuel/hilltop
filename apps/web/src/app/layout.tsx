import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { Announcement } from "@/components/announcement";
import { Header } from "@/components/header";
import { FeedbackButton } from "@/components/feedback";
import { Footer } from "@/components/footer";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/toaster";
import { getPlatformConfig } from "@/lib/config-server";
import { getMarket } from "@/lib/market-server";
import type { Market } from "@/lib/market";
import { protectionSummary } from "@hilltop/shared/payments";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPlatformConfig();
  const { brand } = config;
  return {
    title: { default: `${brand.name} · ${brand.tagline}`, template: `%s · ${brand.name}` },
    description: `Buy and sell with verified students. ${protectionSummary(config)}`,
  };
}

export const viewport: Viewport = {
  // Android shrinks the layout when the keyboard opens, so chat composers stay visible.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0c" },
  ],
};

// Every page carries the market to the browser, so descriptions are shortened there;
// listing pages load the full text from the server.
const forBrowser = (market: Market): Market => ({
  ...market,
  listings: market.listings.map((l) => (l.description.length > 200 ? { ...l, description: `${l.description.slice(0, 200)}…` } : l)),
});

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [config, market] = await Promise.all([getPlatformConfig(), getMarket().then(forBrowser)]);
  return (
    // The theme class is set by the inline script before hydration.
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers config={config} market={market}>
          <Announcement />
          <Header />
          {/* Clipping (not hiding) keeps sticky elements working while stopping any wide content from scrolling the page sideways. */}
          <main id="main" className="min-w-0 flex-1 overflow-x-clip pb-28 md:pb-0">
            {children}
          </main>
          <Footer />
          <MobileTabBar />
          <FeedbackButton />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
