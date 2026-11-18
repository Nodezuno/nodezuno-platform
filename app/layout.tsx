import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { AmbientPointer } from "@/components/client-effects";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { brandMessaging } from "@/lib/brand-messaging";
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
      default: "Nodezuno | Cybersecurity for Smart Contract and Protocol Upgrades",
      template: "%s | Nodezuno",
    },
    description: brandMessaging.description,
    applicationName: "Nodezuno",
    category: "cybersecurity",
    creator: "Nodezuno",
    keywords: [
      "cybersecurity for smart contract upgrades",
      "blockchain cybersecurity review",
      "smart contract cybersecurity review",
      "protocol upgrade cybersecurity",
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
      title: brandMessaging.socialTitle,
      description: brandMessaging.socialDescription,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Nodezuno cybersecurity reviews for smart contract and protocol upgrades.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: brandMessaging.socialTitle,
      description: brandMessaging.socialDescription,
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
