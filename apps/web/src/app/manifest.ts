import type { MetadataRoute } from "next";
import { brandName } from "@/modules/shared/site";

export default function manifest(): MetadataRoute.Manifest {
  const name = brandName;
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
