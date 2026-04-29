import { expect, test } from "@playwright/test";
import path from "node:path";

const OUT = path.resolve(__dirname, "..", "..", "screenshots", "phase1");

const VIEWS = [
  { name: "iphone-12-pro", w: 390, h: 844 },
  { name: "iphone-se", w: 320, h: 568 },
  { name: "landscape-720x400", w: 720, h: 400 },
  { name: "tablet-820x1180", w: 820, h: 1180 },
] as const;

async function dispatchHandlePointerDrag(
  page: import("@playwright/test").Page,
  deltaY: number,
) {
  await page.evaluate(async (dy: number) => {
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
    for (let step = 1; step <= 8; step++) {
      node.dispatchEvent(
        new PointerEvent("pointermove", {
          ...baseInit,
          clientY: startY + (dy * step) / 8,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    node.dispatchEvent(
      new PointerEvent("pointerup", {
        ...baseInit,
        clientY: startY + dy,
        buttons: 0,
      }),
    );
  }, deltaY);
}

for (const view of VIEWS) {
  test(`spot-check ${view.name}`, async ({ page }) => {
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

    await page.evaluate(() => {
      window.__CIVFOLIO_MAP_TEST__?.openCity("robot-future");
    });
    await expect(page.getByTestId("city-popup")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT, `${view.name}-popup-default.png`),
      fullPage: false,
    });

    if (view.w < 760 || (view.h < 760 && view.w < 920)) {
      // Drag up to full
      await dispatchHandlePointerDrag(page, -220);
      await expect(page.getByTestId("city-popup")).toHaveAttribute(
        "data-sheet-state",
        "full",
      );
      await page.waitForTimeout(280);
      await page.screenshot({
        path: path.join(OUT, `${view.name}-popup-full.png`),
        fullPage: false,
      });

      // Drag down to half
      await dispatchHandlePointerDrag(page, 220);
      await expect(page.getByTestId("city-popup")).toHaveAttribute(
        "data-sheet-state",
        "half",
      );
      await page.waitForTimeout(280);

      // Drag down again to peek
      await dispatchHandlePointerDrag(page, 220);
      await expect(page.getByTestId("city-popup")).toHaveAttribute(
        "data-sheet-state",
        "peek",
      );
      await page.waitForTimeout(280);
      await page.screenshot({
        path: path.join(OUT, `${view.name}-popup-peek.png`),
        fullPage: false,
      });
    }
  });
}
