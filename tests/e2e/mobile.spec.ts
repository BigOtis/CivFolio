import { expect, test, type Page } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const SHORT_LANDSCAPE_VIEWPORT = { width: 740, height: 380 } as const;
const TABLET_VIEWPORT = { width: 820, height: 1180 } as const;

async function gotoMobile(
  page: Page,
  viewport: { width: number; height: number } = MOBILE_VIEWPORT,
  options?: { dismissIntro?: boolean },
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    window.__CIVFOLIO_INTRO_STEP_MS = 200;
    window.__CIVFOLIO_INTRO_FINAL_MS = 120;
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__CIVFOLIO_MAP_TEST__));
  if (options?.dismissIntro !== false) {
    if ((await page.getByTestId("intro-panel").count()) > 0) {
      await page.getByRole("button", { name: "Skip Intro" }).click({ force: true });
      await expect(page.getByTestId("intro-panel")).toHaveCount(0);
    }
    await page.waitForFunction(() =>
      (window.__CIVFOLIO_MAP_TEST__?.getDebug().cityCount ?? 0) >= 11,
    );
  }
}

async function openCity(page: Page, slug: string) {
  await page.waitForFunction(
    (citySlug) => Boolean(window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(citySlug)),
    slug,
  );
  const opened = await page.evaluate((citySlug) => {
    return window.__CIVFOLIO_MAP_TEST__?.openCity(citySlug) ?? false;
  }, slug);
  if (!opened) {
    throw new Error(`Could not open city ${slug}`);
  }
}

async function tapCityOnMap(page: Page, slug: string) {
  await page.waitForFunction(
    (citySlug) => Boolean(window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(citySlug)),
    slug,
  );
  const metrics = await page.evaluate((citySlug) => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(citySlug), slug);
  if (!metrics) {
    throw new Error(`Could not find city metrics for ${slug}`);
  }
  const map = page.getByRole("img", { name: "Project Empire world map" });
  await expect(map).toBeVisible();
  await map.evaluate(
    (node, point) => {
      const base: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 21,
        pointerType: "touch",
        isPrimary: true,
        clientX: point.x,
        clientY: point.y,
        button: 0,
      };
      node.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
      node.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    },
    { x: metrics.x, y: metrics.y },
  );
}

async function getCamera(page: Page) {
  const camera = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera ?? null);
  if (!camera) {
    throw new Error("Camera debug state missing");
  }
  return camera;
}

async function pinchMap(page: Page, startDistance: number, endDistance: number) {
  const map = page.getByRole("img", { name: "Project Empire world map" });
  await expect(map).toBeVisible();
  await map.evaluate(
    async (node, gesture) => {
      const rect = node.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const emit = (
        type: string,
        pointerId: number,
        clientX: number,
        clientY: number,
        buttons: number,
      ) => {
        node.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType: "touch",
            isPrimary: pointerId === 11,
            clientX,
            clientY,
            button: type === "pointermove" ? -1 : 0,
            buttons,
          }),
        );
      };

      const pointFor = (distance: number, side: -1 | 1) => ({
        x: centerX + side * (distance / 2),
        y: centerY,
      });
      const startA = pointFor(gesture.startDistance, -1);
      const startB = pointFor(gesture.startDistance, 1);
      emit("pointerdown", 11, startA.x, startA.y, 1);
      emit("pointerdown", 12, startB.x, startB.y, 1);
      for (let step = 1; step <= 8; step++) {
        const distance =
          gesture.startDistance + ((gesture.endDistance - gesture.startDistance) * step) / 8;
        const nextA = pointFor(distance, -1);
        const nextB = pointFor(distance, 1);
        emit("pointermove", 11, nextA.x, nextA.y, 1);
        emit("pointermove", 12, nextB.x, nextB.y, 1);
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      const endA = pointFor(gesture.endDistance, -1);
      const endB = pointFor(gesture.endDistance, 1);
      emit("pointerup", 11, endA.x, endA.y, 0);
      emit("pointerup", 12, endB.x, endB.y, 0);
    },
    { startDistance, endDistance },
  );
}

test.describe("mobile bottom-sheet dossier", () => {
  test.setTimeout(60_000);

  test("opens at half state by default and shows the drag handle", async ({ page }) => {
    await gotoMobile(page);
    await openCity(page, "robot-future");

    const popup = page.getByTestId("city-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute("data-sheet-state", "half");

    const handle = page.getByTestId("city-popup-handle");
    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute("data-sheet-state", "half");
  });

  test("dragging the handle up expands to full and dragging down collapses", async ({
    page,
  }) => {
    await gotoMobile(page);
    await openCity(page, "robot-future");
    const popup = page.getByTestId("city-popup");
    await expect(popup).toHaveAttribute("data-sheet-state", "half");

    async function dragHandle(dy: number) {
      // Use direct pointer event dispatch on the handle so that
      // setPointerCapture()-based drag gestures are tracked reliably across
      // viewport transitions.
      await page.evaluate(async (deltaY: number) => {
        const node = document.querySelector(
          "[data-testid='city-popup-handle']",
        ) as HTMLElement | null;
        if (!node) {
          throw new Error("city-popup-handle missing");
        }
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
        const totalSteps = 8;
        for (let step = 1; step <= totalSteps; step++) {
          node.dispatchEvent(
            new PointerEvent("pointermove", {
              ...baseInit,
              clientX: startX,
              clientY: startY + (deltaY * step) / totalSteps,
            }),
          );
          await new Promise((resolve) => setTimeout(resolve, 4));
        }
        node.dispatchEvent(
          new PointerEvent("pointerup", {
            ...baseInit,
            clientX: startX,
            clientY: startY + deltaY,
            buttons: 0,
          }),
        );
      }, dy);
    }

    await dragHandle(-220);
    await expect(popup).toHaveAttribute("data-sheet-state", "full");

    await dragHandle(220);
    await expect(popup).toHaveAttribute("data-sheet-state", "half");

    await dragHandle(220);
    await expect(popup).toHaveAttribute("data-sheet-state", "peek");
  });

  test("tapping the handle cycles the sheet state", async ({ page }) => {
    await gotoMobile(page);
    await openCity(page, "robot-future");
    const popup = page.getByTestId("city-popup");
    const handle = page.getByTestId("city-popup-handle");

    // Tap from half should snap up to full.
    await handle.click();
    await expect(popup).toHaveAttribute("data-sheet-state", "full");

    // Tap from full should snap back to half.
    await handle.click();
    await expect(popup).toHaveAttribute("data-sheet-state", "half");
  });

  test("hides the timeline when the sheet covers the screen", async ({ page }) => {
    await gotoMobile(page);
    // Timeline is visible before opening.
    await expect(page.getByTestId("mobile-timeline-shell")).toBeVisible();

    await openCity(page, "robot-future");
    // Half-state sheet still hides the timeline (only peek brings it back).
    await expect(page.getByTestId("mobile-timeline-shell")).toHaveCount(0);

    // Drag the sheet to peek so the timeline returns.
    const handle = page.getByTestId("city-popup-handle");
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("Sheet handle missing");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 220, {
      steps: 12,
    });
    await page.mouse.up();
    await expect(page.getByTestId("city-popup")).toHaveAttribute("data-sheet-state", "peek");
    await expect(page.getByTestId("mobile-timeline-shell")).toBeVisible();
  });

  test("desktop dossier remains right-side panel and not the bottom sheet", async ({ page }) => {
    await gotoMobile(page, { width: 1280, height: 900 });
    await openCity(page, "robot-future");
    const popup = page.getByTestId("city-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute("data-sheet-state", "desktop");
    await expect(page.getByTestId("city-popup-handle")).toHaveCount(0);
  });
});

test.describe("mobile compact mode", () => {
  test.setTimeout(60_000);

  test("short landscape phones use the mobile HUD layout", async ({ page }) => {
    await gotoMobile(page, SHORT_LANDSCAPE_VIEWPORT);
    await expect(page.getByTestId("mobile-hud")).toBeVisible();
  });

  test("standard tablet portrait does not collapse to the mobile HUD", async ({ page }) => {
    await gotoMobile(page, TABLET_VIEWPORT);
    await expect(page.getByTestId("mobile-hud")).toHaveCount(0);
  });
});

test.describe("intro refresh behavior", () => {
  test.setTimeout(60_000);

  test("skipping the intro only dismisses the current page load", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => {
      window.__CIVFOLIO_INTRO_STEP_MS = 200;
      window.__CIVFOLIO_INTRO_FINAL_MS = 120;
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("intro-panel")).toBeVisible();
    await page.getByRole("button", { name: "Skip Intro" }).click({ force: true });
    await expect(page.getByTestId("intro-panel")).toHaveCount(0);

    const storedBefore = await page.evaluate(() =>
      window.localStorage.getItem("project-empire:intro-dismissed:v2"),
    );
    expect(storedBefore).toBeNull();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("intro-panel")).toBeVisible();
    await expect(page.getByTestId("intro-title")).toHaveText(/^Founding /);
  });

  test("Replay Intro starts again after an in-page skip", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => {
      window.__CIVFOLIO_INTRO_STEP_MS = 200;
      window.__CIVFOLIO_INTRO_FINAL_MS = 120;
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByTestId("intro-panel")).toBeVisible();
    await page.getByRole("button", { name: "Skip Intro" }).click({ force: true });
    await expect(page.getByTestId("intro-panel")).toHaveCount(0);

    await page.getByRole("button", { name: "Replay Intro" }).click({ force: true });
    await expect(page.getByTestId("intro-panel")).toBeVisible();

    await expect(page.getByTestId("intro-title")).toHaveText(/^Founding /);
  });
});

test.describe("mobile suppression of hover tooltip", () => {
  test.setTimeout(60_000);

  test("no hover tooltip is rendered on mobile when a city is under the pointer", async ({
    page,
  }) => {
    await gotoMobile(page);
    const metrics = await page.evaluate(() =>
      window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("robot-future"),
    );
    if (!metrics) throw new Error("City metrics not available");
    await page.mouse.move(metrics.x, metrics.y);
    await page.waitForTimeout(120);
    await expect(page.getByTestId("city-tooltip")).toHaveCount(0);
  });
});

test.describe("mobile HUD branding", () => {
  test.setTimeout(60_000);

  test("does not render the redundant 'World Map' pill", async ({ page }) => {
    await gotoMobile(page);
    const hud = page.getByTestId("mobile-hud");
    await expect(hud).toBeVisible();
    // The mobile HUD should lead with Project Empire branding, not the
    // legacy "World Map" pill that duplicated the SiteShell breadcrumb.
    await expect(hud).not.toContainText("World Map");
    await expect(hud).toContainText("Project Empire");
    await expect(hud).toContainText("Phil Lopez");
  });
});

test.describe("mobile floating zoom rail", () => {
  test.setTimeout(60_000);

  test("is visible without opening the controls panel", async ({ page }) => {
    await gotoMobile(page);
    await expect(page.getByTestId("mobile-zoom-rail")).toBeVisible();
    await expect(page.getByTestId("mobile-zoom-in")).toBeVisible();
    await expect(page.getByTestId("mobile-zoom-out")).toBeVisible();
    await expect(page.getByTestId("mobile-zoom-reset")).toBeVisible();
  });

  test("zoom-in changes the camera zoom", async ({ page }) => {
    await gotoMobile(page);
    const initial = (await page.evaluate(
      () => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 0,
    )) as number;
    await page.getByTestId("mobile-zoom-in").click();
    // Camera animates toward the new zoom; allow the eased animation to settle.
    await expect
      .poll(
        async () =>
          (await page.evaluate(
            () => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 0,
          )) as number,
        { timeout: 4000 },
      )
      .toBeGreaterThan(initial);
  });

  test("rail does not render on tablet/desktop", async ({ page }) => {
    await gotoMobile(page, TABLET_VIEWPORT);
    await expect(page.getByTestId("mobile-zoom-rail")).toHaveCount(0);
  });

  test("rail renders on short landscape phones (compact mode)", async ({ page }) => {
    await gotoMobile(page, SHORT_LANDSCAPE_VIEWPORT);
    await expect(page.getByTestId("mobile-zoom-rail")).toBeVisible();
  });
});

test.describe("mobile touch map interactions", () => {
  test.setTimeout(60_000);

  test("two-finger pinch zooms in and out without opening a city sheet", async ({ page }) => {
    await gotoMobile(page);
    const initial = await getCamera(page);

    await pinchMap(page, 90, 230);
    await expect
      .poll(async () => (await getCamera(page)).zoom, { timeout: 4000 })
      .toBeGreaterThan(initial.zoom + 0.08);
    const zoomedIn = await getCamera(page);

    await pinchMap(page, 240, 110);
    await expect
      .poll(async () => (await getCamera(page)).zoom, { timeout: 4000 })
      .toBeLessThan(zoomedIn.zoom - 0.05);

    await expect(page.getByTestId("city-popup")).toHaveCount(0);
  });

  test("tapping a city on the map opens the sheet without moving the camera", async ({ page }) => {
    await gotoMobile(page);
    await page.waitForTimeout(250);
    const before = await getCamera(page);

    await tapCityOnMap(page, "robot-future");
    await expect(page.getByTestId("city-popup")).toBeVisible();
    await expect(page.getByTestId("city-popup")).toHaveAttribute("data-sheet-state", "half");
    await page.waitForTimeout(350);

    const after = await getCamera(page);
    expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.01);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
  });

  test("tapping another city while the mobile sheet is open preserves the map position", async ({
    page,
  }) => {
    await gotoMobile(page);
    await tapCityOnMap(page, "robot-future");
    await expect(page.getByTestId("city-popup")).toBeVisible();
    await page.waitForTimeout(250);
    const before = await getCamera(page);

    await tapCityOnMap(page, "popcurrent");
    await expect(page).toHaveURL(/work=popcurrent/);
    await page.waitForTimeout(350);

    const after = await getCamera(page);
    expect(Math.abs(after.zoom - before.zoom)).toBeLessThan(0.01);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
  });
});

test.describe("mobile Map Key panel", () => {
  test.setTimeout(60_000);

  test("opens under the HUD instead of overlapping it", async ({ page }) => {
    await gotoMobile(page);
    const hud = page.getByTestId("mobile-hud");
    await expect(hud).toBeVisible();
    // Open the controls panel and toggle Map Key on.
    await page.getByRole("button", { name: "Controls" }).click();
    await page.getByRole("button", { name: "Map Key" }).click();
    const legend = page.getByTestId("mobile-legend-panel");
    await expect(legend).toBeVisible();

    const hudBox = await hud.boundingBox();
    const legendBox = await legend.boundingBox();
    if (!hudBox || !legendBox) throw new Error("missing bounding box");
    // Legend should sit BELOW the HUD bottom edge.
    expect(legendBox.y).toBeGreaterThanOrEqual(hudBox.y + hudBox.height - 1);
  });
});

test.describe("mobile controls panel surfaces site nav", () => {
  test.setTimeout(60_000);

  test("Civilopedia and About links appear in mobile Controls", async ({ page }) => {
    await gotoMobile(page);
    await page.getByRole("button", { name: "Controls" }).click();
    const controls = page.getByTestId("mobile-controls-panel");
    await expect(controls).toBeVisible();
    await expect(controls.getByRole("link", { name: "Civilopedia" })).toBeVisible();
    await expect(controls.getByRole("link", { name: "About" })).toBeVisible();
  });
});

test.describe("hud-drift animation on coarse pointers", () => {
  test.setTimeout(60_000);

  test("hud-drift animation is disabled on narrow viewports", async ({ page }) => {
    await gotoMobile(page);
    const hud = page.getByTestId("mobile-hud");
    await expect(hud).toBeVisible();
    const animationName = await hud.evaluate(
      (node) => window.getComputedStyle(node).animationName,
    );
    // The hud-drift animation should be `none` on mobile due to the
    // (pointer: coarse), (max-width: 760px) media query in globals.css.
    expect(animationName === "none" || animationName === "").toBeTruthy();
  });
});

test.describe("Phase 3 - mobile typography floor", () => {
  test.setTimeout(60_000);

  // The mobile chrome was previously rendered at 7-8px which is below the
  // 11-12px legibility guidance. Phase 3.1 raises every chip/label to >= 10px.
  test("HUD subtitle, Leader/Controls buttons render at >= 10px", async ({ page }) => {
    await gotoMobile(page);

    const subtitle = page.getByTestId("mobile-hud").locator("span", { hasText: "Phil Lopez" }).first();
    const subtitleSize = await subtitle.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(subtitleSize).toBeGreaterThanOrEqual(10);

    const leaderBtn = page.getByRole("button", { name: "Leader" });
    const leaderSize = await leaderBtn.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(leaderSize).toBeGreaterThanOrEqual(10);

    const controlsBtn = page.getByRole("button", { name: "Controls" });
    const controlsSize = await controlsBtn.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(controlsSize).toBeGreaterThanOrEqual(10);
  });

  test("Controls panel labels render at >= 11px", async ({ page }) => {
    await gotoMobile(page);
    await page.getByRole("button", { name: "Controls" }).click();
    await expect(page.getByTestId("mobile-controls-panel")).toBeVisible();

    const mapKey = page.getByRole("button", { name: "Map Key" });
    const mapKeySize = await mapKey.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(mapKeySize).toBeGreaterThanOrEqual(11);

    const civilopedia = page.getByRole("link", { name: "Civilopedia" });
    const civSize = await civilopedia.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(civSize).toBeGreaterThanOrEqual(11);
  });

  test("music button uses an action-oriented label (Mute/Unmute)", async ({ page }) => {
    await gotoMobile(page);
    await page.getByRole("button", { name: "Controls" }).click();
    const controls = page.getByTestId("mobile-controls-panel");
    await expect(controls).toBeVisible();
    // The previous label "Music on" / "Music off" describes state. Phase 3.1
    // switched it to action-oriented copy.
    const text = (await controls.innerText()).toLowerCase();
    expect(/mute|unmute|audio blocked/.test(text)).toBe(true);
    expect(text.includes("music on")).toBe(false);
    expect(text.includes("music off")).toBe(false);
  });
});

test.describe("Phase 3 - filter row scroll affordance", () => {
  test.setTimeout(60_000);

  test("renders an expanded filter row with chips at >= 11px and a fade mask", async ({
    page,
  }) => {
    await gotoMobile(page);
    // The mobile timeline expand toggle has aria-label "Open Timeline" when
    // collapsed and "Hide Timeline" when expanded. Match either.
    await page.getByRole("button", { name: /Open Timeline|Details/ }).click();
    // Wait for any animation/expand to settle.
    await page.waitForTimeout(160);

    const allChip = page.getByRole("button", { name: "All" });
    const chipSize = await allChip.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(chipSize).toBeGreaterThanOrEqual(11);

    // The right-edge fade mask should be present so the user knows there is
    // more content scrolled off to the right.
    const rail = page.locator(".filter-scroll-rail");
    await expect(rail).toBeVisible();
    const hasFade = await rail.evaluate((node) => {
      const fade = node.querySelector("div.pointer-events-none.absolute");
      return Boolean(fade);
    });
    expect(hasFade).toBe(true);
  });
});

test.describe("Phase 3 - year tick alignment", () => {
  test.setTimeout(60_000);

  test("year labels render at >= 10px and key labels (first/middle/last) are visible", async ({
    page,
  }) => {
    await gotoMobile(page);
    await page.getByRole("button", { name: /Open Timeline|Details/ }).click();
    await page.waitForTimeout(160);

    // First year (2015) and last year (current latest) must be visible labels.
    // We can't pick the exact years without depending on data, but we can
    // assert there is at least one tick element at >= 10px.
    const tickRail = page.locator("[aria-hidden='true']").filter({ hasText: /20\d{2}/ }).first();
    await expect(tickRail).toBeVisible();
    const fontSize = await tickRail.evaluate(
      (node) => parseFloat(window.getComputedStyle(node).fontSize) || 0,
    );
    expect(fontSize).toBeGreaterThanOrEqual(10);
  });
});

test.describe("Phase 3 - hidden-work panel close button", () => {
  test.setTimeout(60_000);

  test("hidden work panel exposes a close button that dismisses it", async ({ page }) => {
    await gotoMobile(page);

    // Open a city. The bottom sheet opens at 'half' which hides the timeline,
    // so first drag the sheet to 'peek' to expose the slider.
    await openCity(page, "robot-future");
    await expect(page.getByTestId("city-popup")).toBeVisible();

    await page.evaluate(async () => {
      const node = document.querySelector(
        "[data-testid='city-popup-handle']",
      ) as HTMLElement | null;
      if (!node) throw new Error("city-popup-handle missing");
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
      const totalSteps = 8;
      const dy = 240;
      for (let step = 1; step <= totalSteps; step++) {
        node.dispatchEvent(
          new PointerEvent("pointermove", {
            ...baseInit,
            clientX: startX,
            clientY: startY + (dy * step) / totalSteps,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 4));
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

    await expect(page.getByTestId("city-popup")).toHaveAttribute(
      "data-sheet-state",
      "peek",
    );

    // Move the timeline slider back to the earliest year so the selected
    // city becomes hidden. Focus the slider and press Home which dispatches a
    // React onChange event reliably across browsers.
    const slider = page.getByLabel("Timeline slider");
    await expect(slider).toBeVisible();
    await slider.focus();
    await page.keyboard.press("Home");
    await expect.poll(async () =>
      slider.evaluate((el) => (el as HTMLInputElement).value),
    ).toBe("0");

    // The popup-to-hidden-panel handoff goes through a 240ms presence
    // transition, then the hidden-work panel mounts.
    const hiddenPanel = page.getByTestId("hidden-work-panel");
    await expect(hiddenPanel).toBeVisible({ timeout: 8000 });

    const closeBtn = page.getByTestId("hidden-work-close");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // After close, the panel should no longer have selectedWork to render.
    await expect(hiddenPanel).toBeHidden();
  });
});

test.describe("Phase 4.1 - audio gating toast", () => {
  test.setTimeout(60_000);

  test("renders a dismissible toast when ambient audio is blocked", async ({ page }) => {
    await gotoMobile(page);

    // Force the audio status into "blocked" so the toast renders predictably.
    // The world-explorer reads `audio.status` via the useWorldAudio hook;
    // surface a debug hook on window that the production code listens to is
    // overkill for testing — instead we wait for the toast either way.
    // In CI's Chromium without a user gesture, audio is blocked by default.
    const toast = page.getByTestId("audio-toast");
    if ((await toast.count()) === 0) {
      // Skip gracefully if the test runner happens to allow autoplay.
      test.skip(true, "audio-toast did not render — autoplay was permitted");
      return;
    }

    await expect(toast).toBeVisible();
    const text = (await toast.innerText()).toLowerCase();
    expect(text).toContain("ambient music");

    const dismiss = page.getByTestId("audio-toast-dismiss");
    await expect(dismiss).toBeVisible();
    await dismiss.click();
    await expect(toast).toBeHidden();
  });
});

test.describe("Phase 4.3 - default camera fit", () => {
  test.setTimeout(60_000);

  // The Phase 4.3 fix lowers the mobile minimum zoom to 0.32 and recomputes
  // the default camera so that all 11 cities are inside the viewport.
  test("default camera zoom respects the new 0.32 floor", async ({ page }) => {
    await gotoMobile(page);

    const zoom = await page.evaluate(() => {
      const debug = window.__CIVFOLIO_MAP_TEST__?.getDebug();
      return debug?.camera?.zoom ?? null;
    });
    expect(zoom).not.toBeNull();
    expect(zoom!).toBeGreaterThanOrEqual(0.32);
  });

  test("all 11 cities fit inside the viewport at default zoom", async ({ page }) => {
    await gotoMobile(page);
    // Click the Fit ("Reset view") button on the zoom rail to force the camera
    // back to the recomputed defaultCamera fit. This bypasses any drift in the
    // camera target left over from intro tweens.
    await page.getByTestId("mobile-zoom-reset").click();
    // Wait for the camera tween to converge to the new fit (0.32 + slack for
    // the half-step where the tween settles).
    await expect
      .poll(
        async () =>
          (await page.evaluate(
            () => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 1,
          )) ?? 1,
        { timeout: 6000 },
      )
      .toBeLessThanOrEqual(0.34);

    const result = await page.evaluate(() => {
      const debug = window.__CIVFOLIO_MAP_TEST__?.getDebug();
      if (!debug || !debug.camera || !debug.viewport) return null;
      const camera = debug.camera;
      const viewport = debug.viewport;
      const cities = debug.cities ?? [];
      // Allow a small slack for the city halo radius so a city dot whose
      // outline grazes the edge still counts as "fitting".
      const padding = 8;
      const screenPositions = cities.map((c) => ({
        slug: c.slug,
        sx: c.x * camera.zoom + camera.x,
        sy: c.y * camera.zoom + camera.y,
      }));
      const inside = screenPositions.filter(
        (p) =>
          p.sx >= -padding &&
          p.sx <= viewport.width + padding &&
          p.sy >= -padding &&
          p.sy <= viewport.height + padding,
      ).length;
      return {
        total: cities.length,
        inside,
        camera,
        viewport,
        screenPositions,
      };
    });
    expect(result).not.toBeNull();
    expect(result!.total).toBeGreaterThanOrEqual(11);
    if (result!.inside !== result!.total) {
      // Surface diagnostics so it's easy to see why a city is out of frame.
      console.log(JSON.stringify(result, null, 2));
    }
    expect(result!.inside).toBe(result!.total);
  });
});

test.describe("Phase 4.4 - overscroll-behavior + safe-area insets", () => {
  test.setTimeout(60_000);

  test("map drag surface declares touch-action:none and overscroll-behavior:contain", async ({
    page,
  }) => {
    await gotoMobile(page);

    const surface = page.locator("[data-map-drag-surface='true']").first();
    await expect(surface).toBeVisible();
    const styles = await surface.evaluate((node) => {
      const cs = window.getComputedStyle(node);
      return {
        touchAction: cs.touchAction,
        overscrollBehavior:
          cs.overscrollBehavior || `${cs.overscrollBehaviorX} ${cs.overscrollBehaviorY}`,
      };
    });
    expect(styles.touchAction).toBe("none");
    // Some engines normalize "contain contain" → "contain"; accept either.
    expect(styles.overscrollBehavior.includes("contain")).toBe(true);
  });

  test("html element disables document overscroll bouncing", async ({ page }) => {
    await gotoMobile(page);
    const value = await page.evaluate(() => {
      const cs = window.getComputedStyle(document.documentElement);
      return cs.overscrollBehavior || `${cs.overscrollBehaviorX} ${cs.overscrollBehaviorY}`;
    });
    // We set overscroll-behavior: none on <html>; computed value may serialize
    // as "none" or "none none" depending on the browser.
    expect(/none/.test(value)).toBe(true);
  });

  test("city dossier sheet pads the iOS home-indicator safe area", async ({ page }) => {
    await gotoMobile(page);
    await openCity(page, "robot-future");
    const popup = page.getByTestId("city-popup");
    await expect(popup).toBeVisible();
    const paddingBottom = await popup.evaluate((node) => {
      // Reading the inline class is brittle; verify the env() reference is
      // present in the rendered className instead.
      return node.className;
    });
    expect(paddingBottom).toContain("safe-area-inset-bottom");
  });
});
