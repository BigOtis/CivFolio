import type { MetadataRoute } from "next";

import { getWorldData } from "@/lib/content";

export const dynamic = "force-static";

const baseUrl = "https://projectempire.robot-future.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { works } = await getWorldData();
  const staticRoutes = ["", "/archive", "/about"];

  return [
    ...staticRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: route === "" ? 1 : 0.7,
    })),
    ...works.map((work) => ({
      url: `${baseUrl}/work/${work.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: work.slug === "civfolio" ? 0.9 : 0.65,
    })),
  ];
}
