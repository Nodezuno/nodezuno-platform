import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nodezuno",
    short_name: "Nodezuno",
    description:
      "Fixed-scope security reviews for smart contract and protocol releases across supported EVM and non-EVM ecosystems.",
    start_url: "/",
    display: "standalone",
    background_color: "#070908",
    theme_color: "#070908",
    icons: [
      {
        src: "/nodezuno-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/favicon.png",
        sizes: "128x128",
        type: "image/png",
      },
    ],
  };
}
