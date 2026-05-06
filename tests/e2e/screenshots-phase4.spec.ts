import { expect, test } from "@playwright/test";
import path from "node:path";

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "phase4");

const VIEWS = [
  { name: "iphone-12-pro", w: 390, h: 844 },
  { name: "iphone-se", w: 320, h: 568 },
  { name: "landscape-720x400", w: 720, h: 400 },
] as const;

for (const view of VIEWS) {
  test(`spot-check phase4 ${view.name}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: view.w, height: view.h });
    await page.addInitScript(() => {
      window.__CIVFOLIO_INTRO_STEP_MS = 200;
      window.__CIVFOLIO_INTRO_FINAL_MS = 120;
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__CIVFOLIO_MAP_TEST__));
    if ((await page.getByTestId("intro-panel").count()) > 0) {
      await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (entry) => entry.textContent?.trim() === "Skip Intro",
        );
        if (button instanceof HTMLButtonElement) {
          button.click();
        }
      });
      await expect(page.getByTestId("intro-panel")).toHaveCount(0);
    }
    await page.waitForFunction(
      () => (window.__CIVFOLIO_MAP_TEST__?.getDebug().cityCount ?? 0) >= 11,
    );

    // Allow the camera tween to settle to the new fit-to-world default.
    await page.waitForTimeout(300);

    // 1. Default overview — verifies all cities visible at the new 0.32 floor.
    await page.screenshot({
      path: path.join(OUT, `${view.name}-default-fit.png`),
      fullPage: false,
    });

    // 2. Audio toast — only renders if Chromium blocks autoplay.
    if ((await page.getByTestId("audio-toast").count()) > 0) {
      await page.screenshot({
        path: path.join(OUT, `${view.name}-audio-toast.png`),
        fullPage: false,
      });
      await page.getByTestId("audio-toast-dismiss").click();
      await page.waitForTimeout(120);
    }

    // 3. Controls panel showing nav links surfaced on mobile.
    await page.getByRole("button", { name: "Controls" }).click().catch(async () => {
      // Desktop landscape may not show the mobile controls button; skip.
    });
    if ((await page.getByTestId("mobile-controls-panel").count()) > 0) {
      await page.screenshot({
        path: path.join(OUT, `${view.name}-controls-panel.png`),
        fullPage: false,
      });
    }
  });
}
