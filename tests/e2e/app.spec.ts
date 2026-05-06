import { expect, test, type Page } from "@playwright/test";

const INTRO_TITLES = [
  "Founding IBM Support Engineer",
  "Founding Buster's TD",
  "Founding LocalTalker",
  "Founding PopCurrent",
  "Founding Character Chat",
  "Founding IBM AI and Machine Learning Engineer",
  "Founding Robot Future",
  "Founding CivFolio",
  "Founding Polylogue",
  "Founding OtisFuse",
] as const;

const CITY_SLUGS = [
  "ibm-support-engineer",
  "ibm-ai-machine-learning-engineer",
  "robot-future",
  "civfolio",
  "busters-td",
  "localtalker",
  "popcurrent",
  "character-chat",
  "polylogue",
  "otisfuse",
  "slopswapper",
] as const;

const WORLD_EVENT_KINDS = [
  "storm",
  "battle",
  "greatLeader",
  "invention",
  "festival",
  "trade",
  "discovery",
  "sabotage",
] as const;

async function openWorldMap(
  page: Page,
  options?: {
    fastIntro?: boolean;
    introStepMs?: number;
    introFinalMs?: number;
    creatorPromptDelayMs?: number;
    creatorPromptLifetimeMs?: number;
    worldEventMinMs?: number;
    worldEventMaxMs?: number;
    worldEventDurationMs?: number;
    worldEventKind?: (typeof WORLD_EVENT_KINDS)[number];
  },
) {
  if (options?.fastIntro || options?.introStepMs || options?.introFinalMs) {
    await page.addInitScript(() => {
      window.__CIVFOLIO_INTRO_STEP_MS = 420;
      window.__CIVFOLIO_INTRO_FINAL_MS = 260;
    });
  }
  if (options?.introStepMs || options?.introFinalMs) {
    const stepMs = options.introStepMs ?? 420;
    const finalMs = options.introFinalMs ?? 260;
    await page.addInitScript(
      ({ step, final }) => {
        window.__CIVFOLIO_INTRO_STEP_MS = step;
        window.__CIVFOLIO_INTRO_FINAL_MS = final;
      },
      { step: stepMs, final: finalMs },
    );
  }
  if (options?.creatorPromptDelayMs || options?.creatorPromptLifetimeMs) {
    const delayMs = options.creatorPromptDelayMs ?? 60_000;
    const lifetimeMs = options.creatorPromptLifetimeMs ?? 20_000;
    await page.addInitScript(
      ({ delay, lifetime }) => {
        window.__CIVFOLIO_CREATOR_PROMPT_DELAY_MS = delay;
        window.__CIVFOLIO_CREATOR_PROMPT_LIFETIME_MS = lifetime;
      },
      { delay: delayMs, lifetime: lifetimeMs },
    );
  }
  if (options?.worldEventMinMs || options?.worldEventMaxMs || options?.worldEventDurationMs) {
    const minMs = options.worldEventMinMs ?? 420;
    const maxMs = options.worldEventMaxMs ?? minMs;
    const durationMs = options.worldEventDurationMs ?? 4_000;
    await page.addInitScript(
      ({ min, max, duration }) => {
        window.__CIVFOLIO_WORLD_EVENT_MIN_MS = min;
        window.__CIVFOLIO_WORLD_EVENT_MAX_MS = max;
        window.__CIVFOLIO_WORLD_EVENT_DURATION_MS = duration;
      },
      { min: minMs, max: maxMs, duration: durationMs },
    );
  }
  if (options?.worldEventKind) {
    await page.addInitScript((kind) => {
      window.__CIVFOLIO_WORLD_EVENT_KIND = kind;
    }, options.worldEventKind);
  }
  await page.goto("/", { waitUntil: "networkidle" }).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ERR_CONNECTION_FAILED")) {
      throw error;
    }
    await page.waitForTimeout(500);
    await page.goto("/", { waitUntil: "networkidle" });
  });
  // The desktop/wide HUD shows "Strategy Map of Work" as a heading. Mobile/compact
  // HUDs collapse this to a "Strategy Map · {state}" subtitle next to the leader
  // name. Use the desktop heading on wide viewports and fall back to the mobile HUD
  // when the heading is not part of the rendered layout.
  const desktopHeading = page.getByRole("heading", { name: /Strategy Map of Work/i });
  if ((await desktopHeading.count()) > 0) {
    await expect(desktopHeading).toBeVisible();
  } else {
    await expect(page.getByTestId("mobile-hud")).toBeVisible();
  }
}

async function pressAction(page: Page, label: string) {
  await page.evaluate((buttonLabel) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (entry) => entry.textContent?.trim() === buttonLabel,
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${buttonLabel}`);
    }
    button.click();
  }, label);
}

async function allowMediaPlayback(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: () => undefined,
    });
  });
}

async function skipIntro(page: Page) {
  await pressAction(page, "Skip Intro");
  await expect(page.getByTestId("intro-panel")).toHaveCount(0);
}

async function skipIntroIfVisible(page: Page) {
  if ((await page.getByTestId("intro-panel").count()) > 0) {
    await skipIntro(page);
  }
}

async function getCityMetrics(page: Page, slug: string) {
  await page.waitForFunction(
    (citySlug) => Boolean(window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(citySlug)),
    slug,
  );
  const metrics = await page.evaluate((citySlug) => {
    return window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(citySlug) ?? null;
  }, slug);

  if (!metrics) {
    throw new Error(`City target not found: ${slug}`);
  }

  return metrics;
}

async function clickMapCity(page: Page, slug: string) {
  await page.waitForFunction(
    (citySlug) => Boolean(window.__CIVFOLIO_MAP_TEST__?.openCity(citySlug)),
    slug,
  );
  const opened = await page.evaluate((citySlug) => {
    return window.__CIVFOLIO_MAP_TEST__?.openCity(citySlug) ?? false;
  }, slug);

  if (!opened) {
    throw new Error(`City target not found: ${slug}`);
  }
}

async function hoverMapCity(page: Page, slug: string) {
  const metrics = await getCityMetrics(page, slug);
  await page.mouse.move(8, 8);
  const hoverPoints = [
    { x: metrics.x, y: metrics.y },
    { x: metrics.x + metrics.radius * 0.14, y: metrics.y },
    { x: metrics.x - metrics.radius * 0.14, y: metrics.y },
    { x: metrics.x, y: metrics.y + metrics.radius * 0.14 },
    { x: metrics.x, y: metrics.y - metrics.radius * 0.14 },
  ];

  for (const point of hoverPoints) {
    await page.mouse.move(point.x, point.y, { steps: 3 });
    await page.waitForTimeout(60);
  }
  return metrics;
}

async function setTimelineIndex(page: Page, index: number) {
  const slider = page.getByLabel("Timeline slider");
  const box = await slider.boundingBox();
  if (!box) {
    throw new Error("Timeline slider has no bounding box");
  }

  const min = Number(await slider.getAttribute("min"));
  const max = Number(await slider.getAttribute("max"));
  const ratio = (index - min) / (max - min || 1);
  await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

async function collectIntroTitles(page: Page, expectedTitles: readonly string[]) {
  const seen = new Set<string>();
  const initialText = await page.getByTestId("intro-title").textContent().catch(() => null);
  if (initialText) {
    seen.add(initialText);
  }

  await expect
    .poll(
      async () => {
        const text = await page.getByTestId("intro-title").textContent().catch(() => null);
        if (text) {
          seen.add(text);
        }
        return expectedTitles.filter((title) => seen.has(title));
      },
      { timeout: 16000, intervals: [120, 180, 220] },
    )
    .toEqual([...expectedTitles]);

  return [...seen];
}

test.describe("world map interactions", () => {
  test.setTimeout(60000);

  test("intro auto-starts on first load and advances without replay", async ({ page }) => {
    // Use a slightly slower step time so the test reliably observes the first title
    // even when Next.js cold-starts under parallel suite load. The intent of this
    // test is that the intro auto-starts and walks the full city sequence — which
    // collectIntroTitles asserts in order — so we don't need a brittle exact-text
    // check on the *current* title (the first title may already have advanced by
    // the time we look).
    await openWorldMap(page, { introStepMs: 1200, introFinalMs: 500 });

    await expect(page.getByTestId("intro-panel")).toBeVisible();
    await expect(page.getByTestId("intro-title")).toHaveText(/^Founding /);

    const seenTitles = await collectIntroTitles(page, INTRO_TITLES);
    expect(seenTitles).toEqual(INTRO_TITLES);
  });

  test("intro does not reveal future cities before their turn", async ({ page }) => {
    await openWorldMap(page, { introStepMs: 1100, introFinalMs: 500 });

    await expect
      .poll(async () => page.getByTestId("intro-title").textContent().catch(() => null))
      .toBe("Founding LocalTalker");

    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("localtalker") ?? null))
      .not.toBeNull();
    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("polylogue") ?? null))
      .toBeNull();
    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("ibm-ai-machine-learning-engineer") ?? null))
      .toBeNull();
    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("otisfuse") ?? null))
      .toBeNull();
  });

  test("intro keeps previously founded cities visible across timeline jumps", async ({ page }) => {
    await openWorldMap(page, { introStepMs: 1100, introFinalMs: 500 });

    await expect
      .poll(async () => page.getByTestId("intro-title").textContent().catch(() => null))
      .toBe("Founding LocalTalker");
    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("localtalker") ?? null))
      .not.toBeNull();

    await expect
      .poll(async () => page.getByTestId("intro-title").textContent().catch(() => null))
      .toBe("Founding PopCurrent");

    for (const slug of ["ibm-support-engineer", "busters-td", "localtalker"] as const) {
      await expect
        .poll(async () => page.evaluate((citySlug) => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(citySlug) ?? null, slug))
        .not.toBeNull();
    }
  });

  test("ambient music remains on after the intro ends when playback is allowed", async ({ page }) => {
    await allowMediaPlayback(page);
    await openWorldMap(page, { fastIntro: true });

    await skipIntro(page);

    await expect(page.getByRole("button", { name: "Ambient music on" })).toBeVisible();
  });

  test("intro runs through the full city sequence and can be replayed", async ({ page }) => {
    await openWorldMap(page, { fastIntro: true });

    await expect(page.getByText("Campaign Replay")).toBeVisible();
    await expect(page.getByRole("button", { name: "Replay Intro" })).toHaveCount(0);
    await skipIntro(page);
    await pressAction(page, "Replay Intro");
    await expect(page.getByTestId("intro-title")).toHaveText("Founding IBM Support Engineer");

    await collectIntroTitles(page, INTRO_TITLES);

    await expect.poll(async () => page.getByTestId("intro-panel").count()).toBe(0);
    await expect(page.locator("body")).toContainText(/Time progression\s*2026/i);

    await pressAction(page, "Replay Intro");
    await expect(page.getByTestId("intro-title")).toHaveText("Founding IBM Support Engineer");
    await skipIntro(page);
    await expect(page.locator("body")).toContainText(/Time progression\s*2026/i);

    await expect.poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("robot-future"))).not.toBeNull();
    await expect.poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("ibm-support-engineer"))).not.toBeNull();
    await expect.poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("ibm-ai-machine-learning-engineer"))).not.toBeNull();
  });

  test("leader profile and map key can open from the HUD", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    await pressAction(page, "Leader Profile");
    await expect(page.getByRole("heading", { name: "Phil Lopez", exact: true })).toBeVisible();
    await expect(page.getByText("Founding Principles")).toBeVisible();
    await expect(page.getByText("Current office: IBM AI and Machine Learning Engineer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Founding Principles")).toHaveCount(0);

    await pressAction(page, "Map Key");
    await expect(
      page.getByText("Settlements, towns, capitals, and wonders scale with project importance, maturity, and momentum."),
    ).toBeVisible();
    await pressAction(page, "Map Key");
    await expect(
      page.getByText("Settlements, towns, capitals, and wonders scale with project importance, maturity, and momentum."),
    ).toHaveCount(0);
  });

  test("clicking a city opens the in-map dossier and close clears the route state", async ({
    page,
  }) => {
    await openWorldMap(page);

    await page.getByRole("button", { name: "Skip Intro" }).click({ force: true });
    await clickMapCity(page, "robot-future");
    await expect(page).toHaveURL(/work=robot-future/);
    await expect(page.getByText("City Management View")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Robot Future" })).toBeVisible();
    await expect(page.getByAltText("A screenshot of the Robot Future website.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open full dossier" })).toHaveAttribute(
      "href",
      "/work/robot-future",
    );
    await expect(page.getByText("Why it matters")).toBeVisible();
    await expect(page.getByText("Future-Tech Beacon")).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).not.toHaveURL(/work=/);
    await expect(page.getByText("City Management View")).toHaveCount(0);
  });

  test("timeline can hide a city and jump back to its founding year", async ({ page }) => {
    await page.goto("/?work=polylogue");

    await skipIntroIfVisible(page);
    await expect(page.getByText("City Management View")).toBeVisible();
    await setTimelineIndex(page, 0);
    await expect(page.locator("body")).toContainText(/Time progression\s*2015/i);
    await expect(page.getByText("Not visible in 2015")).toBeVisible();
    await page.getByRole("button", { name: "Jump to 2026" }).click();
    await expect(page.getByText("City Management View")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Polylogue" })).toBeVisible();
  });

  test("filters and zoom controls respond without breaking navigation", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    await page.getByRole("button", { name: /^code$/i }).click();
    await expect(page.locator("body")).toContainText(/Map Focus\s*Code/);

    await page.getByRole("button", { name: "+" }).click({ force: true });
    await page.getByRole("button", { name: "-" }).click({ force: true });
    await page.getByRole("button", { name: "Reset" }).click({ force: true });

    await expect(page.getByRole("link", { name: "Civilopedia" })).toHaveAttribute("href", "/archive");
    await page.goto("/archive", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Browse the empire without the fog." })).toBeVisible();
  });

  test("default map route layer stays restrained after the city graph loads", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);

    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().cityCount ?? 0))
      .toBe(11);
    const routeDebug = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug() ?? null);

    expect(routeDebug?.routeCount ?? 0).toBeGreaterThan(0);
    expect(routeDebug?.routeCount ?? 0).toBeLessThanOrEqual(16);
    expect(routeDebug?.routePathCount ?? 0).toBe((routeDebug?.routeCount ?? 0) * 2);
  });

  test("great work text overlays render above city labels", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);

    const debug = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug() ?? null);

    expect(debug?.greatWorkLabelCount ?? 0).toBeGreaterThan(0);
    expect(debug?.layerOrder?.greatWorks ?? Number.POSITIVE_INFINITY).toBeLessThan(
      debug?.layerOrder?.cities ?? Number.NEGATIVE_INFINITY,
    );
    expect(debug?.layerOrder?.greatWorkLabels ?? Number.NEGATIVE_INFINITY).toBeGreaterThan(
      debug?.layerOrder?.cities ?? Number.POSITIVE_INFINITY,
    );
  });

  test("CivFolio and Buster's TD cities stay visually separated", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);

    const civfolio = await getCityMetrics(page, "civfolio");
    const busters = await getCityMetrics(page, "busters-td");
    const distance = Math.hypot(civfolio.x - busters.x, civfolio.y - busters.y);

    expect(distance).toBeGreaterThan(civfolio.radius + busters.radius + 48);
  });

  test("city pitch popups keep previews and dossier links for every visible city", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await openWorldMap(page);

    await skipIntro(page);

    for (const slug of CITY_SLUGS) {
      await page.evaluate((citySlug) => window.__CIVFOLIO_MAP_TEST__?.openCity(citySlug), slug);
      await expect(page.getByTestId("city-popup-body")).toBeVisible();
      await expect(page.getByTestId("city-popup-body").locator("img").first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Open full dossier" })).toBeVisible();
    }

    await page.close();
  });

  test("civilopedia navigation does not throw on map teardown", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await openWorldMap(page);
    await skipIntro(page);
    await Promise.all([
      page.waitForURL(/\/archive$/),
      page.getByRole("link", { name: "Civilopedia" }).click({ force: true }),
    ]);
    await expect(page).toHaveURL(/\/archive$/);
    await expect(page.getByRole("heading", { name: "Browse the empire without the fog." })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("new video city opens correctly from the map", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    await clickMapCity(page, "otisfuse");

    await expect(page).toHaveURL(/work=otisfuse/);
    await expect(page.getByRole("heading", { name: "OtisFuse" })).toBeVisible();
    await expect(page.getByRole("link", { name: "YouTube Channel" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/@otisfuse",
    );
  });

  test("hover tooltip stays visually anchored to the hovered city", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    await hoverMapCity(page, "robot-future");
    const tooltip = page.getByTestId("city-tooltip");
    const mapSurface = page.locator('[data-map-drag-surface="true"]');
    await expect
      .poll(async () => tooltip.getAttribute("data-city-slug").catch(() => null))
      .toBe("robot-future");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute("data-city-slug", "robot-future");
    await expect(tooltip).toContainText("Robot Future");

    const [box, containerBox, anchor] = await Promise.all([
      tooltip.boundingBox(),
      mapSurface.boundingBox(),
      tooltip.evaluate((node) => ({
        x: Number(node.getAttribute("data-city-screen-x")),
        y: Number(node.getAttribute("data-city-screen-y")),
      })),
    ]);

    if (!box || !containerBox) {
      throw new Error("City tooltip or container is missing box metrics");
    }

    const cityX = containerBox.x + anchor.x;
    const cityY = containerBox.y + anchor.y;
    const horizontalGap = cityX < box.x ? box.x - cityX : cityX - (box.x + box.width);
    const verticalOffset = Math.abs(box.y + box.height / 2 - cityY);

    expect(horizontalGap).toBeLessThan(40);
    expect(verticalOffset).toBeLessThan(52);
  });

  test("hover tooltip remains on-screen for edge cities", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    await hoverMapCity(page, "otisfuse");
    const tooltip = page.getByTestId("city-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute("data-city-slug", "otisfuse");

    const box = await tooltip.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) {
      throw new Error("Tooltip or viewport metrics missing");
    }

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });

  test("travelers open on click and deselect on background click", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    await page.waitForFunction(() => window.__CIVFOLIO_MAP_TEST__?.selectUnit("gstack-caravan") === true);
    await page.evaluate(() => {
      window.__CIVFOLIO_MAP_TEST__?.selectUnit("gstack-caravan");
    });
    const tooltip = page.locator("div").filter({ hasText: /Traveler.*Trader/i }).first();
    await expect(tooltip).toBeVisible();
    await page.evaluate(() => {
      window.__CIVFOLIO_MAP_TEST__?.clearSelection();
    });
    await expect(tooltip).toHaveCount(0);
  });

  test("map zoom keeps a city anchored while increasing its apparent size", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    const before = await getCityMetrics(page, "robot-future");
    const zoomed = await page.evaluate(() => {
      return window.__CIVFOLIO_MAP_TEST__?.zoomCameraOnCity("robot-future", 0.32) ?? false;
    });
    expect(zoomed).toBe(true);
    await expect
      .poll(
        async () => {
          const m = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics("robot-future"));
          if (!m) {
            return Number.POSITIVE_INFINITY;
          }
          return Math.max(Math.abs(m.x - before.x), Math.abs(m.y - before.y));
        },
        { timeout: 2500, intervals: [40, 80, 120] },
      )
      .toBeLessThan(10);
    const after = await getCityMetrics(page, "robot-future");
    expect(after.radius - before.radius).toBeGreaterThan(0.5);
  });

  test("map clicks do not reset camera zoom after the intro", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    const zoomed = await page.evaluate(() => {
      return window.__CIVFOLIO_MAP_TEST__?.zoomCameraOnCity("robot-future", 0.42) ?? false;
    });
    expect(zoomed).toBe(true);
    await page.waitForTimeout(120);
    const zoomBeforeCityClick = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 0);

    await clickMapCity(page, "robot-future");
    await page.waitForTimeout(180);
    const zoomAfterCityClick = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 0);
    expect(Math.abs(zoomAfterCityClick - zoomBeforeCityClick)).toBeLessThan(0.02);

    await page.getByRole("button", { name: "Close" }).click();
    const clearPoint = await page.evaluate((citySlugs) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const cities = citySlugs
        .map((slug) => window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(slug) ?? null)
        .filter((city): city is { x: number; y: number; radius: number } => Boolean(city));

      for (let y = 150; y < viewport.height - 150; y += 44) {
        for (let x = 80; x < viewport.width - 80; x += 58) {
          const element = document.elementFromPoint(x, y);
          const hitsOverlay = Boolean(
            element?.closest("button, a, input, textarea, select, [data-map-interactive='true']"),
          );
          const hitsCanvas = element?.tagName === "CANVAS";
          const isAwayFromCities = cities.every((city) => Math.hypot(city.x - x, city.y - y) > city.radius + 52);
          if (hitsCanvas && !hitsOverlay && isAwayFromCities) {
            return { x, y };
          }
        }
      }

      return null;
    }, [...CITY_SLUGS]);
    expect(clearPoint).not.toBeNull();

    const zoomBeforeBackgroundClick = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 0);
    await page.mouse.click(clearPoint?.x ?? 0, clearPoint?.y ?? 0);
    await page.waitForTimeout(180);
    const zoomAfterBackgroundClick = await page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 0);
    expect(Math.abs(zoomAfterBackgroundClick - zoomBeforeBackgroundClick)).toBeLessThan(0.02);
  });

  test("map camera can pan and moves visible cities on screen", async ({ page }) => {
    await openWorldMap(page);

    await skipIntro(page);
    const panned = await page.evaluate(() => {
      const mapTest = window.__CIVFOLIO_MAP_TEST__;
      const origin = mapTest?.getCityMetrics("robot-future");
      if (!mapTest || !origin) {
        return false;
      }

      mapTest.panCameraBy(150, 90);
      const firstAttempt = mapTest.getCityMetrics("robot-future");
      if (firstAttempt && Math.hypot(firstAttempt.x - origin.x, firstAttempt.y - origin.y) > 4) {
        return true;
      }

      mapTest.panCameraBy(-300, 0);
      const secondAttempt = mapTest.getCityMetrics("robot-future");
      return Boolean(secondAttempt && Math.hypot(secondAttempt.x - origin.x, secondAttempt.y - origin.y) > 4);
    });
    expect(panned).toBe(true);
    await expect(page.getByText("City Management View")).toHaveCount(0);
  });

  test("map viewport stays synced after browser resize", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorldMap(page);
    await skipIntroIfVisible(page);

    const getResizeDebug = () =>
      page.evaluate(() => {
        const debug = window.__CIVFOLIO_MAP_TEST__?.getDebug();
        return {
          viewportWidth: debug?.viewport?.width ?? 0,
          viewportHeight: debug?.viewport?.height ?? 0,
          containerWidth: debug?.explorer?.containerSize.width ?? 0,
          containerHeight: debug?.explorer?.containerSize.height ?? 0,
        };
      });

    const initialRobotFuture = await getCityMetrics(page, "robot-future");
    const initialDebug = await getResizeDebug();
    await page.setViewportSize({ width: 1000, height: 700 });

    await expect
      .poll(async () => {
        const debug = await getResizeDebug();
        return (
          debug.containerWidth < initialDebug.containerWidth &&
          debug.containerHeight < initialDebug.containerHeight &&
          Math.abs(debug.viewportWidth - debug.containerWidth) <= 1 &&
          Math.abs(debug.viewportHeight - debug.containerHeight) <= 1
        );
      })
      .toBe(true);

    const resizedRobotFuture = await getCityMetrics(page, "robot-future");
    expect(Math.abs(resizedRobotFuture.x - initialRobotFuture.x)).toBeGreaterThan(80);
    expect(resizedRobotFuture.x).toBeGreaterThan(0);
    expect(resizedRobotFuture.x).toBeLessThan(1000);
    expect(resizedRobotFuture.y).toBeGreaterThan(0);
    expect(resizedRobotFuture.y).toBeLessThan(700);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(async () => {
        const debug = await getResizeDebug();
        return (
          debug.containerWidth >= initialDebug.containerWidth - 1 &&
          debug.containerHeight >= initialDebug.containerHeight - 1 &&
          Math.abs(debug.viewportWidth - debug.containerWidth) <= 1 &&
          Math.abs(debug.viewportHeight - debug.containerHeight) <= 1
        );
      })
      .toBe(true);
  });

  test("creator prompt appears in the corner and dismisses itself", async ({ page }) => {
    await openWorldMap(page, { creatorPromptDelayMs: 1200, creatorPromptLifetimeMs: 1200 });

    await skipIntro(page);
    const prompt = page.getByTestId("creator-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("Enjoy what you're seeing here? Want to create your own?");
    await expect(prompt.getByRole("link", { name: "CivFolio README" })).toHaveAttribute(
      "href",
      "https://github.com/BigOtis/CivFolio",
    );

    await page.waitForTimeout(1700);
    await expect(prompt).toHaveCount(0);
  });

  test("world events appear on the live map and anchor to a visible city", async ({ page }) => {
    await openWorldMap(page, {
      worldEventMinMs: 250,
      worldEventMaxMs: 250,
      worldEventDurationMs: 3_500,
    });

    await skipIntro(page);

    const eventCard = page.getByTestId("world-event-card").first();
    const eventMarker = page.getByTestId("world-event-marker").first();
    await expect(eventCard).toBeVisible({ timeout: 6_000 });
    await expect(eventMarker).toBeVisible();
    await expect(eventCard).toHaveClass(/world-event-card/);
    await expect(eventMarker.locator(".world-event-pulse")).toBeVisible();
    await expect(eventMarker.locator(".world-event-beacon")).toBeVisible();
    await expect(eventCard).toContainText(/Event/);
    await expect(eventCard).toHaveAttribute("data-event-kind", /storm|battle|greatLeader|invention|festival|trade|discovery|sabotage/);
    await expect(eventMarker).toHaveAttribute("data-city-slug", /.+/);
    await expect.poll(async () => {
      return eventMarker.evaluate((element) => {
        const icon = element.querySelector(".world-event-beacon")?.getBoundingClientRect();
        const label = element.querySelector(".world-event-pulse")?.getBoundingClientRect();
        return Boolean(icon && label && label.top > icon.bottom);
      });
    }).toBe(true);
  });

  test("world events use distinct map effects for every event type", async ({ browser }) => {
    for (const kind of WORLD_EVENT_KINDS) {
      const page = await browser.newPage();
      await openWorldMap(page, {
        worldEventMinMs: 250,
        worldEventMaxMs: 250,
        worldEventDurationMs: 1_500,
        worldEventKind: kind,
      });

      await skipIntro(page);

      const eventMarker = page.getByTestId("world-event-marker").first();
      await expect(eventMarker).toBeVisible({ timeout: 6_000 });
      await expect(eventMarker).toHaveAttribute("data-event-kind", kind);
      await expect(page.getByTestId(`world-event-effect-${kind}`).first()).toBeVisible();
      await page.close();
    }
  });

  test("world events can overlap on the live map", async ({ page }) => {
    await openWorldMap(page, {
      worldEventMinMs: 250,
      worldEventMaxMs: 250,
      worldEventDurationMs: 2_000,
    });

    await skipIntro(page);

    await expect
      .poll(async () => page.getByTestId("world-event-marker").count(), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => page.getByTestId("world-event-card").count(), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2);
  });

  test("overlapping world events avoid repeated kinds and occupied cities", async ({ page }) => {
    await openWorldMap(page, {
      worldEventMinMs: 180,
      worldEventMaxMs: 180,
      worldEventDurationMs: 2_600,
    });

    await skipIntro(page);

    await expect
      .poll(async () => page.getByTestId("world-event-marker").count(), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(3);

    const activeEvents = await page.getByTestId("world-event-marker").evaluateAll((markers) =>
      markers.slice(0, 3).map((marker) => ({
        kind: marker.getAttribute("data-event-kind"),
        citySlug: marker.getAttribute("data-city-slug"),
        targetCitySlug: marker.getAttribute("data-target-city-slug") || null,
      })),
    );

    const activeKinds = activeEvents.map((event) => event.kind);
    const occupiedCities = activeEvents.flatMap((event) => [
      event.citySlug,
      ...(event.targetCitySlug ? [event.targetCitySlug] : []),
    ]);

    expect(new Set(activeKinds).size).toBe(activeKinds.length);
    expect(new Set(occupiedCities).size).toBe(occupiedCities.length);
  });

  test("battle events anchor between the two involved cities", async ({ page }) => {
    await openWorldMap(page, {
      worldEventMinMs: 250,
      worldEventMaxMs: 250,
      worldEventDurationMs: 3_500,
      worldEventKind: "battle",
    });

    await skipIntro(page);

    const eventMarker = page.getByTestId("world-event-marker").first();
    await expect(eventMarker).toBeVisible({ timeout: 6_000 });
    await expect(eventMarker).toHaveAttribute("data-event-kind", "battle");

    const eventPoint = await eventMarker.evaluate((element) => ({
      sourceSlug: element.getAttribute("data-city-slug"),
      targetSlug: element.getAttribute("data-target-city-slug"),
      x: Number(element.getAttribute("data-event-screen-x")),
      y: Number(element.getAttribute("data-event-screen-y")),
    }));

    expect(eventPoint.sourceSlug).toBeTruthy();
    expect(eventPoint.targetSlug).toBeTruthy();

    const sourceMetrics = await getCityMetrics(page, eventPoint.sourceSlug ?? "");
    const targetMetrics = await getCityMetrics(page, eventPoint.targetSlug ?? "");
    const mapBox = await page.locator("[data-map-drag-surface='true']").boundingBox();
    expect(mapBox).toBeTruthy();
    const midpoint = {
      x: ((sourceMetrics.x - (mapBox?.x ?? 0)) + (targetMetrics.x - (mapBox?.x ?? 0))) / 2,
      y: ((sourceMetrics.y - (mapBox?.y ?? 0)) + (targetMetrics.y - (mapBox?.y ?? 0))) / 2,
    };

    expect(Math.hypot(eventPoint.x - midpoint.x, eventPoint.y - midpoint.y)).toBeLessThan(24);
  });

  test("mobile layout keeps the map usable and primary controls reachable", async ({
    browser,
  }) => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    await openWorldMap(page);
    await expect(page.getByRole("link", { name: "Robot Future" })).toHaveCount(0);
    await expect(page.getByTestId("mobile-hud")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip Intro" })).toBeVisible();
    await expect(page.getByLabel("Timeline slider")).toHaveCount(0);
    const introMobileMetrics = await page.evaluate(() => {
      const readBox = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          return null;
        }
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      };
      const header = readBox("header");
      const map = readBox("[data-map-drag-surface='true']");
      const hud = readBox("[data-testid='mobile-hud']");
      const intro = readBox("[data-testid='intro-panel']");
      const laneY = hud && intro ? hud.bottom + (intro.top - hud.bottom) / 2 : 0;
      const laneElement = document.elementFromPoint(window.innerWidth / 2, laneY);

      return {
        header,
        map,
        hud,
        intro,
        gap: hud && intro ? intro.top - hud.bottom : null,
        laneHit: {
          tagName: laneElement?.tagName ?? null,
          isOverlayControl: Boolean(
            laneElement?.closest("button, a, input, textarea, select, [data-map-interactive='true']"),
          ),
        },
      };
    });
    expect(introMobileMetrics.header?.height ?? 999).toBeLessThan(52);
    expect(introMobileMetrics.map?.top ?? 999).toBeLessThan(64);
    expect(introMobileMetrics.hud?.height ?? 999).toBeLessThan(82);
    expect(introMobileMetrics.intro?.height ?? 999).toBeLessThan(260);
    expect(introMobileMetrics.gap ?? 0).toBeGreaterThan(260);
    expect(introMobileMetrics.laneHit).toEqual({ tagName: "CANVAS", isOverlayControl: false });
    await page.getByRole("button", { name: "Skip Intro" }).click();
    await expect(page.getByTestId("intro-panel")).toHaveCount(0);
    await expect(page.getByTestId("mobile-timeline-shell")).toBeVisible();
    await expect(page.getByLabel("Timeline slider")).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 1))
      .toBeLessThanOrEqual(0.56);
    const mobileOverviewCities = await page.evaluate(() => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      return ["robot-future", "localtalker", "busters-td"].map((slug) => ({
        slug,
        metrics: window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(slug) ?? null,
        viewport,
      }));
    });
    mobileOverviewCities.forEach(({ metrics, viewport }) => {
      expect(metrics?.x ?? -1).toBeGreaterThan(0);
      expect(metrics?.x ?? viewport.width + 1).toBeLessThan(viewport.width);
      expect(metrics?.y ?? -1).toBeGreaterThan(0);
      expect(metrics?.y ?? viewport.height + 1).toBeLessThan(viewport.height);
    });
    const mobileGap = await page.evaluate(() => {
      const top = document.querySelector("[data-testid='mobile-hud']")?.getBoundingClientRect();
      const bottom = document.querySelector("[data-testid='mobile-timeline-shell']")?.getBoundingClientRect();
      if (!top || !bottom) {
        return null;
      }
      return {
        topBottom: top.bottom,
        bottomTop: bottom.top,
        gap: bottom.top - top.bottom,
      };
    });
    expect(mobileGap).not.toBeNull();
    expect(mobileGap?.gap ?? 0).toBeGreaterThan(180);
    const clearLaneHit = await page.evaluate((gap) => {
      if (!gap) {
        return null;
      }
      const y = gap.topBottom + gap.gap / 2;
      const element = document.elementFromPoint(window.innerWidth / 2, y);
      return {
        tagName: element?.tagName ?? null,
        isOverlayControl: Boolean(
          element?.closest("button, a, input, textarea, select, [data-map-interactive='true']"),
        ),
      };
    }, mobileGap);
    expect(clearLaneHit).toEqual({ tagName: "CANVAS", isOverlayControl: false });

    const beforeDrag = await getCityMetrics(page, "robot-future");
    const dragY = (mobileGap?.topBottom ?? 0) + (mobileGap?.gap ?? 0) / 2;
    await page.mouse.move(250, dragY);
    await page.mouse.down();
    await page.mouse.move(130, dragY + 18, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterDrag = await getCityMetrics(page, "robot-future");
    expect(Math.abs(afterDrag.x - beforeDrag.x) + Math.abs(afterDrag.y - beforeDrag.y)).toBeGreaterThan(10);

    await pressAction(page, "Controls");
    await expect(page.getByTestId("mobile-controls-panel")).toBeVisible();
    await pressAction(page, "Map Key");
    await expect(page.locator("body")).toContainText("Great Works are landmark achievements.");
    await page.getByRole("button", { name: "Close" }).click();
    await clickMapCity(page, "popcurrent");
    await expect(page.getByText("City Management View")).toBeVisible();
    await expect(page.getByText("Why it matters")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open full dossier" })).toHaveAttribute(
      "href",
      "/work/popcurrent",
    );
    await page.close();
  });

  test("narrow mobile layout preserves a touchable map lane without overflowing controls", async ({
    browser,
  }) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    await openWorldMap(page);
    await skipIntro(page);

    await expect
      .poll(async () => page.evaluate(() => window.__CIVFOLIO_MAP_TEST__?.getDebug().camera?.zoom ?? 1))
      .toBeLessThanOrEqual(0.56);
    const narrowOverviewCities = await page.evaluate(() => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      return ["robot-future", "localtalker"].map((slug) => ({
        slug,
        metrics: window.__CIVFOLIO_MAP_TEST__?.getCityMetrics(slug) ?? null,
        viewport,
      }));
    });
    narrowOverviewCities.forEach(({ metrics, viewport }) => {
      expect(metrics?.x ?? -1).toBeGreaterThan(0);
      expect(metrics?.x ?? viewport.width + 1).toBeLessThan(viewport.width);
      expect(metrics?.y ?? -1).toBeGreaterThan(0);
      expect(metrics?.y ?? viewport.height + 1).toBeLessThan(viewport.height);
    });

    const collapsedMetrics = await page.evaluate(() => {
      const readBox = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          return null;
        }
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height,
        };
      };
      const hud = readBox("[data-testid='mobile-hud']");
      const timeline = readBox("[data-testid='mobile-timeline-shell']");
      const map = readBox("[data-map-drag-surface='true']");
      const canvas = readBox("canvas");
      const hudOverflow = Array.from(document.querySelectorAll("[data-testid='mobile-hud'] button")).some((button) => {
        const buttonBox = button.getBoundingClientRect();
        return Boolean(hud && (buttonBox.left < hud.left || buttonBox.right > hud.right));
      });
      const laneY = hud && timeline ? hud.bottom + (timeline.top - hud.bottom) / 2 : 0;
      const laneElement = document.elementFromPoint(window.innerWidth / 2, laneY);

      return {
        hud,
        timeline,
        map,
        canvas,
        hudOverflow,
        gap: hud && timeline ? timeline.top - hud.bottom : null,
        laneHit: {
          tagName: laneElement?.tagName ?? null,
          isOverlayControl: Boolean(
            laneElement?.closest("button, a, input, textarea, select, [data-map-interactive='true']"),
          ),
        },
      };
    });

    expect(collapsedMetrics.hud).not.toBeNull();
    expect(collapsedMetrics.timeline).not.toBeNull();
    expect(collapsedMetrics.map).not.toBeNull();
    expect(collapsedMetrics.canvas).not.toBeNull();
    expect(collapsedMetrics.hudOverflow).toBe(false);
    expect(collapsedMetrics.map?.height ?? 0).toBeGreaterThan(480);
    expect(collapsedMetrics.gap ?? 0).toBeGreaterThan(165);
    expect(collapsedMetrics.laneHit).toEqual({ tagName: "CANVAS", isOverlayControl: false });

    const beforeDrag = await getCityMetrics(page, "robot-future");
    const dragY = (collapsedMetrics.hud?.bottom ?? 0) + (collapsedMetrics.gap ?? 0) / 2;
    await page.mouse.move(160, dragY);
    await page.mouse.down();
    await page.mouse.move(78, dragY + 16, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterDrag = await getCityMetrics(page, "robot-future");
    expect(Math.abs(afterDrag.x - beforeDrag.x) + Math.abs(afterDrag.y - beforeDrag.y)).toBeGreaterThan(10);

    await pressAction(page, "Controls");
    await expect(page.getByTestId("mobile-controls-panel")).toBeVisible();
    const controlsMetrics = await page.evaluate(() => {
      const hud = document.querySelector("[data-testid='mobile-hud']")?.getBoundingClientRect();
      const timeline = document.querySelector("[data-testid='mobile-timeline-shell']")?.getBoundingClientRect();
      const controls = document.querySelector("[data-testid='mobile-controls-panel']")?.getBoundingClientRect();
      const overflow = Array.from(document.querySelectorAll("[data-testid='mobile-hud'] button")).some((button) => {
        const box = button.getBoundingClientRect();
        return Boolean(hud && (box.left < hud.left || box.right > hud.right));
      });

      return {
        overflow,
        gap: hud && timeline ? timeline.top - hud.bottom : null,
        controlsHeight: controls?.height ?? null,
      };
    });
    expect(controlsMetrics.overflow).toBe(false);
    expect(controlsMetrics.gap ?? 0).toBeGreaterThan(120);
    expect(controlsMetrics.controlsHeight ?? 0).toBeLessThan(140);

    await page.getByRole("button", { name: "Open Timeline" }).click();
    await expect(page.getByTestId("mobile-controls-panel")).toHaveCount(0);
    const expandedTimelineMetrics = await page.evaluate(() => {
      const hud = document.querySelector("[data-testid='mobile-hud']")?.getBoundingClientRect();
      const timeline = document.querySelector("[data-testid='mobile-timeline-shell']")?.getBoundingClientRect();
      return {
        gap: hud && timeline ? timeline.top - hud.bottom : null,
        timelineHeight: timeline?.height ?? null,
      };
    });
    expect(expandedTimelineMetrics.gap ?? 0).toBeGreaterThan(110);
    expect(expandedTimelineMetrics.timelineHeight ?? 0).toBeLessThan(240);

    await page.close();
  });
});

test.describe("canonical routes", () => {
  test("map can deep link directly into a city panel", async ({ page }) => {
    await page.goto("/?work=robot-future", { waitUntil: "networkidle" });

    await expect(page.getByText("City Management View")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Robot Future" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open full dossier" })).toHaveAttribute(
      "href",
      "/work/robot-future",
    );
  });

  test("archive can navigate into a canonical dossier page", async ({ page }) => {
    await page.goto("/archive", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Browse the empire without the fog." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open dossier" })).toHaveCount(11);

    await page.getByRole("link", { name: "Open dossier" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("about page presents leader details and contact links cleanly", async ({ page }) => {
    await page.goto("/about", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Phil Lopez" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Signals" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "GitHub" })).toBeVisible();
    await expect(page.getByText("Current role: IBM AI and Machine Learning Engineer")).toBeVisible();
    await expect(page.getByLabel("Robot Future attribution")).toBeVisible();
    await expect(page.getByRole("link", { name: "Robot Future site" })).toHaveAttribute(
      "href",
      "https://www.robot-future.com/",
    );
    await expect(page.getByRole("link", { name: "CivFolio source" })).toHaveAttribute(
      "href",
      "https://github.com/BigOtis/CivFolio",
    );
  });

  test("work routes remain shareable", async ({ page }) => {
    await page.goto("/work/robot-future", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/work\/robot-future$/);
    await expect(page.getByRole("heading", { name: "Robot Future" })).toBeVisible();
  });
});
