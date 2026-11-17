import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { AmbientPointer } from "@/components/client-effects";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { navigation } from "@/lib/site-data";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (process.env.NODEZUNO_RUNTIME === "container") {
    await connection();
  }
  const publicIndexing =
    process.env.NODEZUNO_PUBLIC_INDEXING === "true" &&
    process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED === "true";
  return {
    metadataBase: new URL("https://nodezuno.com"),
    title: {
      default: "Nodezuno | Smart Contract and Protocol Release Reviews",
      template: "%s | Nodezuno",
    },
    description:
      "Nodezuno compares a planned smart contract or protocol release with the version covered by a prior audit or professional security review, then delivers findings, reproducible evidence where feasible, and a reviewer-signed recommendation.",
    applicationName: "Nodezuno",
    category: "smart contract security",
    creator: "Nodezuno",
    keywords: [
      "smart contract release security review",
      "protocol release security review",
      "EVM release security review",
      "non-EVM release security review",
      "Solana program upgrade security",
      "Cosmos module upgrade security",
      "Move contract upgrade security",
      "governance payload review",
      "mainnet fork testing",
      "smart contract security",
      "protocol invariant testing",
      "deployment verification",
      "onchain release security",
      "DeFi security",
    ],
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Nodezuno",
      title: "Review your next smart contract or protocol release before production.",
      description:
        "Fixed-scope release reviews across supported EVM and non-EVM ecosystems, with prioritized findings, reproducible evidence where feasible, and a reviewer-signed recommendation.",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Nodezuno smart contract and protocol release security reviews.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Nodezuno Smart Contract and Protocol Release Reviews",
      description:
        "Compare one planned release with its previously audited or professionally reviewed version before production.",
      images: ["/og.png"],
    },
    robots: {
      index: publicIndexing,
      follow: publicIndexing,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070908",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (process.env.NODEZUNO_RUNTIME === "container") {
    await connection();
  }
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/manrope-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <AmbientPointer />
        <SiteHeader navigation={navigation} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
