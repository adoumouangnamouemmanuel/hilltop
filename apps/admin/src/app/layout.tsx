import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { themeScript } from "@hilltop/ui/theme";
import { Providers } from "@/components/providers";
import { currentConfig, listReleases } from "@/lib/config-store";
import { accessKeyRequired } from "@/lib/session";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Hilltop Admin", template: "%s · Hilltop Admin" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0c" },
  ],
};

// The published config changes at runtime, so every request reads the latest.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [config, releases] = await Promise.all([currentConfig(), listReleases()]);
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers published={{ config, releases, accessKeyRequired: accessKeyRequired() }}>{children}</Providers>
      </body>
    </html>
  );
}
