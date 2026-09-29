import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MSB Sparkle";
  return {
    name: `${name} Cleaner`,
    short_name: name,
    description: "Your jobs, check-ins and earnings.",
    start_url: "/cleaner",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
