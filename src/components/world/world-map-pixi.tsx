"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Circle, Container, Graphics, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";

import { clamp, getImprovementKind, getRoutePoint } from "@/components/world/world-explorer-support";
import type { RenderCity, WorldRenderModel, WorldRoute, WorldState } from "@/lib/content/derive";
import type { SiteConfig, Work } from "@/lib/content/schema";

const terrainFill = {
  coast: "#4b635f",
  plains: "#7d7a58",
  forest: "#55664d",
  hills: "#88644a",
  highlands: "#6f6a58",
} as const;

const terrainRim = {
  coast: "#92a59d",
  plains: "#b1ab7b",
  forest: "#87987b",
  hills: "#bb9270",
  highlands: "#a79e84",
} as const;

const terrainShade = {
  coast: "#334542",
  plains: "#5d5b40",
  forest: "#3d4b38",
  hills: "#614735",
  highlands: "#554f42",
} as const;

const disciplineTone = {
  code: "#c9ab74",
  art: "#b98970",
  music: "#86a2a3",
  video: "#8f9f80",
  writing: "#b7ad74",
  client: "#a97867",
} as const;

const terrainStone = {
  coast: { dark: 0x474840, mid: 0x64665f, light: 0x908d7d },
  plains: { dark: 0x4f4538, mid: 0x71624c, light: 0x9a8764 },
  forest: { dark: 0x4a493d, mid: 0x686756, light: 0x8f8d73 },
  hills: { dark: 0x534033, mid: 0x785d49, light: 0xa18366 },
  highlands: { dark: 0x4d473c, mid: 0x6f6757, light: 0x978d76 },
} as const;

type TileResourceKind = "memory" | "compute" | "network" | "storage" | "terminal";

function pickTileResource(hex: WorldRenderModel["hexes"][number], seed: number): TileResourceKind | null {
  if (seed < 0.9) {
    return null;
  }

  if (hex.terrain === "coast") {
    return seed > 0.975 ? "network" : null;
  }

  if (hex.terrain === "forest") {
    return seed > 0.965 ? "terminal" : "memory";
  }

  if (hex.terrain === "plains") {
    return seed > 0.955 ? "storage" : "compute";
  }

  if (hex.terrain === "hills") {
    return seed > 0.95 ? "compute" : "storage";
  }

  return seed > 0.955 ? "network" : "memory";
}

function drawTileResource(
  graphic: Graphics,
  kind: TileResourceKind,
  centerX: number,
  centerY: number,
  accent: number,
  seed: number,
) {
  const x = centerX + (seed > 0.96 ? 12 : -10);
  const y = centerY + (seed > 0.94 ? 10 : -8);
  const base = mixColor(0x2f271e, 0x5c4a36, 0.45);
  const plate = mixColor(accent, 0xe7d0a2, 0.3);
  const glow = mixColor(accent, 0xf4e4bf, 0.2);

  graphic.ellipse(x, y + 11, 13, 5).fill({ color: 0x080503, alpha: 0.22 });
  graphic.roundRect(x - 11, y - 2, 22, 14, 4).fill({ color: base, alpha: 0.92 }).stroke({ width: 1, color: plate, alpha: 0.48 });

  if (kind === "memory") {
    graphic.roundRect(x - 8, y + 1, 16, 8, 2).fill({ color: 0x17120d, alpha: 0.92 });
    [-5, -1, 3].forEach((pinX) => {
      graphic.moveTo(x + pinX, y + 1).lineTo(x + pinX, y - 3).stroke({ width: 1, color: plate, alpha: 0.8, cap: "round" });
      graphic.moveTo(x + pinX, y + 9).lineTo(x + pinX, y + 13).stroke({ width: 1, color: plate, alpha: 0.8, cap: "round" });
    });
    graphic.roundRect(x - 4.5, y + 3, 9, 4, 1).fill({ color: glow, alpha: 0.9 });
    return;
  }

  if (kind === "compute") {
    [-6, 0, 6].forEach((towerX, index) => {
      graphic.roundRect(x + towerX - 2.2, y - (index === 1 ? 6 : 2), 4.4, index === 1 ? 12 : 8, 1.2).fill({ color: plate, alpha: 0.9 });
    });
    graphic.moveTo(x - 8, y + 6).lineTo(x + 8, y + 6).stroke({ width: 1.2, color: glow, alpha: 0.82, cap: "round" });
    return;
  }

  if (kind === "network") {
    graphic.circle(x, y + 4, 2.8).fill({ color: glow, alpha: 0.94 });
    [{ dx: -7, dy: -2 }, { dx: 7, dy: -2 }, { dx: 0, dy: -8 }].forEach(({ dx, dy }) => {
      graphic.circle(x + dx, y + dy, 2.1).fill({ color: plate, alpha: 0.86 });
      graphic.moveTo(x, y + 4).lineTo(x + dx, y + dy).stroke({ width: 1.1, color: plate, alpha: 0.8, cap: "round" });
    });
    return;
  }

  if (kind === "storage") {
    [-5, 0, 5].forEach((stackX) => {
      graphic.roundRect(x + stackX - 2, y, 4, 8, 1.1).fill({ color: plate, alpha: 0.88 });
    });
    graphic.roundRect(x - 7, y - 5, 14, 3, 1).fill({ color: glow, alpha: 0.78 });
    return;
  }

  graphic.moveTo(x - 7, y + 6).lineTo(x + 7, y + 6).stroke({ width: 1.2, color: plate, alpha: 0.86, cap: "round" });
  graphic.roundRect(x - 6, y - 7, 12, 10, 2.2).fill({ color: 0x17120d, alpha: 0.92 }).stroke({ width: 1, color: glow, alpha: 0.64 });
  graphic.circle(x - 2.8, y - 2.2, 0.9).fill({ color: glow, alpha: 0.92 });
  graphic.circle(x, y - 2.2, 0.9).fill({ color: glow, alpha: 0.92 });
  graphic.circle(x + 2.8, y - 2.2, 0.9).fill({ color: glow, alpha: 0.92 });
}

const improvementOffsets = [
  { x: -74, y: -34 },
  { x: 82, y: -18 },
  { x: -62, y: 42 },
  { x: 70, y: 48 },
] as const;

const cityBannerOffsetY: Record<string, number> = {
  popcurrent: -76,
  polylogue: -82,
  otisfuse: -62,
  civfolio: -56,
};

const routeStyle: Record<
  WorldRoute["type"],
  { color: number; alpha: number; shadowAlpha: number; width: number; shadowWidth: number }
> = {
  integration: { color: 0xe0c27f, alpha: 0.42, shadowAlpha: 0.18, width: 1.9, shadowWidth: 5.6 },
  trade: { color: 0xc5d1a5, alpha: 0.36, shadowAlpha: 0.14, width: 1.7, shadowWidth: 5 },
  series: { color: 0xf1cf8b, alpha: 0.48, shadowAlpha: 0.2, width: 2.1, shadowWidth: 5.8 },
  team: { color: 0x9ad5f6, alpha: 0.38, shadowAlpha: 0.14, width: 1.8, shadowWidth: 5 },
  inspiration: { color: 0xbda27a, alpha: 0.24, shadowAlpha: 0.08, width: 1.2, shadowWidth: 3.6 },
};

type CameraState = {
  zoom: number;
  x: number;
  y: number;
};

type UnitDescriptor = {
  id: string;
  label: string;
  type: SiteConfig["scene"]["toolUnits"][number]["type"];
  color: string;
  route: string[];
  speed: number;
};

type UnitNode = {
  container: Container;
  ring: Graphics;
  routeCities: Array<{ x: number; y: number }>;
  descriptor: UnitDescriptor;
};

type CityNode = {
  hitArea: Graphics;
  halo: Graphics;
  label: Container;
  labelBackground: Graphics;
  labelText: Text;
  radius: number;
  worldX: number;
  worldY: number;
};

type GreatWorkNode = {
  root: Container;
  monument: Graphics;
  label: Container;
  title: string;
  citySlug: string;
  worldX: number;
  worldY: number;
};

type SceneRefs = {
  terrainLayer: Container;
  routeLayer: Container;
  improvementLayer: Container;
  greatWorkLayer: Container;
  cityLayer: Container;
  greatWorkLabelLayer: Container;
  unitLayer: Container;
  cityNodes: Map<string, CityNode>;
  greatWorkNodes: Map<string, GreatWorkNode>;
  unitNodes: Map<string, UnitNode>;
};

type SelectableUnit = {
  id: string;
  label: string;
  type: SiteConfig["scene"]["toolUnits"][number]["type"];
  color: string;
  worldX: number;
  worldY: number;
  angle: number;
  terrain: "coast" | "plains" | "forest" | "hills" | "highlands";
};

declare global {
  interface Window {
    __CIVFOLIO_MAP_TEST__?: {
      getCityMetrics: (slug: string) => { x: number; y: number; radius: number } | null;
      getUnitPoint: (id: string) => { x: number; y: number } | null;
      openCity: (slug: string) => boolean;
      selectUnit: (id: string) => boolean;
      clearSelection: () => void;
      panCameraBy: (dx: number, dy: number) => boolean;
      zoomCameraOnCity: (slug: string, delta: number) => boolean;
      getDebug: () => {
        cityCount: number;
        greatWorkLabelCount: number;
        layerOrder: { greatWorks: number; cities: number; greatWorkLabels: number } | null;
        routeCount: number;
        routePathCount: number;
        unitCount: number;
        sceneVersion: number;
        camera: { x: number; y: number; zoom: number } | null;
        pointer: { down: number; move: number; up: number; dragging: boolean };
        cities: Array<{ slug: string; x: number; y: number; radius: number }>;
        viewport: { width: number; height: number } | null;
        explorer: ExplorerDebugSnapshot | null;
      };
    };
    __CIVFOLIO_EXPLORER_DEBUG__?: ExplorerDebugSnapshot;
  }
}

export type ExplorerDebugSnapshot = {
  introActive: boolean;
  cameraTarget: { x: number; y: number; zoom: number };
  defaultCamera: { x: number; y: number; zoom: number };
  containerSize: { width: number; height: number };
};

function toPixiColor(value: string) {
  return Number.parseInt(value.replace("#", ""), 16);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixColor(left: number, right: number, amount: number) {
  const t = clamp(amount, 0, 1);
  const lr = (left >> 16) & 0xff;
  const lg = (left >> 8) & 0xff;
  const lb = left & 0xff;
  const rr = (right >> 16) & 0xff;
  const rg = (right >> 8) & 0xff;
  const rb = right & 0xff;

  return (
    (Math.round(lr + (rr - lr) * t) << 16) |
    (Math.round(lg + (rg - lg) * t) << 8) |
    Math.round(lb + (rb - lb) * t)
  );
}

function parsePolygonPoints(points: string) {
  return points
    .trim()
    .split(/\s+/)
    .flatMap((pair) => pair.split(",").map(Number));
}

function drawRoundedLabel(background: Graphics, width: number, tone: string) {
  background
    .clear()
    .roundRect(0, 0, width, 28, 14)
    .fill({ color: 0x19100b, alpha: 0.78 })
    .stroke({ width: 1.2, color: toPixiColor(tone), alpha: 0.84 });
}

function createBanner(title: string, tone: string) {
  const label = new Container();
  label.eventMode = "none";

  const background = new Graphics();
  label.addChild(background);

  const titleText = new Text({
    text: title.toUpperCase(),
    style: {
      fill: 0xf7e8c7,
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 1.8,
      stroke: { color: 0x0c0908, width: 1.4 },
    },
  });
  titleText.x = 13;
  titleText.y = 6;
  label.addChild(titleText);

  const width = Math.max(110, titleText.width + 26);
  drawRoundedLabel(background, width, tone);
  label.pivot.set(width / 2, 14);

  return { label, background, titleText, width };
}

function addSimplePath(container: Container, path: string, color: number, width: number, alpha = 1) {
  const graphic = new Graphics();
  const tokens = path.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  let index = 0;

  while (index < tokens.length) {
    const command = tokens[index];
    index += 1;

    if (command === "M") {
      graphic.moveTo(Number(tokens[index]), Number(tokens[index + 1]));
      index += 2;
      continue;
    }

    if (command === "L") {
      graphic.lineTo(Number(tokens[index]), Number(tokens[index + 1]));
      index += 2;
      continue;
    }

    if (command === "Q") {
      graphic.quadraticCurveTo(
        Number(tokens[index]),
        Number(tokens[index + 1]),
        Number(tokens[index + 2]),
        Number(tokens[index + 3]),
      );
      index += 4;
      continue;
    }

    if (command === "C") {
      graphic.bezierCurveTo(
        Number(tokens[index]),
        Number(tokens[index + 1]),
        Number(tokens[index + 2]),
        Number(tokens[index + 3]),
        Number(tokens[index + 4]),
        Number(tokens[index + 5]),
      );
      index += 6;
      continue;
    }
  }

  graphic.stroke({ width, color, alpha, cap: "round", join: "round" });
  container.addChild(graphic);
}

function getDisplayedRoutes(routes: WorldRoute[], visibleCities: RenderCity[]) {
  const visibleCitySlugs = new Set(visibleCities.map((city) => city.slug));

  return routes.filter((route) => {
    if (!visibleCitySlugs.has(route.from) || !visibleCitySlugs.has(route.to)) {
      return false;
    }

    return route.type !== "inspiration";
  });
}

function drawImprovement(label: string, tone: string) {
  const kind = getImprovementKind(label);
  const graphic = new Graphics();
  graphic.ellipse(0, 14, 16, 6).fill({ color: 0x070403, alpha: 0.24 });
  graphic
    .roundRect(-14, -2, 28, 18, 5)
    .fill({ color: 0x120c09, alpha: 0.66 })
    .stroke({ width: 1, color: toPixiColor(tone), alpha: 0.45 });

  if (kind === "farm") {
    [-8, -2, 4, 10].forEach((x) => {
      graphic.moveTo(x, 9).lineTo(x, 1);
    });
    graphic.moveTo(-11, 3).quadraticCurveTo(-2, -1, 11, 3);
    graphic.stroke({ width: 1.3, color: toPixiColor(tone), alpha: 0.82, cap: "round", join: "round" });
    return graphic;
  }

  if (kind === "academy") {
    graphic.poly([-9, 8, 0, -5, 9, 8], true).fill({ color: toPixiColor(tone), alpha: 0.72 });
    graphic.roundRect(-2.2, 1, 4.4, 8, 1).fill({ color: 0xf7e8c7, alpha: 1 });
    return graphic;
  }

  if (kind === "workshop") {
    graphic.roundRect(-8, 0, 16, 8, 2).fill({ color: toPixiColor(tone), alpha: 0.68 });
    graphic.moveTo(2, -5).lineTo(8, -10).lineTo(11, -8).lineTo(5, -6).closePath();
    graphic.fill({ color: toPixiColor(tone), alpha: 1 });
    graphic.moveTo(2, -5).lineTo(8, -10).stroke({ width: 1.4, color: toPixiColor(tone), alpha: 1, cap: "round" });
    return graphic;
  }

  graphic.moveTo(-10, 9).quadraticCurveTo(0, 1, 10, 9).stroke({ width: 1.3, color: toPixiColor(tone), alpha: 0.94, cap: "round" });
  graphic.poly([-3, 7, 0, -2, 3, 7], true).fill({ color: toPixiColor(tone), alpha: 0.78 });
  return graphic;
}

function drawBattlements(graphic: Graphics, x: number, y: number, width: number, color: number, alpha: number) {
  const notchWidth = 5;
  const start = x - width / 2;
  for (let offset = 0; offset < width; offset += notchWidth + 2) {
    graphic.roundRect(start + offset, y, notchWidth, 3.8, 0.8).fill({ color, alpha });
  }
}

function drawPennant(graphic: Graphics, x: number, y: number, accent: number, direction: 1 | -1, active: boolean) {
  graphic.moveTo(x, y).lineTo(x, y - 13).stroke({ width: 1, color: accent, alpha: active ? 0.92 : 0.78, cap: "round" });
  graphic.poly([x, y - 13, x + direction * 7, y - 10, x, y - 7], true).fill({ color: accent, alpha: active ? 0.96 : 0.84 });
}

function drawTower(
  graphic: Graphics,
  x: number,
  baseY: number,
  width: number,
  height: number,
  body: number,
  roof: number,
  trim: number,
  windowTone: number,
) {
  const left = x - width / 2;
  const top = baseY - height;
  graphic.roundRect(left, top, width, height, 2).fill({ color: body, alpha: 1 }).stroke({ width: 1, color: trim, alpha: 0.5 });
  drawBattlements(graphic, x, top - 2, width, trim, 0.78);
  graphic.poly([left - 1, top, x, top - 10, left + width + 1, top], true).fill({ color: roof, alpha: 0.92 });
  graphic.roundRect(x - 1.6, top + height * 0.35, 3.2, Math.max(4.2, height * 0.28), 1).fill({ color: windowTone, alpha: 0.78 });
}

function drawDistrictHouse(
  graphic: Graphics,
  x: number,
  baseY: number,
  width: number,
  height: number,
  body: number,
  roof: number,
  trim: number,
  windowTone: number,
) {
  const left = x - width / 2;
  const top = baseY - height;
  graphic.roundRect(left, top, width, height, 2.2).fill({ color: body, alpha: 1 }).stroke({ width: 0.9, color: trim, alpha: 0.42 });
  graphic.poly([left - 1, top, x, top - 7, left + width + 1, top], true).fill({ color: roof, alpha: 0.88 });
  graphic.roundRect(x - 1.4, top + height * 0.35, 2.8, Math.max(3.4, height * 0.24), 0.9).fill({ color: windowTone, alpha: 0.72 });
}

type CityStructureProfile = {
  keepVariant: 0 | 1 | 2 | 3;
  districtPattern: 0 | 1 | 2 | 3;
  roofVariant: 0 | 1 | 2;
  towerSpread: number;
  lowerQuarter: boolean;
  shrine: boolean;
  extraTower: boolean;
};

function getCityStructureProfile(city: RenderCity): CityStructureProfile {
  const seed = hashString(`${city.slug}:${city.tags.join("|")}:${city.greatWorks.length}`);

  return {
    keepVariant: (seed % 4) as 0 | 1 | 2 | 3,
    districtPattern: ((seed >> 3) % 4) as 0 | 1 | 2 | 3,
    roofVariant: ((seed >> 5) % 3) as 0 | 1 | 2,
    towerSpread: 18 + ((seed >> 7) % 9),
    lowerQuarter: ((seed >> 11) & 1) === 1,
    shrine: city.greatWorks.length > 0 || ((seed >> 13) & 1) === 1,
    extraTower: city.level !== "settlement" && (((seed >> 17) & 1) === 1 || city.metrics.prestige >= 8),
  };
}

function drawRoofCap(
  graphic: Graphics,
  x: number,
  topY: number,
  width: number,
  rise: number,
  roof: number,
  variant: 0 | 1 | 2,
  alpha: number,
) {
  if (variant === 0) {
    graphic.poly([x - width / 2, topY, x, topY - rise, x + width / 2, topY], true).fill({ color: roof, alpha });
    return;
  }

  if (variant === 1) {
    graphic.poly([
      x - width / 2,
      topY,
      x - width * 0.18,
      topY - rise,
      x + width * 0.18,
      topY - rise,
      x + width / 2,
      topY,
    ], true).fill({ color: roof, alpha });
    return;
  }

  graphic.poly([
    x - width / 2,
    topY,
    x - width * 0.18,
    topY - rise * 0.78,
    x,
    topY - rise * 0.52,
    x + width * 0.18,
    topY - rise * 0.78,
    x + width / 2,
    topY,
  ], true).fill({ color: roof, alpha });
}

function drawCentralKeep(
  graphic: Graphics,
  {
    x,
    baseY,
    width,
    height,
    body,
    bright,
    roof,
    trim,
    gate,
    windowTone,
    accent,
    profile,
    active,
  }: {
    x: number;
    baseY: number;
    width: number;
    height: number;
    body: number;
    bright: number;
    roof: number;
    trim: number;
    gate: number;
    windowTone: number;
    accent: number;
    profile: CityStructureProfile;
    active: boolean;
  },
) {
  const left = x - width / 2;
  const top = baseY - height;

  if (profile.keepVariant === 0) {
    graphic.roundRect(left, top, width, height, 2.8).fill({ color: bright, alpha: 0.98 }).stroke({ width: 1.05, color: trim, alpha: 0.54 });
    drawRoofCap(graphic, x, top, width + 2, 12, roof, profile.roofVariant, 0.92);
    graphic.roundRect(x - 3.2, baseY - Math.min(11, height * 0.48), 6.4, Math.min(11, height * 0.48), 1.2).fill({ color: gate, alpha: 0.92 });
    return;
  }

  if (profile.keepVariant === 1) {
    graphic.roundRect(left + 2, top + 2, width - 4, height - 2, 2.8).fill({ color: bright, alpha: 0.98 }).stroke({ width: 1.05, color: trim, alpha: 0.54 });
    graphic.roundRect(left - 4, top + 8, 7, height - 8, 2).fill({ color: body, alpha: 1 }).stroke({ width: 0.9, color: trim, alpha: 0.46 });
    graphic.roundRect(left + width - 3, top + 8, 7, height - 8, 2).fill({ color: body, alpha: 1 }).stroke({ width: 0.9, color: trim, alpha: 0.46 });
    drawRoofCap(graphic, x, top + 2, width - 2, 10, roof, profile.roofVariant, 0.92);
    drawRoofCap(graphic, left - 0.5, top + 8, 8, 7, roof, 0, 0.86);
    drawRoofCap(graphic, left + width + 0.5, top + 8, 8, 7, roof, 0, 0.86);
    graphic.roundRect(x - 3.1, baseY - Math.min(11, height * 0.44), 6.2, Math.min(11, height * 0.44), 1.2).fill({ color: gate, alpha: 0.92 });
    return;
  }

  if (profile.keepVariant === 2) {
    graphic.roundRect(left + 3, top, width - 6, height, 2.8).fill({ color: bright, alpha: 0.98 }).stroke({ width: 1.05, color: trim, alpha: 0.54 });
    drawBattlements(graphic, x, top - 2, width - 10, trim, 0.78);
    graphic.roundRect(x - 2.8, top - 8, 5.6, 8, 1.4).fill({ color: body, alpha: 1 }).stroke({ width: 0.9, color: trim, alpha: 0.48 });
    drawRoofCap(graphic, x, top - 8, 8, 6, roof, 0, 0.9);
    graphic.roundRect(x - 3.2, baseY - Math.min(12, height * 0.46), 6.4, Math.min(12, height * 0.46), 1.2).fill({ color: gate, alpha: 0.92 });
    return;
  }

  graphic.roundRect(left, top + 4, width, height - 4, 3).fill({ color: bright, alpha: 0.98 }).stroke({ width: 1.05, color: trim, alpha: 0.54 });
  drawRoofCap(graphic, x, top + 4, width + 2, 9, roof, profile.roofVariant, 0.9);
  graphic.circle(x, top - 2, 6).fill({ color: mixColor(accent, 0xf3dfb8, 0.34), alpha: active ? 0.94 : 0.84 });
  graphic.circle(x, top - 2, 11).fill({ color: accent, alpha: active ? 0.18 : 0.1 });
  graphic.roundRect(x - 3.1, baseY - Math.min(10, height * 0.4), 6.2, Math.min(10, height * 0.4), 1.2).fill({ color: gate, alpha: 0.92 });
  graphic.roundRect(x - 1.6, top + height * 0.34, 3.2, Math.max(4.2, height * 0.18), 1).fill({ color: windowTone, alpha: 0.76 });
}

function drawDisciplineSigil(graphic: Graphics, city: RenderCity, x: number, y: number, accent: number) {
  graphic.roundRect(x - 6.5, y - 5, 13, 10, 2.6).fill({ color: 0x17110d, alpha: 0.9 }).stroke({ width: 0.9, color: accent, alpha: 0.78 });

  if (city.discipline === "code") {
    graphic.moveTo(x - 3.5, y - 1).lineTo(x - 1.1, y + 1.4).lineTo(x - 3.5, y + 3.6).stroke({ width: 1, color: accent, alpha: 0.94, cap: "round", join: "round" });
    graphic.moveTo(x + 3.5, y - 1).lineTo(x + 1.1, y + 1.4).lineTo(x + 3.5, y + 3.6).stroke({ width: 1, color: accent, alpha: 0.94, cap: "round", join: "round" });
    return;
  }

  if (city.discipline === "art") {
    graphic.circle(x, y, 1.8).fill({ color: 0xf5ddb4, alpha: 0.9 });
    graphic.moveTo(x - 4.2, y + 2.5).quadraticCurveTo(x, y - 3.6, x + 4.2, y + 2.5).stroke({ width: 1, color: accent, alpha: 0.9, cap: "round" });
    return;
  }

  if (city.discipline === "music") {
    graphic.moveTo(x - 2.5, y + 2.8).lineTo(x - 2.5, y - 3.2).stroke({ width: 1.1, color: accent, alpha: 0.9, cap: "round" });
    graphic.moveTo(x + 1.6, y + 2.8).lineTo(x + 1.6, y - 1.4).stroke({ width: 1.1, color: accent, alpha: 0.9, cap: "round" });
    graphic.moveTo(x - 2.5, y - 3.2).lineTo(x + 1.6, y - 1.4).stroke({ width: 1, color: accent, alpha: 0.9, cap: "round" });
    graphic.circle(x - 2.5, y + 3.1, 1.5).fill({ color: accent, alpha: 0.92 });
    graphic.circle(x + 1.6, y + 3.1, 1.5).fill({ color: accent, alpha: 0.92 });
    return;
  }

  if (city.discipline === "video") {
    graphic.roundRect(x - 3.6, y - 2.8, 4.8, 5.6, 1.2).fill({ color: accent, alpha: 0.82 });
    graphic.poly([x + 2.1, y - 3.2, x + 5.2, y - 5.2, x + 5.2, y + 5.2, x + 2.1, y + 3.2], true).fill({ color: accent, alpha: 0.74 });
    return;
  }

  if (city.discipline === "writing") {
    graphic.moveTo(x - 3.8, y - 2).lineTo(x + 3.8, y - 2).stroke({ width: 1, color: 0xf5ddb4, alpha: 0.88, cap: "round" });
    graphic.moveTo(x - 3.8, y + 1).lineTo(x + 3.8, y + 1).stroke({ width: 1, color: accent, alpha: 0.88, cap: "round" });
    graphic.moveTo(x, y - 4).lineTo(x, y + 4).stroke({ width: 0.9, color: accent, alpha: 0.72, cap: "round" });
    return;
  }

  graphic.moveTo(x - 4, y).lineTo(x + 4, y).stroke({ width: 1.1, color: 0xf5ddb4, alpha: 0.88, cap: "round" });
  graphic.moveTo(x, y - 3.6).lineTo(x, y + 3.6).stroke({ width: 1.1, color: accent, alpha: 0.9, cap: "round" });
  graphic.circle(x - 4.8, y, 1.2).fill({ color: accent, alpha: 0.86 });
  graphic.circle(x + 4.8, y, 1.2).fill({ color: accent, alpha: 0.86 });
}

function drawCityGlyph(graphic: Graphics, city: RenderCity, active: boolean) {
  const accent = toPixiColor(city.bannerTone);
  const tone = toPixiColor(disciplineTone[city.discipline]);
  const stone = terrainStone[city.terrain];
  const seed = hashString(city.slug);
  const profile = getCityStructureProfile(city);
  const age = clamp(city.ageYears / 16, 0, 1);
  const sprawl = clamp((city.metrics.reach + city.metrics.activity) / 20, 0, 1);
  const prestige = clamp(city.metrics.prestige / 10, 0, 1);
  const stability = clamp(city.metrics.stability / 10, 0, 1);
  const leftBias = ((seed >> 2) % 4) - 1.5;
  const rightBias = ((seed >> 5) % 4) - 1.5;
  const glowAlpha = active ? 0.36 : 0.18;
  const baseRadius = city.radius + (city.level === "wonder" ? 14 : 8);
  const wall = mixColor(stone.dark, 0x382f29, age * 0.28);
  const wallLight = mixColor(stone.mid, 0xb6a68a, (1 - age) * 0.1);
  const wallBright = mixColor(stone.light, 0xd3c2a5, (1 - age) * 0.12);
  const roofBase = city.level === "wonder" ? 0xcdb374 : city.level === "capital" ? 0xb28a63 : 0xa57a58;
  const roof = mixColor(roofBase, 0x6d675f, age * 0.24);
  const windowTone = 0xf5ddb4;
  const trim = active ? 0xf0c980 : wallBright;
  const districtTint = mixColor(tone, wallBright, 0.56);
  const gate = 0x241710;
  const leftTowerHeight = 12 + Math.round(prestige * 4 + age * 2 + leftBias);
  const rightTowerHeight = 12 + Math.round(stability * 4 + age * 2 + rightBias);
  const outerDistricts = sprawl > 0.52;
  const oldQuarter = age > 0.62;
  const ceremonialCrown = prestige > 0.72 || city.level === "capital" || city.level === "wonder";
  const towerSpread = profile.towerSpread;

  graphic.clear();
  graphic.circle(0, 0, city.radius + 20).fill({ color: tone, alpha: active ? 0.18 : 0.1 });
  graphic.circle(0, -4, city.radius + 13).fill({ color: accent, alpha: active ? 0.14 : 0.07 });
  graphic.ellipse(0, baseRadius * 0.68, city.radius + 13, 9).fill({ color: 0x070403, alpha: 0.34 });
  graphic.ellipse(0, baseRadius * 0.52, city.radius + 11, 13).fill({ color: accent, alpha: glowAlpha });
  graphic.ellipse(0, baseRadius * 0.4, city.radius + 16, 7).fill({ color: tone, alpha: active ? 0.2 : 0.1 });
  graphic.roundRect(-(city.radius + 9), city.radius * 0.15, (city.radius + 9) * 2, 6, 3).fill({ color: 0x211711, alpha: 0.46 });

  if (city.level === "settlement") {
    graphic.roundRect(-18, -2, 36, 10, 3).fill({ color: wall, alpha: 1 }).stroke({ width: 1, color: trim, alpha: 0.52 });
    drawBattlements(graphic, 0, -4, 30, trim, 0.64);
    drawCentralKeep(graphic, {
      x: 0,
      baseY: 8,
      width: 14,
      height: 10 + Math.round(age * 1.4),
      body: wallLight,
      bright: wallBright,
      roof,
      trim,
      gate,
      windowTone,
      accent,
      profile,
      active,
    });
    if (profile.districtPattern === 0 || profile.districtPattern === 3) {
      drawDistrictHouse(graphic, -11, 7, 9, 8 + Math.round(age * 2), wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, 11, 7, 9, 8 + Math.round(sprawl * 2), wallBright, roof, trim, windowTone);
    } else if (profile.districtPattern === 1) {
      drawDistrictHouse(graphic, -13, 7, 10, 8 + Math.round(age * 2), wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, 8, 7, 8, 7 + Math.round(sprawl), wallBright, roof, trim, windowTone);
      drawDistrictHouse(graphic, 17, 8, 7, 6, mixColor(wallBright, districtTint, 0.22), roof, trim, windowTone);
    } else {
      drawDistrictHouse(graphic, 13, 7, 10, 8 + Math.round(sprawl * 2), wallBright, roof, trim, windowTone);
      drawDistrictHouse(graphic, -8, 7, 8, 7 + Math.round(age), wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, -17, 8, 7, 6, mixColor(wallLight, districtTint, 0.22), roof, trim, windowTone);
    }
    if (oldQuarter) {
      drawDistrictHouse(graphic, -22, 8, 8, 7, mixColor(wallLight, 0x3d352f, 0.24), mixColor(roof, 0x6a6259, 0.18), trim, windowTone);
    }
    drawPennant(graphic, 0, -1, accent, 1, active);
    drawDisciplineSigil(graphic, city, 0, 3, accent);
    return;
  }

  if (city.level === "town") {
    graphic.roundRect(-22, -7, 44, 16, 3).fill({ color: wall, alpha: 1 }).stroke({ width: 1.15, color: trim, alpha: 0.58 });
    drawBattlements(graphic, 0, -10, 38, trim, 0.66);
    drawTower(graphic, -towerSpread + 7, 7, 10, leftTowerHeight, wallLight, roof, trim, windowTone);
    drawTower(graphic, towerSpread - 7, 7, 10, rightTowerHeight, wallLight, roof, trim, windowTone);
    drawCentralKeep(graphic, {
      x: 0,
      baseY: 9,
      width: 16,
      height: 20 + Math.round(age * 2),
      body: wall,
      bright: wallBright,
      roof,
      trim,
      gate,
      windowTone,
      accent,
      profile,
      active,
    });
    if (profile.districtPattern === 0) {
      drawDistrictHouse(graphic, -26, 7, 9, 8 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, 26, 7, 9, 8 + Math.round(age * 2), districtTint, roof, trim, windowTone);
    } else if (profile.districtPattern === 1) {
      drawDistrictHouse(graphic, -28, 7, 10, 8 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, 24, 8, 7, 6 + Math.round(age), mixColor(districtTint, wallBright, 0.18), roof, trim, windowTone);
      drawDistrictHouse(graphic, 33, 9, 7, 6, mixColor(wallLight, districtTint, 0.24), roof, trim, windowTone);
    } else if (profile.districtPattern === 2) {
      drawDistrictHouse(graphic, 28, 7, 10, 8 + Math.round(age * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, -24, 8, 7, 6 + Math.round(sprawl), mixColor(districtTint, wallBright, 0.18), roof, trim, windowTone);
      drawDistrictHouse(graphic, -33, 9, 7, 6, mixColor(wallLight, districtTint, 0.24), roof, trim, windowTone);
    } else {
      drawDistrictHouse(graphic, -22, 14, 8, 6, mixColor(districtTint, wallLight, 0.2), roof, trim, windowTone);
      drawDistrictHouse(graphic, 22, 14, 8, 6, mixColor(districtTint, wallLight, 0.2), roof, trim, windowTone);
    }
    if (outerDistricts) {
      drawDistrictHouse(graphic, -36, 9, 8, 7, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
      drawDistrictHouse(graphic, 36, 9, 8, 7, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
    }
    drawPennant(graphic, -towerSpread + 7, -5, accent, -1, active);
    drawPennant(graphic, towerSpread - 7, -5, accent, 1, active);
    drawDisciplineSigil(graphic, city, 0, 3, accent);
    return;
  }

  if (city.level === "city") {
    graphic.roundRect(-28, -9, 56, 18, 4).fill({ color: wall, alpha: 1 }).stroke({ width: 1.2, color: trim, alpha: 0.62 });
    drawBattlements(graphic, 0, -12, 48, trim, 0.68);
    drawTower(graphic, -towerSpread, 7, 10, leftTowerHeight + 3, wallLight, roof, trim, windowTone);
    drawTower(graphic, towerSpread, 7, 10, rightTowerHeight + 3, wallLight, roof, trim, windowTone);
    if (profile.extraTower) {
      drawTower(graphic, 0, 4, 8, 12 + Math.round(prestige * 2), mixColor(wallLight, wallBright, 0.3), roof, trim, windowTone);
    }
    drawCentralKeep(graphic, {
      x: 0,
      baseY: 9,
      width: 18,
      height: 22 + Math.round(prestige * 3),
      body: wall,
      bright: wallBright,
      roof,
      trim,
      gate,
      windowTone,
      accent,
      profile,
      active,
    });
    if (profile.districtPattern === 0) {
      drawDistrictHouse(graphic, -31, 8, 10, 9 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, 31, 8, 10, 9 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, -10, 14, 8, 6.5 + age * 1.4, mixColor(wallLight, districtTint, 0.18), roof, trim, windowTone);
      drawDistrictHouse(graphic, 10, 14, 8, 6.5 + age * 1.4, mixColor(wallLight, districtTint, 0.18), roof, trim, windowTone);
    } else if (profile.districtPattern === 1) {
      drawDistrictHouse(graphic, -34, 8, 11, 10 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, -18, 14, 8, 7, mixColor(wallLight, districtTint, 0.18), roof, trim, windowTone);
      drawDistrictHouse(graphic, 24, 10, 8, 7, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
    } else if (profile.districtPattern === 2) {
      drawDistrictHouse(graphic, 34, 8, 11, 10 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, 18, 14, 8, 7, mixColor(wallLight, districtTint, 0.18), roof, trim, windowTone);
      drawDistrictHouse(graphic, -24, 10, 8, 7, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
    } else {
      drawDistrictHouse(graphic, -21, 14, 8, 6.5 + age * 1.4, mixColor(wallLight, districtTint, 0.18), roof, trim, windowTone);
      drawDistrictHouse(graphic, 0, 16, 7, 5.6, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
      drawDistrictHouse(graphic, 21, 14, 8, 6.5 + age * 1.4, mixColor(wallLight, districtTint, 0.18), roof, trim, windowTone);
    }
    if (outerDistricts) {
      drawDistrictHouse(graphic, -42, 10, 9, 8, mixColor(districtTint, wallBright, 0.3), roof, trim, windowTone);
      drawDistrictHouse(graphic, 42, 10, 9, 8, mixColor(districtTint, wallBright, 0.3), roof, trim, windowTone);
    }
    drawPennant(graphic, -towerSpread, -7, accent, -1, active);
    drawPennant(graphic, towerSpread, -7, accent, 1, active);
    drawDisciplineSigil(graphic, city, 0, 4, accent);
    return;
  }

  if (city.level === "capital") {
    graphic.roundRect(-31, -10, 62, 20, 4).fill({ color: wall, alpha: 1 }).stroke({ width: 1.25, color: trim, alpha: 0.66 });
    drawBattlements(graphic, 0, -13, 54, trim, 0.72);
    drawTower(graphic, -towerSpread - 1, 7, 11, leftTowerHeight + 6, wallLight, roof, trim, windowTone);
    drawTower(graphic, towerSpread + 1, 7, 11, rightTowerHeight + 6, wallLight, roof, trim, windowTone);
    if (profile.extraTower) {
      drawTower(graphic, 0, 4, 9, 15 + Math.round(prestige * 2), mixColor(wallLight, wallBright, 0.3), roof, trim, windowTone);
    }
    drawCentralKeep(graphic, {
      x: 0,
      baseY: 10,
      width: 20,
      height: 27 + Math.round(prestige * 4),
      body: wall,
      bright: wallBright,
      roof,
      trim,
      gate,
      windowTone,
      accent,
      profile,
      active,
    });
    if (profile.districtPattern === 0) {
      drawDistrictHouse(graphic, -34, 8, 11, 9 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, 34, 8, 11, 9 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, -14, 15, 9, 7 + age * 1.6, wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, 14, 15, 9, 7 + age * 1.6, wallLight, roof, trim, windowTone);
    } else if (profile.districtPattern === 1) {
      drawDistrictHouse(graphic, -38, 8, 12, 10 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, -20, 15, 9, 7 + age * 1.4, wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, 18, 13, 8, 7, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
    } else if (profile.districtPattern === 2) {
      drawDistrictHouse(graphic, 38, 8, 12, 10 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
      drawDistrictHouse(graphic, 20, 15, 9, 7 + age * 1.4, wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, -18, 13, 8, 7, mixColor(districtTint, wallBright, 0.24), roof, trim, windowTone);
    } else {
      drawDistrictHouse(graphic, -22, 16, 8, 7, wallLight, roof, trim, windowTone);
      drawDistrictHouse(graphic, 0, 17, 8, 6, mixColor(districtTint, wallBright, 0.22), roof, trim, windowTone);
      drawDistrictHouse(graphic, 22, 16, 8, 7, wallLight, roof, trim, windowTone);
    }
    if (outerDistricts) {
      drawDistrictHouse(graphic, -45, 10, 9, 8, mixColor(districtTint, wallBright, 0.28), roof, trim, windowTone);
      drawDistrictHouse(graphic, 45, 10, 9, 8, mixColor(districtTint, wallBright, 0.28), roof, trim, windowTone);
    }
    drawPennant(graphic, -towerSpread - 1, -10, accent, -1, active);
    drawPennant(graphic, towerSpread + 1, -10, accent, 1, active);
    drawPennant(graphic, 0, -17, accent, 1, active);
    if (ceremonialCrown) {
      graphic.circle(0, -34, 6).fill({ color: mixColor(accent, 0xf1dfb1, 0.35), alpha: 0.9 });
      graphic.circle(0, -34, 12).fill({ color: accent, alpha: active ? 0.18 : 0.1 });
    }
    drawDisciplineSigil(graphic, city, 0, 4, accent);
    return;
  }

  graphic.roundRect(-32, -11, 64, 21, 4.5).fill({ color: wall, alpha: 1 }).stroke({ width: 1.3, color: trim, alpha: 0.68 });
  drawBattlements(graphic, 0, -14, 56, trim, 0.74);
  drawTower(graphic, -towerSpread - 2, 7, 11, leftTowerHeight + 8, wallLight, roof, trim, windowTone);
  drawTower(graphic, towerSpread + 2, 7, 11, rightTowerHeight + 8, wallLight, roof, trim, windowTone);
  if (profile.extraTower) {
    drawTower(graphic, 0, 3, 10, 18 + Math.round(prestige * 2), mixColor(wallLight, wallBright, 0.34), roof, trim, windowTone);
  }
  drawCentralKeep(graphic, {
    x: 0,
    baseY: 10,
    width: 24,
    height: 18 + Math.round(prestige * 4),
    body: wall,
    bright: wallBright,
    roof,
    trim,
    gate,
    windowTone,
    accent,
    profile,
    active,
  });
  if (profile.shrine) {
    graphic.circle(0, -28, 8.5).fill({ color: windowTone, alpha: 0.96 });
    graphic.circle(0, -28, 16).fill({ color: accent, alpha: active ? 0.26 : 0.16 });
  }
  if (profile.districtPattern === 0) {
    drawDistrictHouse(graphic, -36, 8, 12, 9.5 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
    drawDistrictHouse(graphic, 36, 8, 12, 9.5 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
    drawDistrictHouse(graphic, -14, 15, 10, 7 + age * 1.8, wallLight, roof, trim, windowTone);
    drawDistrictHouse(graphic, 14, 15, 10, 7 + age * 1.8, wallLight, roof, trim, windowTone);
  } else if (profile.districtPattern === 1) {
    drawDistrictHouse(graphic, -40, 8, 13, 10 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
    drawDistrictHouse(graphic, -18, 16, 10, 7 + age * 1.6, wallLight, roof, trim, windowTone);
    drawDistrictHouse(graphic, 10, 14, 9, 7, mixColor(districtTint, wallBright, 0.26), roof, trim, windowTone);
    drawDistrictHouse(graphic, 24, 12, 8, 6.5, mixColor(districtTint, wallBright, 0.18), roof, trim, windowTone);
  } else if (profile.districtPattern === 2) {
    drawDistrictHouse(graphic, 40, 8, 13, 10 + Math.round(sprawl * 2), districtTint, roof, trim, windowTone);
    drawDistrictHouse(graphic, 18, 16, 10, 7 + age * 1.6, wallLight, roof, trim, windowTone);
    drawDistrictHouse(graphic, -10, 14, 9, 7, mixColor(districtTint, wallBright, 0.26), roof, trim, windowTone);
    drawDistrictHouse(graphic, -24, 12, 8, 6.5, mixColor(districtTint, wallBright, 0.18), roof, trim, windowTone);
  } else {
    drawDistrictHouse(graphic, -22, 17, 9, 7, wallLight, roof, trim, windowTone);
    drawDistrictHouse(graphic, 0, 18, 8, 6.2, mixColor(districtTint, wallBright, 0.28), roof, trim, windowTone);
    drawDistrictHouse(graphic, 22, 17, 9, 7, wallLight, roof, trim, windowTone);
  }
  if (outerDistricts) {
    drawDistrictHouse(graphic, -48, 10, 10, 8.5, mixColor(districtTint, wallBright, 0.34), roof, trim, windowTone);
    drawDistrictHouse(graphic, 48, 10, 10, 8.5, mixColor(districtTint, wallBright, 0.34), roof, trim, windowTone);
  }
  if (oldQuarter) {
    drawDistrictHouse(graphic, -24, 17, 8, 6.5, mixColor(wallLight, 0x3f382f, 0.18), mixColor(roof, 0x675f58, 0.18), trim, windowTone);
    drawDistrictHouse(graphic, 24, 17, 8, 6.5, mixColor(wallLight, 0x3f382f, 0.18), mixColor(roof, 0x675f58, 0.18), trim, windowTone);
  }
  drawPennant(graphic, -towerSpread - 2, -11, accent, -1, active);
  drawPennant(graphic, towerSpread + 2, -11, accent, 1, active);
  drawPennant(graphic, 0, -36, accent, 1, active);
  graphic.circle(0, -36, 15).fill({ color: accent, alpha: active ? 0.22 : 0.12 });
  drawDisciplineSigil(graphic, city, 0, 4, accent);
}

function drawGreatWorkMonument(graphic: Graphics, city: RenderCity, title: string, active: boolean) {
  const accent = toPixiColor(city.bannerTone);
  const titleSeed = hashString(`${city.slug}:${title}`);
  const variants = ["beacon", "engine", "harbor", "archive", "observatory", "gate"] as const;
  const variant =
    /beacon|signal|lighthouse/i.test(title)
      ? "beacon"
      : /engine|citadel|forge|automation/i.test(title)
        ? "engine"
        : /harbor|port|exchange/i.test(title)
          ? "harbor"
          : /archive|editorial|library|script/i.test(title)
            ? "archive"
            : /observatory|aoa|oracle|watch/i.test(title)
              ? "observatory"
              : /webipcs|gateway|gate|bridge/i.test(title)
                ? "gate"
                : variants[titleSeed % variants.length];

  graphic.clear();
  graphic.ellipse(0, 16, 24, 8).fill({ color: 0x070403, alpha: 0.28 });
  graphic.ellipse(0, 12, 20, 7).fill({ color: accent, alpha: active ? 0.28 : 0.16 });
  graphic
    .poly([-22, 14, -16, 0, 16, 0, 22, 14, 12, 18, -12, 18], true)
    .fill({ color: 0x4c3b2b, alpha: 1 })
    .stroke({ width: 1, color: accent, alpha: 0.42 });

  if (variant === "beacon") {
    graphic.poly([-4, 0, 0, -20, 4, 0], true).fill({ color: accent, alpha: 0.9 });
    graphic.roundRect(-3, -2, 6, 12, 2).fill({ color: 0xf7e8c7, alpha: 0.92 });
    graphic.circle(0, -24, 5).fill({ color: accent, alpha: 1 });
    graphic.circle(0, -24, 11).fill({ color: accent, alpha: active ? 0.34 : 0.18 });
    return;
  }

  if (variant === "engine") {
    graphic.roundRect(-14, -10, 28, 16, 3).fill({ color: 0x5b4634, alpha: 1 });
    graphic.roundRect(-7, -20, 14, 10, 2).fill({ color: accent, alpha: 0.86 });
    graphic.roundRect(-11, -4, 4, 10, 1.5).fill({ color: 0xf7e8c7, alpha: 0.85 });
    graphic.roundRect(7, -4, 4, 10, 1.5).fill({ color: 0xf7e8c7, alpha: 0.85 });
    return;
  }

  if (variant === "harbor") {
    graphic.moveTo(-16, 2).quadraticCurveTo(0, -12, 16, 2).stroke({ width: 2.4, color: accent, alpha: 0.92, cap: "round" });
    graphic.roundRect(-12, -4, 6, 12, 2).fill({ color: accent, alpha: 0.82 });
    graphic.roundRect(6, -4, 6, 12, 2).fill({ color: accent, alpha: 0.82 });
    graphic.poly([-8, 8, 0, -6, 8, 8], true).fill({ color: 0xf7e8c7, alpha: 0.9 });
    return;
  }

  if (variant === "archive") {
    graphic.roundRect(-14, -9, 28, 18, 3).fill({ color: 0x564535, alpha: 1 });
    graphic.roundRect(-10, -17, 20, 8, 2).fill({ color: accent, alpha: 0.76 });
    [-8, -2, 4].forEach((x) => {
      graphic.roundRect(x, -4, 3, 9, 1).fill({ color: 0xf7e8c7, alpha: 0.84 });
    });
    graphic.moveTo(-14, -9).lineTo(14, -9).stroke({ width: 1, color: accent, alpha: 0.58 });
    return;
  }

  if (variant === "observatory") {
    graphic.circle(0, -6, 9).fill({ color: 0x5a4738, alpha: 1 }).stroke({ width: 1, color: accent, alpha: 0.5 });
    graphic.circle(0, -6, 5.5).fill({ color: 0xf7e8c7, alpha: 0.7 });
    graphic.roundRect(-4, 0, 8, 10, 2).fill({ color: accent, alpha: 0.82 });
    graphic.moveTo(-8, -6).lineTo(8, -14).stroke({ width: 1.5, color: accent, alpha: 0.92, cap: "round" });
    graphic.circle(9.5, -14.5, 2.4).fill({ color: accent, alpha: 0.98 });
    return;
  }

  if (variant === "gate") {
    graphic.roundRect(-16, -6, 32, 14, 3).fill({ color: 0x584231, alpha: 1 }).stroke({ width: 1, color: accent, alpha: 0.48 });
    graphic.roundRect(-11, -16, 8, 10, 2).fill({ color: accent, alpha: 0.8 });
    graphic.roundRect(3, -16, 8, 10, 2).fill({ color: accent, alpha: 0.8 });
    graphic.roundRect(-3.2, -1, 6.4, 9, 1.4).fill({ color: 0xf7e8c7, alpha: 0.9 });
    graphic.moveTo(-8, -10).lineTo(-8, 0).stroke({ width: 1, color: 0xf7e8c7, alpha: 0.8 });
    graphic.moveTo(8, -10).lineTo(8, 0).stroke({ width: 1, color: 0xf7e8c7, alpha: 0.8 });
    return;
  }

  graphic.poly([0, -24, 10, 8, -10, 8], true).fill({ color: accent, alpha: 0.88 });
  graphic.roundRect(-3, -2, 6, 10, 1.5).fill({ color: 0xf7e8c7, alpha: 0.9 });
  graphic.circle(0, -26, active ? 4.5 : 3.8).fill({ color: accent, alpha: 1 });
}

function createUnitSprite(descriptor: UnitDescriptor) {
  const container = new Container();
  const color = toPixiColor(descriptor.color);
  const base = new Graphics();
  base.circle(0, 11, 12).fill({ color: 0x000000, alpha: 0.22 });
  base.ellipse(0, 11, 12, 4.8).fill({ color: 0x000000, alpha: 0.22 });
  container.addChild(base);

  const accent = new Graphics();
  const body = 0x140f0b;
  const skin = 0xf3d9be;

  if (descriptor.type === "robot") {
    accent.roundRect(-6, -2, 12, 10, 2.6).fill({ color, alpha: 0.86 });
    accent.roundRect(-4.4, -12, 8.8, 8, 2.2).fill({ color: body, alpha: 0.92 }).stroke({ width: 1, color, alpha: 1 });
    accent.circle(-1.6, -8, 1.2).fill({ color, alpha: 1 });
    accent.circle(1.6, -8, 1.2).fill({ color, alpha: 1 });
    accent.moveTo(-8, -1).lineTo(-12, 4).stroke({ width: 1.3, color, alpha: 1, cap: "round" });
    accent.moveTo(8, -1).lineTo(12, 4).stroke({ width: 1.3, color, alpha: 1, cap: "round" });
    accent.moveTo(-3, 8).lineTo(-5, 13).stroke({ width: 1.3, color, alpha: 1, cap: "round" });
    accent.moveTo(3, 8).lineTo(5, 13).stroke({ width: 1.3, color, alpha: 1, cap: "round" });
    accent.moveTo(0, -12).lineTo(0, -16).stroke({ width: 1.1, color, alpha: 1, cap: "round" });
    accent.circle(0, -17, 1.4).fill({ color, alpha: 1 });
  } else if (descriptor.type === "horse") {
    accent
      .moveTo(-10, 5)
      .bezierCurveTo(-9, -2, -4, -7, 3, -7)
      .bezierCurveTo(8, -7, 11, -4, 11, 0)
      .bezierCurveTo(11, 4, 9, 6, 5, 7)
      .lineTo(-1, 8)
      .lineTo(-10, 5)
      .closePath()
      .fill({ color, alpha: 0.84 });
    accent.moveTo(2, -6).lineTo(7, -12).lineTo(10, -10).lineTo(7, -4).stroke({ width: 1.2, color, alpha: 1, cap: "round", join: "round" });
    accent.moveTo(-6, 8).lineTo(-7, 14).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(-1, 8).lineTo(-1, 14).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(5, 8).lineTo(6, 14).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(9, 5).lineTo(10, 12).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(-10, 2).lineTo(-14, 0).stroke({ width: 1.1, color, alpha: 1, cap: "round" });
  } else if (descriptor.type === "camel-trader") {
    accent
      .moveTo(-12, 6)
      .bezierCurveTo(-11, 1, -8, -2, -4, -2)
      .bezierCurveTo(-2, -8, 3, -8, 4, -2)
      .bezierCurveTo(8, -3, 12, 0, 12, 5)
      .bezierCurveTo(12, 8, 9, 10, 4, 10)
      .lineTo(-4, 10)
      .bezierCurveTo(-9, 10, -12, 9, -12, 6)
      .closePath()
      .fill({ color, alpha: 0.84 });
    accent.circle(10, -2.5, 2).fill({ color, alpha: 1 });
    accent.moveTo(-8, 10).lineTo(-9, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.moveTo(-2, 10).lineTo(-2, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.moveTo(4, 10).lineTo(5, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.moveTo(9, 9).lineTo(10, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.roundRect(-3.5, 0.5, 7, 5, 1.2).fill({ color: 0x120c09, alpha: 0.78 }).stroke({ width: 0.8, color, alpha: 1 });
  } else if (descriptor.type === "scout") {
    accent.poly([-9, 6, 0, -10, 9, 6], true).fill({ color, alpha: 0.82 });
    accent.moveTo(-1, -4).lineTo(8, -12).stroke({ width: 1.2, color, alpha: 1, cap: "round" });
    accent.circle(9.5, -13, 1.8).fill({ color, alpha: 1 });
    accent.roundRect(-2.4, 6, 4.8, 6, 1.4).fill({ color: body, alpha: 0.78 }).stroke({ width: 0.8, color, alpha: 1 });
  } else if (descriptor.type === "sage") {
    accent
      .moveTo(-7, 8)
      .bezierCurveTo(-7, -2, -3, -8, 0, -8)
      .bezierCurveTo(3, -8, 7, -2, 7, 8)
      .closePath()
      .fill({ color, alpha: 0.78 });
    accent.moveTo(-2, -12).bezierCurveTo(-2, -15, 2, -15, 2, -12).stroke({ width: 1.1, color, alpha: 1, cap: "round" });
    accent.circle(0, -14, 1.9).fill({ color, alpha: 1 });
    accent.moveTo(9, 8).lineTo(9, -4).stroke({ width: 1.2, color, alpha: 1, cap: "round" });
    accent.circle(9, -6.5, 1.8).fill({ color, alpha: 1 });
  } else if (descriptor.type === "archer") {
    accent.circle(0, -9, 2.1).fill({ color, alpha: 1 });
    accent.moveTo(0, -6).lineTo(0, 4).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(-6, -1).lineTo(4, -3).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(-1, 4).lineTo(-4, 12).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(1, 4).lineTo(5, 12).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(7, -7).bezierCurveTo(11, -3, 11, 3, 7, 7).stroke({ width: 1.25, color, alpha: 1, cap: "round" });
    accent.moveTo(3, -4).lineTo(10, -1).stroke({ width: 1.1, color, alpha: 1, cap: "round" });
  } else {
    base
      .moveTo(-5, 10)
      .bezierCurveTo(-6, 3, -3, -4, 0, -4)
      .bezierCurveTo(3, -4, 6, 3, 5, 10)
      .closePath()
      .fill({ color: body, alpha: 0.84 })
      .stroke({ width: 1, color, alpha: 0.68 });
    base.circle(0, -7, 3.8).fill({ color: skin, alpha: 1 }).stroke({ width: 0.6, color: 0x361e12, alpha: 0.4 });

    if (descriptor.type === "trader") {
      accent.roundRect(-9, -1, 5, 7, 1.5).fill({ color, alpha: 0.82 });
      accent.poly([6, 10, 10, 2, 14, 10], true).fill({ color, alpha: 0.8 });
      accent.circle(10, 10, 2.1).fill({ color: 0x110c09, alpha: 0.8 });
    } else if (descriptor.type === "army") {
      accent.moveTo(7, -2).lineTo(12, 10).stroke({ width: 1.4, color, alpha: 1, cap: "round" });
      accent.poly([9, -2, 14, 0, 10, 3], true).fill({ color, alpha: 1 });
      accent.circle(-9, 4, 3.3).fill({ color: 0x18120e, alpha: 0.88 }).stroke({ width: 1.1, color, alpha: 1 });
    } else if (descriptor.type === "builder") {
      accent.roundRect(-9, 2, 5, 6, 1.2).fill({ color, alpha: 0.76 });
      accent.moveTo(6, 0).lineTo(11, -4).stroke({ width: 1.4, color, alpha: 1, cap: "round" });
      accent.poly([10, -6, 13, -3, 8, -1], true).fill({ color, alpha: 1 });
    } else if (descriptor.type === "scholar") {
      accent.moveTo(8, 10).lineTo(8, -1).stroke({ width: 1.2, color, alpha: 1, cap: "round" });
      accent.circle(8, -3.5, 1.9).fill({ color, alpha: 1 });
      accent.roundRect(-10, 0, 6, 4.4, 1.1).fill({ color, alpha: 0.72 });
    }
  }

  container.addChild(accent);

  const ring = new Graphics();
  ring.circle(0, 0, 18).stroke({ width: 1.8, color, alpha: 0 });
  container.addChildAt(ring, 0);
  container.alpha = 0.32;

  return { container, ring };
}

function getUnitVisibilityAlpha(
  worldX: number,
  worldY: number,
  routeCities: Array<{ x: number; y: number }>,
  active: boolean,
) {
  if (active) {
    return 1;
  }

  const nearestCityDistance = routeCities.reduce((closest, city) => {
    const distance = Math.hypot(worldX - city.x, worldY - city.y);
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);

  const fadeNear = 26;
  const fadeFar = 118;
  const fadeProgress = clamp((nearestCityDistance - fadeNear) / (fadeFar - fadeNear), 0, 1);
  return 0.18 + fadeProgress * 0.6;
}

function createScene(viewport: Viewport) {
  const terrainLayer = new Container();
  const routeLayer = new Container();
  const improvementLayer = new Container();
  const greatWorkLayer = new Container();
  const cityLayer = new Container();
  const greatWorkLabelLayer = new Container();
  const unitLayer = new Container();

  terrainLayer.label = "terrain";
  routeLayer.label = "routes";
  improvementLayer.label = "improvements";
  greatWorkLayer.label = "greatWorks";
  cityLayer.label = "cities";
  greatWorkLabelLayer.label = "greatWorkLabels";
  unitLayer.label = "units";
  greatWorkLabelLayer.sortableChildren = true;

  viewport.addChild(terrainLayer, routeLayer, improvementLayer, greatWorkLayer, cityLayer, greatWorkLabelLayer, unitLayer);

  return {
    terrainLayer,
    routeLayer,
    improvementLayer,
    greatWorkLayer,
    cityLayer,
    greatWorkLabelLayer,
    unitLayer,
    cityNodes: new Map<string, CityNode>(),
    greatWorkNodes: new Map<string, GreatWorkNode>(),
    unitNodes: new Map<string, UnitNode>(),
  } satisfies SceneRefs;
}

function updateVisibility(scene: SceneRefs, viewport: Viewport, selectedSlug: string | null, hoveredCity: string | null) {
  const bounds = viewport.getVisibleBounds();
  const zoom = viewport.scale.x;
  const labelThreshold = zoom >= 0.72;
  const detailThreshold = zoom >= 0.8;

  scene.cityNodes.forEach((node, slug) => {
    const labelVisible =
      labelThreshold || slug === selectedSlug || slug === hoveredCity || bounds.contains(node.worldX, node.worldY);
    node.label.visible = labelVisible;
  });

  scene.greatWorkNodes.forEach((node) => {
    node.label.visible =
      detailThreshold &&
      (node.citySlug === selectedSlug ||
        node.citySlug === hoveredCity ||
        bounds.contains(node.worldX, node.worldY));
  });
}

export function WorldMapPixi({
  world,
  currentState,
  visibleCities,
  workBySlug,
  selectedYear,
  selectedSlug,
  introFocusSlug,
  hoveredCity,
  hoveredGreatWork,
  selectedUnitId,
  selectedUnitLock,
  introActive,
  toolUnits,
  camera,
  terrainAtPoint,
  onCameraChange,
  onDragStateChange,
  onBackgroundClick,
  onOpenWork,
  onSetHoveredCity,
  onSetHoveredGreatWork,
  onStopIntro,
  onClearSelectedUnit,
  onSelectUnit,
}: {
  world: WorldRenderModel;
  currentState: WorldState;
  visibleCities: RenderCity[];
  workBySlug: Map<string, Work>;
  selectedYear: number;
  selectedSlug: string | null;
  introFocusSlug: string | null;
  hoveredCity: string | null;
  hoveredGreatWork: string | null;
  selectedUnitId: string | null;
  selectedUnitLock: { id: string; x: number; y: number } | null;
  introActive: boolean;
  toolUnits: SiteConfig["scene"]["toolUnits"];
  camera: CameraState;
  terrainAtPoint: (x: number, y: number) => "coast" | "plains" | "forest" | "hills" | "highlands";
  onCameraChange: (
    camera: CameraState,
    options?: { fromClamp?: boolean },
  ) => void;
  onDragStateChange: (dragging: boolean) => void;
  onBackgroundClick: () => void;
  onOpenWork: (slug: string) => void;
  onSetHoveredCity: (slug: string | null) => void;
  onSetHoveredGreatWork: (key: string | null) => void;
  onStopIntro: () => void;
  onClearSelectedUnit: (unitId?: string | null) => void;
  onSelectUnit: (unit: SelectableUnit, clientX?: number, clientY?: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const callbacksRef = useRef({
    onCameraChange,
    onDragStateChange,
    onBackgroundClick,
    onOpenWork,
    onSetHoveredCity,
    onSetHoveredGreatWork,
    onStopIntro,
    onClearSelectedUnit,
    onSelectUnit,
  });
  const currentStateRef = useRef(currentState);
  const selectedUnitLockRef = useRef(selectedUnitLock);
  const selectedUnitIdRef = useRef(selectedUnitId);
  const hoveredCityRef = useRef(hoveredCity);
  const hoveredGreatWorkRef = useRef(hoveredGreatWork);
  const selectedSlugRef = useRef(selectedSlug);
  const introFocusSlugRef = useRef(introFocusSlug);
  const introActiveRef = useRef(introActive);
  const terrainAtPointRef = useRef(terrainAtPoint);
  const renderClockRef = useRef(0);
  const syncingCameraRef = useRef(false);
  const pointerDebugRef = useRef({ down: 0, move: 0, up: 0, dragging: false });
  const [sceneVersion, setSceneVersion] = useState(0);
  const staticWorldSignature = useMemo(
    () => `${world.width}x${world.height}:${world.hexes.length}`,
    [world.height, world.hexes.length, world.width],
  );
  const staticWorldRef = useRef<{
    signature: string;
    width: number;
    height: number;
    hexes: typeof world.hexes;
  } | null>(null);
  if (!staticWorldRef.current || staticWorldRef.current.signature !== staticWorldSignature) {
    staticWorldRef.current = {
      signature: staticWorldSignature,
      width: world.width,
      height: world.height,
      hexes: world.hexes,
    };
  }
  const staticWorld = staticWorldRef.current;
  const staticWorldWidth = staticWorld.width;
  const staticWorldHeight = staticWorld.height;
  const staticWorldHexes = staticWorld.hexes;

  useEffect(() => {
    callbacksRef.current = {
      onCameraChange,
      onDragStateChange,
      onBackgroundClick,
      onOpenWork,
      onSetHoveredCity,
      onSetHoveredGreatWork,
      onStopIntro,
      onClearSelectedUnit,
      onSelectUnit,
    };
    currentStateRef.current = currentState;
    selectedUnitLockRef.current = selectedUnitLock;
    selectedUnitIdRef.current = selectedUnitId;
    hoveredCityRef.current = hoveredCity;
    hoveredGreatWorkRef.current = hoveredGreatWork;
    selectedSlugRef.current = selectedSlug;
    introFocusSlugRef.current = introFocusSlug;
    introActiveRef.current = introActive;
    terrainAtPointRef.current = terrainAtPoint;
  }, [
    currentState,
    hoveredCity,
    hoveredGreatWork,
    introFocusSlug,
    introActive,
    onBackgroundClick,
    onCameraChange,
    onClearSelectedUnit,
    onDragStateChange,
    onOpenWork,
    onSelectUnit,
    onSetHoveredCity,
    onSetHoveredGreatWork,
    onStopIntro,
    selectedSlug,
    selectedUnitId,
    selectedUnitLock,
    terrainAtPoint,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.__CIVFOLIO_MAP_TEST__ = {
      getCityMetrics: (slug: string) => {
        const viewport = viewportRef.current;
        const host = hostRef.current;
        const node = sceneRef.current?.cityNodes.get(slug);
        if (!viewport || !host || !node) {
          return null;
        }

        const point = viewport.toScreen(node.worldX, node.worldY);
        const rect = host.getBoundingClientRect();
        return {
          x: rect.left + point.x,
          y: rect.top + point.y,
          radius: node.radius * viewport.scale.x,
        };
      },
      getUnitPoint: (id: string) => {
        const viewport = viewportRef.current;
        const host = hostRef.current;
        const node = sceneRef.current?.unitNodes.get(id);
        if (!viewport || !host || !node) {
          return null;
        }

        const point = viewport.toScreen(node.container.x, node.container.y);
        const rect = host.getBoundingClientRect();
        return {
          x: rect.left + point.x,
          y: rect.top + point.y,
        };
      },
      openCity: (slug: string) => {
        const exists = sceneRef.current?.cityNodes.has(slug) ?? false;
        if (exists) {
          callbacksRef.current.onOpenWork(slug);
        }
        return exists;
      },
      selectUnit: (id: string) => {
        const node = sceneRef.current?.unitNodes.get(id);
        if (!node) {
          return false;
        }
        const position = getRoutePoint(node.routeCities, node.descriptor.speed, renderClockRef.current);
        callbacksRef.current.onSelectUnit({
          id: node.descriptor.id,
          label: node.descriptor.label,
          type: node.descriptor.type,
          color: node.descriptor.color,
          worldX: position.x,
          worldY: position.y,
          angle: position.angle,
          terrain: terrainAtPoint(position.x, position.y),
        });
        return true;
      },
      clearSelection: () => {
        callbacksRef.current.onClearSelectedUnit();
      },
      panCameraBy: (dx: number, dy: number) => {
        const viewport = viewportRef.current;
        const host = hostRef.current;
        const scene = sceneRef.current;
        if (!viewport || !host || !scene) {
          return false;
        }

        const marginX = Math.min(220, Math.max(96, host.clientWidth * 0.18));
        const marginY = Math.min(180, Math.max(72, host.clientHeight * 0.18));
        const minX = host.clientWidth - staticWorldWidth * viewport.scale.x - marginX;
        const maxX = marginX;
        const minY = host.clientHeight - staticWorldHeight * viewport.scale.y - marginY;
        const maxY = marginY;

        viewport.x = clamp(viewport.x + dx, Math.min(minX, maxX), Math.max(minX, maxX));
        viewport.y = clamp(viewport.y + dy, Math.min(minY, maxY), Math.max(minY, maxY));
        updateVisibility(scene, viewport, selectedSlugRef.current, hoveredCityRef.current);
        callbacksRef.current.onCameraChange({
          zoom: viewport.scale.x,
          x: viewport.x,
          y: viewport.y,
        });
        return true;
      },
      zoomCameraOnCity: (slug: string, delta: number) => {
        const viewport = viewportRef.current;
        const host = hostRef.current;
        const scene = sceneRef.current;
        const node = sceneRef.current?.cityNodes.get(slug);
        if (!viewport || !host || !scene || !node) {
          return false;
        }

        const anchor = viewport.toScreen(node.worldX, node.worldY);
        const nextZoom = clamp(viewport.scale.x * Math.exp(delta), 0.38, 1.52);
        const marginX = Math.min(220, Math.max(96, host.clientWidth * 0.18));
        const marginY = Math.min(180, Math.max(72, host.clientHeight * 0.18));
        const minX = host.clientWidth - staticWorldWidth * nextZoom - marginX;
        const maxX = marginX;
        const minY = host.clientHeight - staticWorldHeight * nextZoom - marginY;
        const maxY = marginY;

        viewport.scale.set(nextZoom);
        viewport.x = clamp(anchor.x - node.worldX * nextZoom, Math.min(minX, maxX), Math.max(minX, maxX));
        viewport.y = clamp(anchor.y - node.worldY * nextZoom, Math.min(minY, maxY), Math.max(minY, maxY));
        updateVisibility(scene, viewport, selectedSlugRef.current, hoveredCityRef.current);
        callbacksRef.current.onCameraChange({
          zoom: viewport.scale.x,
          x: viewport.x,
          y: viewport.y,
        });
        return true;
      },
      getDebug: () => {
        const debug = window.__CIVFOLIO_EXPLORER_DEBUG__;
        return {
          cityCount: sceneRef.current?.cityNodes.size ?? 0,
          greatWorkLabelCount: sceneRef.current?.greatWorkLabelLayer.children.length ?? 0,
          layerOrder:
            sceneRef.current && viewportRef.current
              ? {
                  greatWorks: viewportRef.current.children.indexOf(sceneRef.current.greatWorkLayer),
                  cities: viewportRef.current.children.indexOf(sceneRef.current.cityLayer),
                  greatWorkLabels: viewportRef.current.children.indexOf(sceneRef.current.greatWorkLabelLayer),
                }
              : null,
          routeCount: Math.floor((sceneRef.current?.routeLayer.children.length ?? 0) / 2),
          routePathCount: sceneRef.current?.routeLayer.children.length ?? 0,
          unitCount: sceneRef.current?.unitNodes.size ?? 0,
          sceneVersion,
          camera: viewportRef.current
            ? {
                x: viewportRef.current.x,
                y: viewportRef.current.y,
                zoom: viewportRef.current.scale.x,
              }
            : null,
          pointer: pointerDebugRef.current,
          cities: sceneRef.current
            ? Array.from(sceneRef.current.cityNodes.entries()).map(([slug, node]) => ({
                slug,
                x: node.worldX,
                y: node.worldY,
                radius: node.radius,
              }))
            : [],
          viewport: viewportRef.current
            ? {
                width: viewportRef.current.screenWidth,
                height: viewportRef.current.screenHeight,
              }
            : null,
          explorer: debug ?? null,
        };
      },
    };

    return () => {
      delete window.__CIVFOLIO_MAP_TEST__;
    };
  }, [sceneVersion, staticWorldHeight, staticWorldWidth, terrainAtPoint]);

  useEffect(() => {
    let cancelled = false;
    const cleanupHost = hostRef.current;
    let movedHandler: ((event?: { type?: string }) => void) | null = null;
    let pointerDownHandler: ((event: PointerEvent) => void) | null = null;
    let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
    let pointerUpHandler: ((event: PointerEvent) => void) | null = null;
    let pointerCancelHandler: ((event: PointerEvent) => void) | null = null;
    let mouseDownHandler: ((event: MouseEvent) => void) | null = null;
    let mouseMoveHandler: ((event: MouseEvent) => void) | null = null;
    let mouseUpHandler: ((event: MouseEvent) => void) | null = null;
    let wheelHandler: (() => void) | null = null;
    let pressStart: { x: number; y: number } | null = null;
    let dragPointer:
      | {
          id: number;
          startClientX: number;
          startClientY: number;
          startViewportX: number;
          startViewportY: number;
          dragging: boolean;
        }
      | null = null;
    let mouseDrag:
      | {
          startClientX: number;
          startClientY: number;
          startViewportX: number;
          startViewportY: number;
          dragging: boolean;
        }
      | null = null;
    // Track the last tap to detect double-taps for touch-zoom.
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    async function init() {
      try {
        const host = hostRef.current;
        if (!host || appRef.current) {
          return;
        }

        const app = new Application();
        await app.init({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          preference: "webgl",
        });

        if (cancelled) {
          app.destroy(true, { children: true });
          return;
        }

        if (!(app.canvas instanceof HTMLCanvasElement)) {
          throw new Error("Pixi returned a non-DOM canvas");
        }

        app.canvas.classList.add("absolute", "inset-0", "h-full", "w-full");
        app.canvas.style.touchAction = "none";
        host.appendChild(app.canvas);

        const viewport = new Viewport({
          screenWidth: host.clientWidth || staticWorldWidth,
          screenHeight: host.clientHeight || staticWorldHeight,
          worldWidth: staticWorldWidth,
          worldHeight: staticWorldHeight,
          events: app.renderer.events,
          passiveWheel: false,
          stopPropagation: true,
          ticker: app.ticker,
        });

        // Higher `smooth` = longer wheel/trackpad zoom ramp for less jitter.
        viewport.wheel({ smooth: 12, wheelZoom: true, trackpadPinch: true });
        // Native two-finger pinch on touch devices (and trackpad pinch via the
        // wheel plugin above). `noDrag` lets our custom drag handler keep
        // panning while pinching. Slightly softer `percent` makes pinch steps
        // easier to control.
        viewport.pinch({ percent: 0.92, noDrag: false });
        // Gentler coast if another interaction ever feeds the decelerate path.
        viewport.decelerate({ friction: 0.945, minSpeed: 0.004 });
        viewport.clamp({ direction: "all", underflow: "center" });
        // Match the React-side cameraZoomLimits.min on mobile (0.32). The
        // small change is irrelevant on desktop because the desktop floor
        // never reaches this clamp, but it lets compact viewports pinch out
        // to a true fit-to-world overview.
        viewport.clampZoom({ minScale: 0.32, maxScale: 1.52 });
        viewport.eventMode = "static";
        viewport.sortableChildren = true;

        app.stage.addChild(viewport);

        const background = new Graphics();
        background.rect(0, 0, staticWorldWidth, staticWorldHeight).fill({ color: 0x08111a, alpha: 0.001 });
        background.eventMode = "static";
        background.cursor = "grab";
        background.on("pointertap", () => {
          callbacksRef.current.onBackgroundClick();
        });
        viewport.addChild(background);

        const scene = createScene(viewport);

        const terrainBase = new Graphics();
        staticWorldHexes.forEach((hex) => {
          const tileSeed = (hashString(hex.id) % 1000) / 1000;
          const fillBase = toPixiColor(terrainFill[hex.terrain]);
          const rimBase = toPixiColor(terrainRim[hex.terrain]);
          const shadeBase = toPixiColor(terrainShade[hex.terrain]);
          const fillColor =
            tileSeed < 0.52
              ? mixColor(fillBase, shadeBase, 0.08 + tileSeed * 0.12)
              : mixColor(fillBase, 0xd9ccb0, 0.035 + (tileSeed - 0.52) * 0.08);
          const rimColor = mixColor(rimBase, fillColor, 0.36);
          const shadeColor = mixColor(shadeBase, 0x141110, 0.18);

          terrainBase
            .poly(parsePolygonPoints(hex.points), true)
            .fill({ color: fillColor, alpha: hex.terrain === "coast" ? 0.9 : 0.96 })
            .stroke({
              width: 2.2,
              color: rimColor,
              alpha: 0.22,
            });
          terrainBase
            .poly(parsePolygonPoints(hex.points), true)
            .fill({ color: shadeColor, alpha: 0.09 });
          terrainBase
            .circle(hex.x - 11, hex.y - 14, 14)
            .fill({ color: 0xf4ead2, alpha: hex.terrain === "coast" ? 0.048 : 0.03 + tileSeed * 0.012 });

          const resourceKind = pickTileResource(hex, tileSeed);
          if (resourceKind) {
            drawTileResource(terrainBase, resourceKind, hex.x, hex.y, rimColor, tileSeed);
          }
        });
        scene.terrainLayer.addChild(terrainBase);

        addSimplePath(scene.terrainLayer, "M 80 610 C 240 540, 320 470, 490 490 C 670 512, 720 640, 910 620 C 1060 603, 1130 530, 1260 450", 0x7abde8, 18, 0.18);
        addSimplePath(scene.terrainLayer, "M 80 610 C 240 540, 320 470, 490 490 C 670 512, 720 640, 910 620 C 1060 603, 1130 530, 1260 450", 0x9ad5f6, 7, 0.42);
        addSimplePath(scene.terrainLayer, "M 260 120 C 340 200, 340 320, 470 380 C 560 420, 610 460, 670 560", 0x9ad5f6, 12, 0.22);
        addSimplePath(scene.terrainLayer, "M 260 120 C 340 200, 340 320, 470 380 C 560 420, 610 460, 670 560", 0x9ad5f6, 5, 0.4);
        scene.terrainLayer.cacheAsTexture({ antialias: true, resolution: 1.5 });

        appRef.current = app;
        viewportRef.current = viewport;
        sceneRef.current = scene;
        setSceneVersion((value) => value + 1);

        movedHandler = (event?: { type?: string }) => {
          updateVisibility(scene, viewport, selectedSlugRef.current, hoveredCityRef.current);
          if (syncingCameraRef.current) {
            return;
          }
          // The pixi-viewport `clamp` plugin runs on every ticker frame and,
          // when world is smaller than screen on either axis, re-centers it —
          // emitting `moved` with `type: "clamp-x"` / `"clamp-y"`. These are
          // *echoes* of state we already pushed from React, not user gestures,
          // so we mark them as `fromClamp` to let the explorer keep its tween
          // target (a real user gesture would clobber the target intentionally
          // and stop any in-progress tween).
          const fromClamp = event?.type === "clamp-x" || event?.type === "clamp-y";
          callbacksRef.current.onCameraChange(
            {
              zoom: viewport.scale.x,
              x: viewport.x,
              y: viewport.y,
            },
            { fromClamp },
          );
        };
        const shouldIgnoreDragTarget = (target: EventTarget | null) =>
          target instanceof Element &&
          target.closest("button, a, input, textarea, select, label, [role='button']");
        const applyDragPosition = (startViewportX: number, startViewportY: number, dx: number, dy: number) => {
          const marginX = Math.min(220, Math.max(96, host.clientWidth * 0.18));
          const marginY = Math.min(180, Math.max(72, host.clientHeight * 0.18));
          const minX = host.clientWidth - staticWorldWidth * viewport.scale.x - marginX;
          const maxX = marginX;
          const minY = host.clientHeight - staticWorldHeight * viewport.scale.y - marginY;
          const maxY = marginY;

          viewport.x = clamp(startViewportX + dx, Math.min(minX, maxX), Math.max(minX, maxX));
          viewport.y = clamp(startViewportY + dy, Math.min(minY, maxY), Math.max(minY, maxY));
          movedHandler?.();
        };
        pointerDownHandler = (event) => {
          if (event.pointerType === "mouse" || event.button !== 0) {
            return;
          }
          if (shouldIgnoreDragTarget(event.target)) {
            return;
          }
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            down: pointerDebugRef.current.down + 1,
          };
          pressStart = { x: event.clientX, y: event.clientY };
          dragPointer = {
            id: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startViewportX: viewport.x,
            startViewportY: viewport.y,
            dragging: false,
          };
          try {
            host.setPointerCapture(event.pointerId);
          } catch {}
          callbacksRef.current.onStopIntro();
          callbacksRef.current.onClearSelectedUnit();
        };
        pointerMoveHandler = (event) => {
          if (!dragPointer || event.pointerId !== dragPointer.id) {
            return;
          }
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            move: pointerDebugRef.current.move + 1,
          };

          const dx = event.clientX - dragPointer.startClientX;
          const dy = event.clientY - dragPointer.startClientY;
          if (!dragPointer.dragging && Math.hypot(dx, dy) < 6) {
            return;
          }

          if (!dragPointer.dragging) {
            dragPointer.dragging = true;
            callbacksRef.current.onDragStateChange(true);
            pointerDebugRef.current = {
              ...pointerDebugRef.current,
              dragging: true,
            };
          }

          applyDragPosition(dragPointer.startViewportX, dragPointer.startViewportY, dx, dy);
        };
        pointerUpHandler = (event) => {
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            up: pointerDebugRef.current.up + 1,
            dragging: false,
          };
          const pointer = dragPointer;
          dragPointer = null;
          callbacksRef.current.onDragStateChange(false);
          try {
            host.releasePointerCapture(event.pointerId);
          } catch {}

          const hostRect = host.getBoundingClientRect();
          const start = pressStart;
          pressStart = null;
          if (!start) {
            return;
          }

          if (pointer?.dragging) {
            return;
          }

          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.hypot(dx, dy) > 8) {
            return;
          }

          const worldPoint = viewport.toWorld(event.clientX - hostRect.left, event.clientY - hostRect.top);
          const cityHit = Array.from(scene.cityNodes.entries())
            .map(([slug, node]) => ({
              slug,
              distance: Math.hypot(worldPoint.x - node.worldX, worldPoint.y - node.worldY),
              radius: node.radius + 28,
            }))
            .filter((entry) => entry.distance <= entry.radius)
            .sort((a, b) => a.distance - b.distance)[0];

          if (cityHit) {
            callbacksRef.current.onOpenWork(cityHit.slug);
            return;
          }

          const unitHit = Array.from(scene.unitNodes.values())
            .map((node) => ({
              node,
              distance: Math.hypot(worldPoint.x - node.container.x, worldPoint.y - node.container.y),
            }))
            .filter((entry) => entry.distance <= 18)
            .sort((a, b) => a.distance - b.distance)[0];

          if (unitHit) {
            callbacksRef.current.onSelectUnit({
              id: unitHit.node.descriptor.id,
              label: unitHit.node.descriptor.label,
              type: unitHit.node.descriptor.type,
              color: unitHit.node.descriptor.color,
              worldX: unitHit.node.container.x,
              worldY: unitHit.node.container.y,
              angle: 0,
              terrain: terrainAtPointRef.current(unitHit.node.container.x, unitHit.node.container.y),
            }, event.clientX, event.clientY);
            return;
          }

          // Double-tap to zoom: two background taps within 320ms and 28px
          // anchor the zoom under the tap point.
          const now = Date.now();
          const tapClientX = event.clientX;
          const tapClientY = event.clientY;
          if (
            event.pointerType !== "mouse" &&
            now - lastTapAt < 320 &&
            Math.hypot(tapClientX - lastTapX, tapClientY - lastTapY) < 28
          ) {
            const localX = tapClientX - hostRect.left;
            const localY = tapClientY - hostRect.top;
            const previousScale = viewport.scale.x;
            const targetScale = clamp(previousScale * (previousScale >= 1.05 ? 1 / 1.6 : 1.6), 0.38, 1.52);
            const worldAnchor = viewport.toWorld(localX, localY);
            const marginX = Math.min(220, Math.max(96, host.clientWidth * 0.18));
            const marginY = Math.min(180, Math.max(72, host.clientHeight * 0.18));
            const minX = host.clientWidth - staticWorldWidth * targetScale - marginX;
            const maxX = marginX;
            const minY = host.clientHeight - staticWorldHeight * targetScale - marginY;
            const maxY = marginY;
            viewport.scale.set(targetScale);
            viewport.x = clamp(localX - worldAnchor.x * targetScale, Math.min(minX, maxX), Math.max(minX, maxX));
            viewport.y = clamp(localY - worldAnchor.y * targetScale, Math.min(minY, maxY), Math.max(minY, maxY));
            movedHandler?.();
            lastTapAt = 0;
            return;
          }
          lastTapAt = now;
          lastTapX = tapClientX;
          lastTapY = tapClientY;

          callbacksRef.current.onBackgroundClick();
        };
        pointerCancelHandler = (event) => {
          dragPointer = null;
          pressStart = null;
          callbacksRef.current.onDragStateChange(false);
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            dragging: false,
          };
          try {
            host.releasePointerCapture(event.pointerId);
          } catch {}
        };
        mouseDownHandler = (event) => {
          if (event.button !== 0 || shouldIgnoreDragTarget(event.target)) {
            return;
          }
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            down: pointerDebugRef.current.down + 1,
          };
          pressStart = { x: event.clientX, y: event.clientY };
          mouseDrag = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            startViewportX: viewport.x,
            startViewportY: viewport.y,
            dragging: false,
          };
          callbacksRef.current.onStopIntro();
          callbacksRef.current.onClearSelectedUnit();
        };
        mouseMoveHandler = (event) => {
          if (!mouseDrag) {
            return;
          }
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            move: pointerDebugRef.current.move + 1,
          };
          const dx = event.clientX - mouseDrag.startClientX;
          const dy = event.clientY - mouseDrag.startClientY;
          if (!mouseDrag.dragging && Math.hypot(dx, dy) < 6) {
            return;
          }
          if (!mouseDrag.dragging) {
            mouseDrag.dragging = true;
            callbacksRef.current.onDragStateChange(true);
            pointerDebugRef.current = {
              ...pointerDebugRef.current,
              dragging: true,
            };
          }
          applyDragPosition(mouseDrag.startViewportX, mouseDrag.startViewportY, dx, dy);
        };
        mouseUpHandler = (event) => {
          if (!mouseDrag && !pressStart) {
            return;
          }
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            up: pointerDebugRef.current.up + 1,
            dragging: false,
          };
          const dragState = mouseDrag;
          mouseDrag = null;
          callbacksRef.current.onDragStateChange(false);

          const hostRect = host.getBoundingClientRect();
          const start = pressStart;
          pressStart = null;
          if (!start || dragState?.dragging) {
            return;
          }

          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.hypot(dx, dy) > 8) {
            return;
          }

          const worldPoint = viewport.toWorld(event.clientX - hostRect.left, event.clientY - hostRect.top);
          const cityHit = Array.from(scene.cityNodes.entries())
            .map(([slug, node]) => ({
              slug,
              distance: Math.hypot(worldPoint.x - node.worldX, worldPoint.y - node.worldY),
              radius: node.radius + 28,
            }))
            .filter((entry) => entry.distance <= entry.radius)
            .sort((a, b) => a.distance - b.distance)[0];

          if (cityHit) {
            callbacksRef.current.onOpenWork(cityHit.slug);
            return;
          }

          const unitHit = Array.from(scene.unitNodes.values())
            .map((node) => ({
              node,
              distance: Math.hypot(worldPoint.x - node.container.x, worldPoint.y - node.container.y),
            }))
            .filter((entry) => entry.distance <= 18)
            .sort((a, b) => a.distance - b.distance)[0];

          if (unitHit) {
            callbacksRef.current.onSelectUnit({
              id: unitHit.node.descriptor.id,
              label: unitHit.node.descriptor.label,
              type: unitHit.node.descriptor.type,
              color: unitHit.node.descriptor.color,
              worldX: unitHit.node.container.x,
              worldY: unitHit.node.container.y,
              angle: 0,
              terrain: terrainAtPointRef.current(unitHit.node.container.x, unitHit.node.container.y),
            }, event.clientX, event.clientY);
            return;
          }

          callbacksRef.current.onBackgroundClick();
        };
        wheelHandler = () => {
          callbacksRef.current.onStopIntro();
        };

        viewport.on("moved", movedHandler);
        host.addEventListener("pointerdown", pointerDownHandler, { passive: true });
        host.addEventListener("pointermove", pointerMoveHandler, { passive: true });
        host.addEventListener("pointerup", pointerUpHandler, { passive: true });
        host.addEventListener("pointercancel", pointerCancelHandler, { passive: true });
        host.addEventListener("mousedown", mouseDownHandler, { passive: true });
        window.addEventListener("mousemove", mouseMoveHandler, { passive: true });
        window.addEventListener("mouseup", mouseUpHandler, { passive: true });
        app.canvas.addEventListener("wheel", wheelHandler, { passive: true });

        app.ticker.add((ticker) => {
          renderClockRef.current += ticker.deltaMS;
          if (introActiveRef.current) {
            return;
          }

          const activeScene = sceneRef.current;
          const activeState = currentStateRef.current;
          if (!activeScene || activeState.cities.length === 0) {
            return;
          }

          activeScene.unitNodes.forEach((node) => {
            if (node.routeCities.length < 2) {
              return;
            }

            const position = getRoutePoint(node.routeCities, node.descriptor.speed, renderClockRef.current);
            const locked = selectedUnitLockRef.current?.id === node.descriptor.id ? selectedUnitLockRef.current : null;
            const worldX = locked ? locked.x : position.x;
            const worldY = locked ? locked.y : position.y;
            const angle = position.angle;
            node.container.position.set(worldX, worldY);
            node.container.alpha = getUnitVisibilityAlpha(
              worldX,
              worldY,
              node.routeCities,
              selectedUnitIdRef.current === node.descriptor.id,
            );

            const facingLeft = Math.abs(angle) > Math.PI / 2;
            const uprightAngle = facingLeft ? (angle > 0 ? angle - Math.PI : angle + Math.PI) : angle;
            node.container.scale.set(facingLeft ? -1 : 1, 1);
            node.container.rotation = clamp(uprightAngle, -0.66, 0.66);
          });
        });
      } catch (error) {
        console.error("Failed to initialize Pixi world map", error);
      }
    }

    void init();

    return () => {
      cancelled = true;
      callbacksRef.current.onDragStateChange(false);
      const viewport = viewportRef.current;
      const app = appRef.current;

      if (viewport && movedHandler) {
        viewport.off("moved", movedHandler);
      }
      if (cleanupHost && pointerDownHandler) {
        cleanupHost.removeEventListener("pointerdown", pointerDownHandler);
      }
      if (cleanupHost && pointerMoveHandler) {
        cleanupHost.removeEventListener("pointermove", pointerMoveHandler);
      }
      if (cleanupHost && pointerUpHandler) {
        cleanupHost.removeEventListener("pointerup", pointerUpHandler);
      }
      if (cleanupHost && pointerCancelHandler) {
        cleanupHost.removeEventListener("pointercancel", pointerCancelHandler);
      }
      if (cleanupHost && mouseDownHandler) {
        cleanupHost.removeEventListener("mousedown", mouseDownHandler);
      }
      if (mouseMoveHandler) {
        window.removeEventListener("mousemove", mouseMoveHandler);
      }
      if (mouseUpHandler) {
        window.removeEventListener("mouseup", mouseUpHandler);
      }
      if (app?.canvas && wheelHandler) {
        app.canvas.removeEventListener("wheel", wheelHandler);
      }

      sceneRef.current = null;
      viewportRef.current = null;
      appRef.current = null;

      try {
        if (viewport && app?.stage) {
          app.stage.removeChild(viewport);
        }
      } catch {}

      try {
        viewport?.destroy({ children: true });
      } catch {}

      try {
        if (
          cleanupHost &&
          app?.canvas instanceof HTMLCanvasElement &&
          app.canvas.parentElement === cleanupHost
        ) {
          cleanupHost.removeChild(app.canvas);
        }
      } catch {}

      try {
        app?.destroy({ removeView: false }, { children: false });
      } catch {}
    };
  }, [staticWorldHeight, staticWorldHexes, staticWorldWidth]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const scene = sceneRef.current;
    if (!viewport || !scene) {
      return;
    }

    const dx = Math.abs(viewport.x - camera.x);
    const dy = Math.abs(viewport.y - camera.y);
    const dz = Math.abs(viewport.scale.x - camera.zoom);
    if (dx < 0.4 && dy < 0.4 && dz < 0.001) {
      return;
    }

    syncingCameraRef.current = true;
    viewport.position.set(camera.x, camera.y);
    viewport.scale.set(camera.zoom);
    updateVisibility(scene, viewport, selectedSlug, hoveredCity);
    queueMicrotask(() => {
      syncingCameraRef.current = false;
    });
  }, [camera.x, camera.y, camera.zoom, hoveredCity, selectedSlug]);

  useEffect(() => {
    const scene = sceneRef.current;
    const viewport = viewportRef.current;
    if (!scene || !viewport) {
      return;
    }

    scene.routeLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    scene.improvementLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    scene.greatWorkLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    scene.cityLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    scene.greatWorkLabelLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    scene.unitLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    scene.cityNodes.clear();
    scene.greatWorkNodes.clear();
    scene.unitNodes.clear();

    getDisplayedRoutes(currentState.routes, visibleCities).forEach((route) => {
      const style = routeStyle[route.type];
      addSimplePath(scene.routeLayer, route.path, 0x080403, style.shadowWidth, style.shadowAlpha);
      addSimplePath(scene.routeLayer, route.path, style.color, style.width, style.alpha);
    });

    visibleCities.forEach((city) => {
      const work = workBySlug.get(city.slug);

      if (work) {
        const improvementLabels = Array.from(
          new Set(
            [
              ...work.techTree.slice(0, 2),
              ...(city.slug === "robot-future" || city.slug === "ibm-ai-machine-learning-engineer" ? ["Agentic AI"] : []),
            ].filter(Boolean),
          ),
        ).slice(0, 3);

        improvementLabels.forEach((label, index) => {
          const offset = improvementOffsets[index % improvementOffsets.length];
          const improvement = drawImprovement(label, city.bannerTone);
          improvement.position.set(city.x + offset.x, city.y + offset.y);
          improvement.alpha = 0.88;
          improvement.eventMode = "none";
          scene.improvementLayer.addChild(improvement);
        });
      }

      city.greatWorks
        .filter((item) => !item.unlockYear || item.unlockYear <= selectedYear)
        .forEach((item) => {
          const key = `${city.slug}:${item.title}`;
          const root = new Container();
          root.position.set(city.x + item.xOffset, city.y + item.yOffset);
          root.eventMode = "static";
          root.cursor = "help";
          root.zIndex = 12;

          const monument = new Graphics();
          drawGreatWorkMonument(monument, city, item.title, hoveredGreatWorkRef.current === key);
          monument.position.set(26, 48);
          root.addChild(monument);

          const label = new Container();
          const background = new Graphics();
          label.addChild(background);
          const titleText = new Text({
            text: item.title,
            style: {
              fill: 0xf7e8c7,
              fontSize: 12,
              letterSpacing: 0.9,
            },
          });
          titleText.x = 28;
          titleText.y = 12;
          label.addChild(titleText);
          const width = Math.max(128, titleText.width + 40);
          background
            .roundRect(0, 0, width, 42, 15)
            .fill({ color: 0x1a120c, alpha: 0.82 })
            .stroke({ width: 1, color: toPixiColor(city.bannerTone), alpha: 0.86 });
          const dot = new Graphics();
          dot.circle(16, 21, 4.5).fill({ color: toPixiColor(city.bannerTone), alpha: 0.82 });
          label.addChild(dot);
          label.position.set(root.x, root.y);
          label.zIndex = 80;
          label.visible = hoveredGreatWorkRef.current === key;
          label.eventMode = "none";

          root.alpha = hoveredGreatWorkRef.current === key ? 1 : selectedSlugRef.current && selectedSlugRef.current !== city.slug ? 0.5 : 0.82;
          root.on("pointerenter", () => callbacksRef.current.onSetHoveredGreatWork(key));
          root.on("pointerleave", () => callbacksRef.current.onSetHoveredGreatWork(null));

          scene.greatWorkLayer.addChild(root);
          scene.greatWorkLabelLayer.addChild(label);
          scene.greatWorkNodes.set(key, {
            root,
            monument,
            label,
            title: item.title,
            citySlug: city.slug,
            worldX: root.x,
            worldY: root.y,
          });
        });

      const root = new Container();
      root.position.set(city.x, city.y);
      root.zIndex = 20 + city.radius;

      const hitArea = new Graphics();
      hitArea.circle(0, 0, city.radius + 26).fill({ color: 0xffffff, alpha: 0.001 });
      hitArea.eventMode = "static";
      hitArea.cursor = "pointer";
      hitArea.hitArea = new Circle(0, 0, city.radius + 28);
      hitArea.on("pointertap", (event) => {
        event.stopPropagation();
        callbacksRef.current.onOpenWork(city.slug);
      });
      hitArea.on("pointerenter", () => callbacksRef.current.onSetHoveredCity(city.slug));
      hitArea.on("pointerleave", () => callbacksRef.current.onSetHoveredCity(null));
      root.addChild(hitArea);

      const halo = new Graphics();
      drawCityGlyph(
        halo,
        city,
        selectedSlugRef.current === city.slug ||
          introFocusSlugRef.current === city.slug ||
          hoveredCityRef.current === city.slug,
      );
      root.addChild(halo);

      const { label, background, titleText } = createBanner(city.title, city.bannerTone);
      label.position.set(0, cityBannerOffsetY[city.slug] ?? -(city.radius + 30));
      root.addChild(label);

      scene.cityLayer.addChild(root);
      scene.cityNodes.set(city.slug, {
        hitArea,
        halo,
        label,
        labelBackground: background,
        labelText: titleText,
        radius: city.radius,
        worldX: city.x,
        worldY: city.y,
      });
    });

    if (!introActive) {
      toolUnits.forEach((unit) => {
        const routeCities = unit.route
          .map((slug) => currentState.cities.find((city) => city.slug === slug))
          .filter((city): city is RenderCity => Boolean(city))
          .map((city) => ({ x: city.x, y: city.y }));

        if (routeCities.length < 2) {
          return;
        }

        const { container, ring } = createUnitSprite(unit);
        container.zIndex = 40;
        container.eventMode = "static";
        container.cursor = "pointer";
        container.on("pointertap", (event) => {
          event.stopPropagation();
          const position = getRoutePoint(routeCities, unit.speed, renderClockRef.current);
          callbacksRef.current.onStopIntro();
          if (selectedUnitIdRef.current === unit.id) {
            callbacksRef.current.onClearSelectedUnit(unit.id);
            return;
          }
          callbacksRef.current.onSelectUnit(
            {
              id: unit.id,
              label: unit.label,
              type: unit.type,
              color: unit.color,
              worldX: position.x,
              worldY: position.y,
              angle: position.angle,
              terrain: terrainAtPoint(position.x, position.y),
            },
            event.clientX,
            event.clientY,
          );
        });
        scene.unitLayer.addChild(container);
        scene.unitNodes.set(unit.id, {
          container,
          ring,
          routeCities,
          descriptor: unit,
        });
      });
    }

    updateVisibility(scene, viewport, selectedSlugRef.current, hoveredCityRef.current);
  }, [
    currentState,
    introActive,
    sceneVersion,
    selectedYear,
    terrainAtPoint,
    toolUnits,
    visibleCities,
    workBySlug,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    const viewport = viewportRef.current;
    if (!scene || !viewport) {
      return;
    }

    const visibleCityMap = new Map(visibleCities.map((city) => [city.slug, city]));

    scene.cityNodes.forEach((node, slug) => {
      const city = visibleCityMap.get(slug);
      if (!city) {
        return;
      }

      const active = slug === selectedSlug || slug === introFocusSlug || slug === hoveredCity;
      drawCityGlyph(node.halo, city, active);
      node.label.alpha = slug === selectedSlug || slug === introFocusSlug ? 1 : active ? 0.96 : 0.9;
    });

    scene.greatWorkNodes.forEach((node, key) => {
      const city = visibleCityMap.get(node.citySlug);
      if (!city) {
        return;
      }

      const active = key === hoveredGreatWork;
      drawGreatWorkMonument(node.monument, city, node.title, active);
      node.root.alpha = active ? 1 : selectedSlug && selectedSlug !== node.citySlug ? 0.5 : 0.82;
      node.label.visible = active;
      node.label.alpha = active ? 1 : 0;
    });

    scene.unitNodes.forEach((node, id) => {
      const active = id === selectedUnitId;
      node.container.alpha = getUnitVisibilityAlpha(node.container.x, node.container.y, node.routeCities, active);
      node.ring.clear();
      node.ring.circle(0, 0, 18).stroke({ width: 1.8, color: toPixiColor(node.descriptor.color), alpha: active ? 0.74 : 0 });
    });

    updateVisibility(scene, viewport, selectedSlug, hoveredCity);
  }, [hoveredCity, hoveredGreatWork, introFocusSlug, selectedSlug, selectedUnitId, visibleCities]);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full" role="img" aria-label="CivFolio world map" />;
}
