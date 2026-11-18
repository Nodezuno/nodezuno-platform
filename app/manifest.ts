import type { MetadataRoute } from "next";
import { brandMessaging } from "@/lib/brand-messaging";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nodezuno",
    short_name: "Nodezuno",
    description: brandMessaging.shortDescription,
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
