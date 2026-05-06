import { describe, expect, it } from "vitest";

import { getWorldData } from "../src/lib/content";

describe("content loading", () => {
  it("loads Phil's portfolio content and validates the configured work facets", async () => {
    const data = await getWorldData();

    expect(data.site.title).toBe("Project Empire");
    expect(data.works).toHaveLength(11);
    expect(data.works.some((work) => work.code)).toBe(true);
    expect(data.works.some((work) => work.art)).toBe(true);
    expect(data.works.some((work) => work.video)).toBe(true);
    expect(data.works.some((work) => work.writing)).toBe(true);
    expect(data.works.some((work) => work.client)).toBe(true);
    expect(data.works.some((work) => work.slug === "civfolio")).toBe(true);
    expect(data.works.some((work) => work.slug === "localtalker")).toBe(true);
    expect(data.works.some((work) => work.slug === "popcurrent")).toBe(true);
  });
});
