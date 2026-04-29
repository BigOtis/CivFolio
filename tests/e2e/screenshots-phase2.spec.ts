import { expect, test } from "@playwright/test";
import path from "node:path";

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "phase2");

const VIEWS = [
  { name: "iphone-12-pro", w: 390, h: 844 },
  { name: "iphone-se", w: 320, h: 568 },
  { name: "landscape-720x400", w: 720, h: 400 },
  { name: "tablet-820x1180", w: 820, h: 1180 },
  { name: "desktop-1280x900", w: 1280, h: 900 },
] as const;

for (const view of VIEWS) {
  test(`spot-check phase2 ${view.name}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: view.w, height: view.h });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__CIVFOLIO_MAP_TEST__));
    if ((await page.getByTestId("intro-panel").count()) > 0) {
      await page.getByRole("button", { name: "Skip Intro" }).click({ force: true });
      await expect(page.getByTestId("intro-panel")).toHaveCount(0);
    }
    await page.waitForFunction(
      () => (window.__CIVFOLIO_MAP_TEST__?.getDebug().cityCount ?? 0) >= 11,
    );

    await page.screenshot({
      path: path.join(OUT, `${view.name}-overview.png`),
      fullPage: false,
    });

    if (view.w < 760) {
      // Open the controls panel so we can capture the surfaced nav links and
      // the simplified controls grid (Map Key/Music/Civilopedia/About).
      await page.getByRole("button", { name: "Controls" }).click();
      await expect(page.getByTestId("mobile-controls-panel")).toBeVisible();
      await page.waitForTimeout(180);
      await page.screenshot({
        path: path.join(OUT, `${view.name}-controls-open.png`),
        fullPage: false,
      });

      // Toggle Map Key while controls are still open. The legend should pin
      // directly under the HUD (Phase 2.4) instead of overlapping it.
      await page.getByRole("button", { name: "Map Key" }).click();
      await expect(page.getByTestId("mobile-legend-panel")).toBeVisible();
      await page.waitForTimeout(180);
      await page.screenshot({
        path: path.join(OUT, `${view.name}-mapkey-open.png`),
        fullPage: false,
      });

      // Capture the leader profile, redesigned for compact (Phase 2.1).
      // Reload to reset all open panels rather than toggling around the
      // legend overlay (which captures pointer events while open).
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(
        () => (window.__CIVFOLIO_MAP_TEST__?.getDebug().cityCount ?? 0) >= 11,
      );
      await page.getByRole("button", { name: "Leader" }).click();
      await page.waitForTimeout(180);
      await page.screenshot({
        path: path.join(OUT, `${view.name}-leader-profile.png`),
        fullPage: false,
      });
    }
  });
}
