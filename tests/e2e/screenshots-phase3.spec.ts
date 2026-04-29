import { expect, test } from "@playwright/test";
import path from "node:path";

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "phase3");

const VIEWS = [
  { name: "iphone-12-pro", w: 390, h: 844 },
  { name: "iphone-se", w: 320, h: 568 },
  { name: "landscape-720x400", w: 720, h: 400 },
] as const;

for (const view of VIEWS) {
  test(`spot-check phase3 ${view.name}`, async ({ page }) => {
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

    // 1. Overview at rest with new typography floor and unscaled HUD.
    await page.screenshot({
      path: path.join(OUT, `${view.name}-overview.png`),
      fullPage: false,
    });

    // 2. Expanded timeline showing tick rail, year labels, and filter row.
    await page.getByRole("button", { name: /Open Timeline|Details/ }).click();
    await page.waitForTimeout(180);
    await page.screenshot({
      path: path.join(OUT, `${view.name}-timeline-details.png`),
      fullPage: false,
    });

    // 3. Hidden-work panel — open a city, peek the sheet, scrub year to 0.
    await page.getByRole("button", { name: /Hide Timeline|Hide/ }).click();
    await page.evaluate(() => {
      window.__CIVFOLIO_MAP_TEST__?.openCity("robot-future");
    });
    await page.waitForTimeout(200);
    // Drag handle down to peek so timeline is reachable.
    await page.evaluate(async () => {
      const node = document.querySelector(
        "[data-testid='city-popup-handle']",
      ) as HTMLElement | null;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      const baseInit: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: startX,
        clientY: startY,
        buttons: 1,
      };
      node.dispatchEvent(new PointerEvent("pointerdown", baseInit));
      const dy = 240;
      const totalSteps = 8;
      for (let step = 1; step <= totalSteps; step++) {
        node.dispatchEvent(
          new PointerEvent("pointermove", {
            ...baseInit,
            clientX: startX,
            clientY: startY + (dy * step) / totalSteps,
          }),
        );
        await new Promise((r) => setTimeout(r, 4));
      }
      node.dispatchEvent(
        new PointerEvent("pointerup", {
          ...baseInit,
          clientX: startX,
          clientY: startY + dy,
          buttons: 0,
        }),
      );
    });
    await page.waitForTimeout(120);
    const slider = page.getByLabel("Timeline slider");
    if (await slider.isVisible().catch(() => false)) {
      await slider.focus();
      await page.keyboard.press("Home");
      await page.waitForTimeout(280);
      await page.screenshot({
        path: path.join(OUT, `${view.name}-hidden-work-panel.png`),
        fullPage: false,
      });
    }
  });
}
