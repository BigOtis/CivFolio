"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Assets, Circle, Container, Graphics, Sprite, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";

import { CAMERA_ZOOM_LIMITS, getCameraBounds } from "@/components/world/world-camera";
import { clamp, getImprovementKind, getRoutePoint } from "@/components/world/world-explorer-support";
import type { CityLevel, RenderCity, WorldRenderModel, WorldRoute, WorldState } from "@/lib/content/derive";
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

const cityArtworkFileBySlug = {
  "ibm-support-engineer": "ibmsupport",
  "busters-td": "busterstd",
  "ibm-ai-machine-learning-engineer": "ibmai",
  "robot-future": "robotfuture",
  localtalker: "localtalker",
  popcurrent: "popcurrent",
  "character-chat": "characterchat",
  polylogue: "polylogue",
  otisfuse: "otisfuse",
  civfolio: "projectempire",
  slopswapper: "slopswap",
  "resume-ai": "resumeai",
  "robot-stack": "robotstack",
};

const cityArtworkVisibleTopByFileSlug: Record<string, number> = {
  busterstd: 0.1484,
  characterchat: 0.0391,
  ibmai: 0.0195,
  ibmsupport: 0.1758,
  localtalker: 0.0352,
  otisfuse: 0.0273,
  polylogue: 0.0273,
  popcurrent: 0.0938,
  projectempire: 0.0508,
  resumeai: 0.035,
  robotfuture: 0.0234,
  robotstack: 0.035,
  slopswap: 0.0352,
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

type WorldPoint = { x: number; y: number };

type TileWirePacket = {
  graphic: Graphics;
  from: WorldPoint;
  to: WorldPoint;
  control: WorldPoint;
  startMs: number;
  durationMs: number;
  seed: number;
  color: number;
  width: number;
};

type CityAnimationNode = {
  root: Container;
  signal: Graphics;
  shimmer: Graphics;
  spark: Graphics;
  sparkles: Array<{
    graphic: Graphics;
    x: number;
    y: number;
    phase: number;
    size: number;
  }>;
  seed: number;
  accent: number;
};

type CityNode = {
  city: RenderCity;
  hitArea: Graphics;
  halo: Graphics;
  groundLight: Graphics;
  shadow: Sprite;
  artwork: Sprite;
  animation: CityAnimationNode;
  label: Container;
  labelBackground: Graphics;
  labelText: Text;
  labelWidth: number;
  active: boolean;
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
  terrainBorderGlow: Graphics;
  tileWireLayer: Container;
  tileWirePackets: TileWirePacket[];
  tileWireAnchors: WorldPoint[];
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
        tileWirePacketCount: number;
        tileWireAnchorCount: number;
        unitCount: number;
        sceneVersion: number;
        camera: { x: number; y: number; zoom: number } | null;
        pointer: { down: number; move: number; up: number; dragging: boolean };
        cities: Array<{ slug: string; x: number; y: number; radius: number }>;
        greatWorks: Array<{ key: string; citySlug: string; alpha: number }>;
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

function parsePolygonVertices(points: string) {
  const values = parsePolygonPoints(points);
  const vertices: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < values.length; index += 2) {
    vertices.push({ x: values[index], y: values[index + 1] });
  }
  return vertices;
}

function drawTerrainHex(
  graphic: Graphics,
  hex: WorldRenderModel["hexes"][number],
  fillColor: number,
  rimColor: number,
  shadeColor: number,
  tileSeed: number,
) {
  const vertices = parsePolygonVertices(hex.points);
  const points = vertices.flatMap((point) => [point.x, point.y]);
  const top = vertices.slice().sort((a, b) => a.y - b.y).slice(0, 3);
  const bottom = vertices.slice().sort((a, b) => b.y - a.y).slice(0, 3);
  const left = vertices.reduce((closest, point) => (point.x < closest.x ? point : closest), vertices[0]);
  const right = vertices.reduce((closest, point) => (point.x > closest.x ? point : closest), vertices[0]);
  const gold = mixColor(0xf3d08a, rimColor, 0.18);

  graphic
    .poly(points, true)
    .fill({ color: fillColor, alpha: hex.terrain === "coast" ? 0.9 : 0.96 })
    .stroke({
      width: 1.65,
      color: rimColor,
      alpha: 0.2,
    });

  graphic.poly([top[0].x, top[0].y, top[1].x, top[1].y, hex.x, hex.y, top[2].x, top[2].y], true).fill({
    color: mixColor(0xf7e3b5, fillColor, 0.58),
    alpha: hex.terrain === "coast" ? 0.07 : 0.09 + tileSeed * 0.035,
  });
  graphic.poly([bottom[0].x, bottom[0].y, bottom[1].x, bottom[1].y, hex.x, hex.y, bottom[2].x, bottom[2].y], true).fill({
    color: shadeColor,
    alpha: hex.terrain === "coast" ? 0.12 : 0.15,
  });
  graphic.poly([left.x, left.y, hex.x, hex.y, bottom[2].x, bottom[2].y], true).fill({ color: 0x06090a, alpha: 0.08 });
  graphic.poly([right.x, right.y, top[2].x, top[2].y, hex.x, hex.y], true).fill({ color: 0xe8c47a, alpha: 0.035 + tileSeed * 0.02 });

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const midY = (current.y + next.y) / 2;
    const midX = (current.x + next.x) / 2;
    const upperEdge = midY < hex.y + 8;
    const facingLight = midX < hex.x + 16;
    if (upperEdge || facingLight) {
      graphic.moveTo(current.x, current.y).lineTo(next.x, next.y).stroke({
        width: upperEdge ? 1.45 : 0.95,
        color: gold,
        alpha: upperEdge ? 0.34 : 0.18,
        cap: "round",
      });
    }
  }

  graphic
    .circle(hex.x - 11, hex.y - 14, 14)
    .fill({ color: 0xf4ead2, alpha: hex.terrain === "coast" ? 0.052 : 0.034 + tileSeed * 0.014 });
}

function drawElectricBorderGlow(graphic: Graphics, hexes: WorldRenderModel["hexes"], elapsedMs: number) {
  graphic.clear();

  const time = elapsedMs * 0.00006;
  hexes.forEach((hex) => {
    const vertices = parsePolygonVertices(hex.points);

    vertices.forEach((current, edgeIndex) => {
      const next = vertices[(edgeIndex + 1) % vertices.length];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      const wave = (midX * 0.0065 + midY * 0.004 - time + edgeIndex * 0.08) % 1;
      const normalized = wave < 0 ? wave + 1 : wave;
      const distanceFromFront = Math.min(normalized, 1 - normalized);

      if (distanceFromFront > 0.055) {
        return;
      }

      const edgeLength = Math.hypot(next.x - current.x, next.y - current.y);
      const edgeUnitX = edgeLength === 0 ? 0 : (next.x - current.x) / edgeLength;
      const edgeUnitY = edgeLength === 0 ? 0 : (next.y - current.y) / edgeLength;
      const segmentLength = edgeLength * 0.54;
      const pulse = 1 - distanceFromFront / 0.055;
      const startX = midX - edgeUnitX * segmentLength * 0.5;
      const startY = midY - edgeUnitY * segmentLength * 0.5;
      const endX = midX + edgeUnitX * segmentLength * 0.5;
      const endY = midY + edgeUnitY * segmentLength * 0.5;

      graphic.moveTo(startX, startY).lineTo(endX, endY).stroke({
        width: 8,
        color: 0xf4c96f,
        alpha: 0.04 + pulse * 0.16,
        cap: "round",
      });
      graphic.moveTo(startX, startY).lineTo(endX, endY).stroke({
        width: 2,
        color: 0xffe6a3,
        alpha: 0.12 + pulse * 0.48,
        cap: "round",
      });
    });
  });
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function getQuadraticPoint(from: WorldPoint, control: WorldPoint, to: WorldPoint, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function buildTileWireAnchors(hexes: WorldRenderModel["hexes"]) {
  const anchors = new Map<string, WorldPoint>();

  hexes.forEach((hex) => {
    parsePolygonVertices(hex.points).forEach((point) => {
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      anchors.set(`${x}:${y}`, { x, y });
    });
  });

  return Array.from(anchors.values());
}

function chooseTileWireDestination(anchors: WorldPoint[], from: WorldPoint, seed: number) {
  let fallback = anchors[Math.floor(seededUnit(seed + 79) * anchors.length)] ?? from;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = anchors[Math.floor(seededUnit(seed + attempt * 17.31) * anchors.length)];
    if (!candidate) {
      continue;
    }

    const distance = Math.hypot(candidate.x - from.x, candidate.y - from.y);
    if (distance > 56 && distance < 260) {
      return candidate;
    }

    if (candidate !== from && Math.hypot(fallback.x - from.x, fallback.y - from.y) < distance) {
      fallback = candidate;
    }
  }

  return fallback;
}

function resetTileWirePacket(packet: TileWirePacket, anchors: WorldPoint[], elapsedMs: number, seed: number) {
  if (anchors.length < 2) {
    packet.graphic.clear();
    packet.startMs = Number.POSITIVE_INFINITY;
    return;
  }

  const from = anchors[Math.floor(seededUnit(seed + 3.7) * anchors.length)] ?? anchors[0];
  const to = chooseTileWireDestination(anchors, from, seed + 19.1);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = (seededUnit(seed + 41.4) - 0.5) * Math.min(92, distance * 0.36);
  const colorRoll = seededUnit(seed + 87.2);

  packet.from = from;
  packet.to = to;
  packet.control = {
    x: midX + (-dy / distance) * bend,
    y: midY + (dx / distance) * bend,
  };
  packet.startMs = elapsedMs + seededUnit(seed + 11.5) * 2200;
  packet.durationMs = 3200 + seededUnit(seed + 23.9) * 2800 + distance * 4.8;
  packet.seed = seed;
  packet.color = colorRoll > 0.72 ? 0x9ad5f6 : colorRoll > 0.44 ? 0xf4c96f : 0xffe6a3;
  packet.width = 1.1 + seededUnit(seed + 61.8) * 1.2;
}

function setupTileWirePackets(scene: SceneRefs, hexes: WorldRenderModel["hexes"], elapsedMs: number) {
  scene.tileWireLayer.removeChildren().forEach((child) => {
    if (child !== scene.terrainBorderGlow) {
      child.destroy({ children: true });
    }
  });
  scene.tileWireLayer.addChild(scene.terrainBorderGlow);
  scene.tileWireAnchors = buildTileWireAnchors(hexes);
  scene.tileWirePackets = [];

  const packetCount = Math.min(18, Math.max(8, Math.floor(scene.tileWireAnchors.length / 24)));
  for (let index = 0; index < packetCount; index += 1) {
    const packet: TileWirePacket = {
      graphic: new Graphics(),
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      control: { x: 0, y: 0 },
      startMs: 0,
      durationMs: 1,
      seed: index + 1,
      color: 0xffe6a3,
      width: 1.4,
    };
    resetTileWirePacket(packet, scene.tileWireAnchors, elapsedMs - index * 260, index * 97.31 + 5);
    scene.tileWirePackets.push(packet);
    scene.tileWireLayer.addChild(packet.graphic);
  }
}

function updateTileWires(scene: SceneRefs, elapsedMs: number) {
  scene.tileWirePackets.forEach((packet, index) => {
    if (elapsedMs > packet.startMs + packet.durationMs) {
      resetTileWirePacket(packet, scene.tileWireAnchors, elapsedMs, packet.seed + 997.13 + index * 31.7);
    }

    const progress = (elapsedMs - packet.startMs) / packet.durationMs;
    packet.graphic.clear();
    if (progress <= 0 || progress >= 1) {
      return;
    }

    const fade = Math.sin(progress * Math.PI);
    const head = clamp(progress, 0, 1);
    const tail = clamp(progress - 0.18, 0, 1);
    const middle = clamp(progress - 0.07, 0, 1);
    const tailPoint = getQuadraticPoint(packet.from, packet.control, packet.to, tail);
    const middlePoint = getQuadraticPoint(packet.from, packet.control, packet.to, middle);
    const headPoint = getQuadraticPoint(packet.from, packet.control, packet.to, head);

    packet.graphic
      .moveTo(tailPoint.x, tailPoint.y)
      .quadraticCurveTo(middlePoint.x, middlePoint.y, headPoint.x, headPoint.y)
      .stroke({ width: packet.width + 4.4, color: packet.color, alpha: 0.05 * fade, cap: "round" });
    packet.graphic
      .moveTo(tailPoint.x, tailPoint.y)
      .quadraticCurveTo(middlePoint.x, middlePoint.y, headPoint.x, headPoint.y)
      .stroke({ width: packet.width, color: packet.color, alpha: 0.2 + fade * 0.58, cap: "round" });
    packet.graphic.circle(headPoint.x, headPoint.y, packet.width + 1.3).fill({ color: 0xfff0ba, alpha: 0.22 + fade * 0.5 });
  });
}

function getCityBannerTitle(title: string) {
  const normalized = title.trim();
  const overrides: Record<string, string> = {
    "IBM AI and Machine Learning Engineer": "IBM AI + ML",
    "IBM Support Engineer": "IBM SUPPORT",
    "Buster's TD": "BUSTER'S TD",
  };
  const override = overrides[normalized];
  if (override) {
    return override;
  }

  const upper = normalized.toUpperCase();
  if (upper.length <= 24) {
    return upper;
  }

  const compact = upper
    .replace(/\bAND\b/g, "+")
    .replace(/\bENGINEER\b/g, "ENG")
    .replace(/\bMACHINE LEARNING\b/g, "ML")
    .replace(/\bSOFTWARE\b/g, "SW")
    .replace(/\s+/g, " ")
    .trim();

  if (compact.length <= 24) {
    return compact;
  }

  return `${compact.slice(0, 21).trim()}...`;
}

function drawRoundedLabel(background: Graphics, width: number, tone: string, active = false) {
  const accent = toPixiColor(tone);

  background
    .clear()
    .roundRect(0, 0, width, 26, 8)
    .fill({ color: 0x0e0a08, alpha: active ? 0.94 : 0.9 })
    .stroke({ width: 1, color: accent, alpha: active ? 0.82 : 0.62 });
  background.moveTo(width / 2 - 6, 25.5).lineTo(width / 2, 32).lineTo(width / 2 + 6, 25.5).fill({ color: 0x0e0a08, alpha: active ? 0.94 : 0.9 });
  background.moveTo(width / 2 - 6, 25.5).lineTo(width / 2, 32).lineTo(width / 2 + 6, 25.5).stroke({ width: 1, color: accent, alpha: active ? 0.82 : 0.62, join: "round" });
}

function createBanner(title: string, tone: string) {
  const label = new Container();
  label.eventMode = "none";

  const background = new Graphics();
  label.addChild(background);

  const titleText = new Text({
    text: getCityBannerTitle(title),
    style: {
      fill: 0xf7e8c7,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
  });
  label.addChild(titleText);

  const width = Math.max(92, Math.min(224, titleText.width + 30));
  titleText.x = Math.round((width - titleText.width) / 2);
  titleText.y = 5;
  drawRoundedLabel(background, width, tone);
  label.pivot.set(width / 2, 31);

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

function drawWindowGlow(graphic: Graphics, x: number, y: number, color: number, active: boolean, scale = 1) {
  graphic.circle(x, y, 3.4 * scale).fill({ color, alpha: active ? 0.28 : 0.18 });
  graphic.roundRect(x - 1.45 * scale, y - 2.4 * scale, 2.9 * scale, 4.8 * scale, 0.8 * scale).fill({ color, alpha: active ? 0.96 : 0.88 });
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

type CityIconTemplate = {
  body: "citadel" | "gate" | "spire" | "dome" | "workshop";
  towers: 0 | 1 | 2 | 3;
  flags: boolean;
};

const cityIconTemplates: Record<CityLevel, [CityIconTemplate, CityIconTemplate]> = {
  settlement: [
    { body: "gate", towers: 0, flags: true },
    { body: "workshop", towers: 1, flags: false },
  ],
  town: [
    { body: "gate", towers: 2, flags: true },
    { body: "dome", towers: 1, flags: false },
  ],
  city: [
    { body: "citadel", towers: 2, flags: true },
    { body: "dome", towers: 2, flags: false },
  ],
  capital: [
    { body: "spire", towers: 3, flags: true },
    { body: "dome", towers: 3, flags: false },
  ],
  wonder: [
    { body: "spire", towers: 3, flags: true },
    { body: "workshop", towers: 3, flags: true },
  ],
};

type CityIconPalette = {
  base: number;
  wall: number;
  wallDark: number;
  light: number;
  roof: number;
  trim: number;
  accent: number;
  discipline: number;
};

const cityDisciplinePalettes: Record<RenderCity["discipline"], Omit<CityIconPalette, "light">> = {
  code: {
    base: 0x342313,
    wall: 0x856237,
    wallDark: 0x241207,
    roof: 0xb67834,
    trim: 0xe7bd64,
    accent: 0xd9963e,
    discipline: 0xc9ab74,
  },
  art: {
    base: 0x321d18,
    wall: 0x9b6451,
    wallDark: 0x25110d,
    roof: 0xc87550,
    trim: 0xefb384,
    accent: 0xd58a6d,
    discipline: 0xb98970,
  },
  music: {
    base: 0x18282a,
    wall: 0x5f8586,
    wallDark: 0x0d1d1f,
    roof: 0x86a9a8,
    trim: 0xb9d4c5,
    accent: 0x8cc9c8,
    discipline: 0x86a2a3,
  },
  video: {
    base: 0x202719,
    wall: 0x78885d,
    wallDark: 0x121a0d,
    roof: 0xb4a85d,
    trim: 0xd7cc83,
    accent: 0xbec873,
    discipline: 0x8f9f80,
  },
  writing: {
    base: 0x2f2815,
    wall: 0x96864c,
    wallDark: 0x211909,
    roof: 0xc6a654,
    trim: 0xf0d284,
    accent: 0xddbd64,
    discipline: 0xb7ad74,
  },
  client: {
    base: 0x311d18,
    wall: 0x8b604f,
    wallDark: 0x21100c,
    roof: 0xb7734d,
    trim: 0xe2aa7c,
    accent: 0xc98662,
    discipline: 0xa97867,
  },
};

function getCityIconTemplate(city: RenderCity) {
  return cityIconTemplates[city.level][hashString(`${city.slug}:event-city-icon`) % 2];
}

function getCityIconPalette(city: RenderCity, active: boolean): CityIconPalette {
  const discipline = cityDisciplinePalettes[city.discipline];
  const banner = toPixiColor(city.bannerTone);
  return {
    base: mixColor(discipline.base, banner, active ? 0.08 : 0.04),
    wall: mixColor(discipline.wall, 0xf4d39a, active ? 0.1 : 0.04),
    wallDark: discipline.wallDark,
    light: active ? 0xffedbd : mixColor(0xf7d99a, discipline.trim, 0.18),
    roof: mixColor(discipline.roof, banner, 0.12),
    trim: active ? mixColor(discipline.trim, 0xffe5a8, 0.34) : discipline.trim,
    accent: mixColor(discipline.accent, banner, 0.22),
    discipline: discipline.discipline,
  };
}

function drawEventCityPlatform(graphic: Graphics, radius: number, palette: CityIconPalette, active: boolean) {
  graphic.ellipse(5, 22, radius + 20, 8).fill({ color: 0x030201, alpha: active ? 0.52 : 0.42 });
  graphic.ellipse(0, 15, radius + 10, 5.5).fill({ color: palette.accent, alpha: active ? 0.14 : 0.08 });
  graphic.roundRect(-(radius + 8), 5, (radius + 8) * 2, 11, 4).fill({ color: palette.base, alpha: 1 }).stroke({ width: 1.35, color: palette.trim, alpha: active ? 0.78 : 0.62 });
  graphic.moveTo(-(radius + 1), 8).lineTo(radius + 1, 8).stroke({ width: 1.1, color: 0xffe8b6, alpha: active ? 0.32 : 0.22, cap: "round" });
}

function drawEventCityTower(
  graphic: Graphics,
  x: number,
  baseY: number,
  height: number,
  palette: CityIconPalette,
  active: boolean,
) {
  const width = 12;
  const top = baseY - height;
  graphic.roundRect(x - width / 2, top, width, height, 2).fill({ color: palette.wall, alpha: 1 }).stroke({ width: 1.25, color: palette.trim, alpha: active ? 0.78 : 0.62 });
  graphic.roundRect(x + 1.2, top + 3, width * 0.34, height - 5, 1.2).fill({ color: palette.wallDark, alpha: 0.32 });
  drawBattlements(graphic, x, top - 3, width + 4, palette.trim, active ? 0.9 : 0.74);
  graphic.poly([x - width / 2 - 2, top - 2, x, top - 13, x + width / 2 + 2, top - 2], true).fill({ color: palette.roof, alpha: 1 }).stroke({ width: 1, color: palette.trim, alpha: 0.58 });
  drawWindowGlow(graphic, x, top + height * 0.58, palette.light, active, 0.72);
}

function drawEventCityBlock(
  graphic: Graphics,
  x: number,
  baseY: number,
  width: number,
  height: number,
  palette: CityIconPalette,
  active: boolean,
) {
  const top = baseY - height;
  graphic.roundRect(x - width / 2, top, width, height, 3).fill({ color: palette.wall, alpha: 1 }).stroke({ width: 1.25, color: palette.trim, alpha: active ? 0.76 : 0.6 });
  graphic.roundRect(x + width * 0.08, top + 3, width * 0.36, height - 5, 1.5).fill({ color: palette.wallDark, alpha: 0.3 });
  graphic.poly([x - width / 2 - 3, top + 2, x, top - 10, x + width / 2 + 3, top + 2], true).fill({ color: palette.roof, alpha: 1 }).stroke({ width: 1, color: palette.trim, alpha: 0.54 });
  [-0.22, 0.22].forEach((offset) => drawWindowGlow(graphic, x + width * offset, top + height * 0.62, palette.light, active, 0.48));
}

function drawEventCityCore(
  graphic: Graphics,
  template: CityIconTemplate,
  city: RenderCity,
  palette: CityIconPalette,
  active: boolean,
) {
  if (template.body === "dome") {
    graphic.poly([-20, -1, -12, -18, 0, -28, 12, -18, 20, -1], true).fill({ color: mixColor(palette.accent, palette.light, 0.38), alpha: 1 }).stroke({ width: 1.35, color: palette.trim, alpha: 0.7 });
    graphic.moveTo(-9, -9).quadraticCurveTo(0, -22, 9, -9).stroke({ width: 1.1, color: 0xffedc4, alpha: 0.3, cap: "round" });
    return;
  }

  if (template.body === "spire") {
    const height = city.level === "wonder" ? 48 : 38;
    graphic.poly([-17, 6, 0, -height, 17, 6], true).fill({ color: mixColor(palette.accent, palette.light, 0.32), alpha: 1 }).stroke({ width: 1.35, color: palette.trim, alpha: 0.76 });
    graphic.poly([-6, 3, 0, -height + 14, 6, 3], true).fill({ color: palette.light, alpha: active ? 0.46 : 0.32 });
    graphic.circle(0, -height + 5, 3.6).fill({ color: palette.light, alpha: 0.96 });
    return;
  }

  if (template.body === "workshop") {
    drawEventCityBlock(graphic, -9, 6, 20, 20, palette, active);
    drawEventCityBlock(graphic, 11, 6, 18, 16, { ...palette, wall: mixColor(palette.discipline, palette.wall, 0.42) }, active);
    graphic.moveTo(12, -13).lineTo(20, -22).lineTo(23, -19).lineTo(16, -13).stroke({ width: 1.4, color: palette.accent, alpha: 0.9, cap: "round", join: "round" });
    return;
  }

  if (template.body === "gate") {
    drawEventCityBlock(graphic, 0, 6, 28, 19, palette, active);
    graphic.roundRect(-5.5, -4, 11, 10, 2).fill({ color: 0x150b07, alpha: 0.96 }).stroke({ width: 0.9, color: palette.trim, alpha: 0.46 });
    return;
  }

  drawEventCityBlock(graphic, -10, 6, 19, 20, palette, active);
  drawEventCityBlock(graphic, 10, 6, 19, 20, { ...palette, wall: mixColor(palette.wall, palette.discipline, 0.18) }, active);
}

function drawCityGlyph(graphic: Graphics, city: RenderCity, active: boolean) {
  const accent = toPixiColor(city.bannerTone);
  const prestige = clamp(city.metrics.prestige / 10, 0, 1);
  const template = getCityIconTemplate(city);
  const ceremonialCrown = prestige > 0.72 || city.level === "capital" || city.level === "wonder";
  const scale = clamp(city.radius / 26, 0.88, 1.32);
  const radius = city.level === "wonder" ? 42 : city.level === "capital" ? 37 : city.level === "city" ? 33 : city.level === "town" ? 28 : 22;
  const palette = getCityIconPalette(city, active);

  graphic.clear();
  graphic.scale.set(scale);

  drawEventCityPlatform(graphic, radius, palette, active);
  const towerHeight = city.level === "wonder" ? 40 : city.level === "capital" ? 35 : city.level === "city" ? 29 : 23;
  if (template.towers >= 2) {
    drawEventCityTower(graphic, -radius * 0.72, 7, towerHeight, palette, active);
    drawEventCityTower(graphic, radius * 0.72, 7, towerHeight, palette, active);
  }
  if (template.towers === 1 || template.towers === 3) {
    drawEventCityTower(graphic, 0, 7, towerHeight + (template.towers === 3 ? 7 : 0), { ...palette, wall: mixColor(palette.wall, palette.light, 0.2) }, active);
  }
  drawEventCityCore(graphic, template, city, palette, active);

  const wallWidth = radius * 1.7;
  graphic.roundRect(-wallWidth / 2, -5, wallWidth, 14, 4).fill({ color: palette.wallDark, alpha: 0.98 }).stroke({ width: 1.35, color: palette.trim, alpha: active ? 0.82 : 0.66 });
  graphic.roundRect(-wallWidth / 2 + 5, -2, wallWidth - 10, 3, 1.5).fill({ color: mixColor(palette.accent, palette.light, 0.24), alpha: active ? 0.34 : 0.22 });
  drawBattlements(graphic, 0, -8, wallWidth - 8, palette.trim, active ? 0.86 : 0.7);
  graphic.roundRect(-5, -1, 10, 10, 2).fill({ color: 0x120905, alpha: 0.96 }).stroke({ width: 0.9, color: palette.trim, alpha: 0.5 });

  if (ceremonialCrown) {
    const crownY = city.level === "wonder" ? -42 : city.level === "capital" ? -35 : -29;
    graphic.poly([0, crownY - 8, 5, crownY + 3, 0, crownY + 8, -5, crownY + 3], true).fill({ color: mixColor(accent, palette.light, 0.34), alpha: 0.96 }).stroke({ width: 0.8, color: palette.light, alpha: 0.42, join: "round" });
  }

  if (template.flags) {
    drawPennant(graphic, -radius * 0.52, -15, accent, -1, active);
    if (city.level !== "settlement") {
      drawPennant(graphic, radius * 0.52, -15, accent, 1, active);
    }
  }

  drawDisciplineSigil(graphic, city, 0, 3.5, accent);
}

void drawCityGlyph;

function redrawCachedCityGlyph(graphic: Graphics, city: RenderCity, active: boolean) {
  void city;
  void active;
  graphic.cacheAsTexture(false);

  graphic.clear();
  graphic.cacheAsTexture({ resolution: Math.max(3, window.devicePixelRatio || 1) });
}

function getCityArtworkWidth(city: RenderCity) {
  void city;
  return 120;
}

function getCityArtworkLabelOffset(city: RenderCity) {
  const fileSlug = getCityArtworkFileSlug(city);
  const visibleTop = cityArtworkVisibleTopByFileSlug[fileSlug] ?? 0.04;
  const artworkHeight = getCityArtworkWidth(city) * (2 / 3);
  const artworkTop = -artworkHeight * 0.62;
  const visibleTopY = artworkTop + visibleTop * artworkHeight;

  return visibleTopY - 8;
}

function getCityArtworkFileSlug(city: RenderCity) {
  return cityArtworkFileBySlug[city.slug as keyof typeof cityArtworkFileBySlug] ?? city.slug;
}

function createCityShadow(city: RenderCity, active: boolean) {
  const path = `/assets/cities/shadows/${getCityArtworkFileSlug(city)}.png`;
  const shadow = Sprite.from(Assets.get(path) ?? path);

  shadow.anchor.set(0.5, 0.62);
  shadow.eventMode = "none";
  setCityShadowState(shadow, city, active);

  return shadow;
}

function drawCityGroundLight(graphic: Graphics, city: RenderCity, active: boolean, phase = 0) {
  const accent = toPixiColor(city.bannerTone);
  const width = getCityArtworkWidth(city);
  const pulse = (Math.sin(phase) + 1) / 2;

  graphic
    .clear()
    .ellipse(5, 14, width * 0.44, width * 0.105)
    .fill({ color: 0x070403, alpha: active ? 0.24 : 0.18 })
    .ellipse(-5, 6, width * 0.32, width * 0.085)
    .fill({ color: 0xf3c978, alpha: (active ? 0.06 : 0.04) + pulse * 0.018 })
    .ellipse(5, 10, width * 0.38, width * 0.075)
    .fill({ color: accent, alpha: (active ? 0.055 : 0.035) + pulse * 0.014 });
}

function createCityGroundLight(city: RenderCity, active: boolean) {
  const graphic = new Graphics();

  graphic.eventMode = "none";
  drawCityGroundLight(graphic, city, active);

  return graphic;
}

function createCityArtwork(city: RenderCity, active: boolean) {
  const path = `/assets/cities/${getCityArtworkFileSlug(city)}.png`;
  const artwork = Sprite.from(Assets.get(path) ?? path);

  artwork.anchor.set(0.5, 0.62);
  artwork.eventMode = "none";
  setCityArtworkState(artwork, city, active);

  return artwork;
}

function setCityArtworkState(artwork: Sprite, city: RenderCity, active: boolean) {
  const width = getCityArtworkWidth(city) * (active ? 1.06 : 1);

  artwork.width = width;
  artwork.height = width * (2 / 3);
  artwork.alpha = active ? 1 : 0.94;
}

function getCityShadowScale(city: RenderCity) {
  const radiusScale = clamp(city.radius / 24, 0.72, 1.45);
  const levelScale =
    city.level === "wonder"
      ? 1.12
      : city.level === "capital"
        ? 1.06
        : city.level === "city"
          ? 1
          : city.level === "town"
            ? 0.92
            : 0.84;

  return radiusScale * levelScale;
}

function setCityShadowState(shadow: Sprite, city: RenderCity, active: boolean) {
  const width = getCityArtworkWidth(city) * getCityShadowScale(city) * (active ? 0.92 : 0.88);

  shadow.width = width;
  shadow.height = width * 0.36;
  shadow.alpha = active ? 0.48 : 0.36;
  shadow.position.set(1, 20 + (1 - getCityShadowScale(city)) * 3);
}

function drawCitySparkle(graphic: Graphics, color: number, size: number) {
  graphic
    .clear()
    .poly([0, -size, size * 0.34, 0, 0, size, -size * 0.34, 0], true)
    .fill({ color, alpha: 0.9 })
    .stroke({ width: 0.7, color: 0xfff3d4, alpha: 0.54, join: "round" })
    .circle(0, 0, size * 1.24)
    .fill({ color, alpha: 0.14 })
    .moveTo(-size * 1.6, 0)
    .lineTo(size * 1.6, 0)
    .moveTo(0, -size * 1.6)
    .lineTo(0, size * 1.6)
    .stroke({ width: 0.75, color: 0xfff3d4, alpha: 0.34, cap: "round" });
}

function drawCityTopLight(graphic: Graphics, color: number, width: number) {
  graphic
    .clear()
    .ellipse(-width * 0.16, -width * 0.16, width * 0.36, width * 0.13)
    .fill({ color: 0xffe0a0, alpha: 0.055 })
    .ellipse(-width * 0.22, -width * 0.24, width * 0.22, width * 0.08)
    .fill({ color, alpha: 0.075 })
    .moveTo(-width * 0.5, -width * 0.04)
    .lineTo(width * 0.12, width * 0.14)
    .stroke({ width: 1.4, color: 0x1a1008, alpha: 0.08, cap: "round" });
}

function createCityAnimation(city: RenderCity, active: boolean): CityAnimationNode {
  const root = new Container();
  root.eventMode = "none";

  const palette = getCityIconPalette(city, active);
  const artworkWidth = getCityArtworkWidth(city);
  const radius = artworkWidth * 0.46;
  const topY = -artworkWidth * 0.25;
  const seed = hashString(`${city.slug}:city-animation`) % 1000;
  const signal = new Graphics();
  drawCityTopLight(signal, palette.light, artworkWidth);
  signal.y = topY * 0.18;
  root.addChild(signal);

  const shimmer = new Graphics();
  shimmer
    .moveTo(-radius * 0.46, -artworkWidth * 0.08)
    .lineTo(-radius * 0.24, -artworkWidth * 0.08)
    .moveTo(radius * 0.18, -artworkWidth * 0.02)
    .lineTo(radius * 0.42, -artworkWidth * 0.02)
    .moveTo(-radius * 0.14, -artworkWidth * 0.17)
    .lineTo(radius * 0.14, -artworkWidth * 0.17)
    .stroke({ width: 1.15, color: palette.light, alpha: 0.3, cap: "round" });
  root.addChild(shimmer);

  const spark = new Graphics();
  drawCitySparkle(spark, palette.accent, 4.2);
  root.addChild(spark);

  const sparklePositions = [
    { x: -radius * 0.48, y: -artworkWidth * 0.18 },
    { x: radius * 0.42, y: -artworkWidth * 0.2 },
    { x: -radius * 0.58, y: artworkWidth * 0.02 },
    { x: radius * 0.56, y: artworkWidth * 0.04 },
    { x: -radius * 0.18, y: -artworkWidth * 0.28 },
    { x: radius * 0.14, y: artworkWidth * 0.14 },
  ];
  const sparkles = sparklePositions.map((position, index) => {
    const graphic = new Graphics();
    const size = 2.4 + ((seed + index * 17) % 18) / 10;
    drawCitySparkle(graphic, index % 2 === 0 ? palette.light : palette.accent, size);
    graphic.position.set(position.x, position.y);
    graphic.alpha = 0;
    root.addChild(graphic);

    return {
      graphic,
      x: position.x,
      y: position.y,
      phase: ((seed % 97) / 97 + index * 0.17) % 1,
      size,
    };
  });

  return {
    root,
    signal,
    shimmer,
    spark,
    sparkles,
    seed,
    accent: palette.accent,
  };
}

function updateCityAnimations(scene: SceneRefs, elapsedMs: number) {
  scene.cityNodes.forEach((node) => {
    const phase = elapsedMs * 0.001 + node.animation.seed * 0.017;
    const slow = (Math.sin(phase * 1.45) + 1) / 2;
    const sparkCycle = (phase * 0.42) % 1;
    const shadowScale = getCityShadowScale(node.city);

    node.shadow.alpha = (node.active ? 0.46 : 0.34) + slow * 0.025;
    node.shadow.position.set(1, 20 + (1 - shadowScale) * 3);
    drawCityGroundLight(node.groundLight, node.city, node.active, phase);
    node.animation.root.alpha = node.active ? 0.86 : 0.58;
    node.animation.signal.alpha = 0.32 + slow * (node.active ? 0.12 : 0.08);
    node.animation.signal.scale.set(0.98 + slow * 0.04);

    node.animation.shimmer.alpha = 0.18 + slow * (node.active ? 0.24 : 0.14);
    node.animation.shimmer.x = Math.sin(phase * 0.7) * 0.8;

    node.animation.spark.alpha = Math.sin(sparkCycle * Math.PI) * (node.active ? 0.62 : 0.36);
    node.animation.spark.x = node.radius * 0.36 + Math.sin(phase) * 2;
    node.animation.spark.y = 2 - sparkCycle * 14;
    node.animation.spark.scale.set(0.72 + sparkCycle * 0.18);

    node.animation.sparkles.forEach((sparkle, index) => {
      const cycle = (phase * (0.18 + index * 0.018) + sparkle.phase) % 1;
      const pulse = Math.sin(cycle * Math.PI);
      const drift = Math.sin(phase * 0.7 + index) * 1.8;
      sparkle.graphic.alpha = Math.max(0, pulse) * (node.active ? 0.92 : 0.58);
      sparkle.graphic.position.set(sparkle.x + drift, sparkle.y - cycle * 8);
      sparkle.graphic.rotation = phase * 0.35 + index * 0.8;
      sparkle.graphic.scale.set(0.45 + pulse * (node.active ? 0.72 : 0.46));
    });
  });
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
  const glow = new Graphics();
  glow.circle(0, 0, 12).fill({ color, alpha: 0.09 });
  glow.circle(0, 0, 7).fill({ color, alpha: 0.12 });
  container.addChild(glow);

  const base = new Graphics();
  base.ellipse(3, 13, 15, 5.8).fill({ color: 0x000000, alpha: 0.3 });
  base.ellipse(0, 10, 9, 3.7).fill({ color, alpha: 0.14 });
  container.addChild(base);

  const accent = new Graphics();
  const body = 0x140f0b;
  const skin = 0xf3d9be;

  if (descriptor.type === "robot") {
    accent.roundRect(-6, -2, 12, 10, 2.6).fill({ color, alpha: 0.86 });
    accent.roundRect(1.4, -1, 3.8, 8, 1.4).fill({ color: 0xffffff, alpha: 0.12 });
    accent.roundRect(-4.4, -12, 8.8, 8, 2.2).fill({ color: body, alpha: 0.92 }).stroke({ width: 1, color, alpha: 1 });
    accent.circle(-1.6, -8, 1.2).fill({ color, alpha: 1 });
    accent.circle(1.6, -8, 1.2).fill({ color, alpha: 1 });
    accent.circle(-1.6, -8, 4.2).fill({ color, alpha: 0.14 });
    accent.circle(1.6, -8, 4.2).fill({ color, alpha: 0.14 });
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
    accent.moveTo(-6, -2).quadraticCurveTo(1, -6, 9, -1).stroke({ width: 1, color: 0xffffff, alpha: 0.16, cap: "round" });
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
    accent.moveTo(-7, 0).quadraticCurveTo(0, -5, 8, 1).stroke({ width: 1, color: 0xffffff, alpha: 0.15, cap: "round" });
    accent.circle(10, -2.5, 2).fill({ color, alpha: 1 });
    accent.moveTo(-8, 10).lineTo(-9, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.moveTo(-2, 10).lineTo(-2, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.moveTo(4, 10).lineTo(5, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.moveTo(9, 9).lineTo(10, 15).stroke({ width: 1.15, color, alpha: 1, cap: "round" });
    accent.roundRect(-3.5, 0.5, 7, 5, 1.2).fill({ color: 0x120c09, alpha: 0.78 }).stroke({ width: 0.8, color, alpha: 1 });
  } else if (descriptor.type === "scout") {
    accent.poly([-9, 6, 0, -10, 9, 6], true).fill({ color, alpha: 0.82 });
    accent.poly([-5, 4, 0, -6, 5, 4], true).fill({ color: 0xffffff, alpha: 0.12 });
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
    accent.circle(0, -3, 9).fill({ color, alpha: 0.1 });
    accent.moveTo(-2, -12).bezierCurveTo(-2, -15, 2, -15, 2, -12).stroke({ width: 1.1, color, alpha: 1, cap: "round" });
    accent.circle(0, -14, 1.9).fill({ color, alpha: 1 });
    accent.moveTo(9, 8).lineTo(9, -4).stroke({ width: 1.2, color, alpha: 1, cap: "round" });
    accent.circle(9, -6.5, 1.8).fill({ color, alpha: 1 });
  } else if (descriptor.type === "archer") {
    accent.circle(0, -9, 2.1).fill({ color, alpha: 1 });
    accent.circle(0, -9, 5.2).fill({ color, alpha: 0.12 });
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
    base.moveTo(-3, -5.8).quadraticCurveTo(0, -8.4, 3, -5.8).stroke({ width: 0.8, color: 0xffffff, alpha: 0.18, cap: "round" });

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

  accent.moveTo(-7, -1).quadraticCurveTo(0, -8, 7, -1).stroke({ width: 0.8, color: 0xffffff, alpha: 0.18, cap: "round" });
  accent.circle(0, 0, 15).stroke({ width: 0.8, color, alpha: 0.26 });
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
  const terrainBorderGlow = new Graphics();
  const tileWireLayer = new Container();
  const routeLayer = new Container();
  const improvementLayer = new Container();
  const greatWorkLayer = new Container();
  const cityLayer = new Container();
  const greatWorkLabelLayer = new Container();
  const unitLayer = new Container();

  terrainLayer.label = "terrain";
  terrainBorderGlow.label = "terrain-border-glow";
  terrainBorderGlow.eventMode = "none";
  tileWireLayer.label = "tile-wires";
  tileWireLayer.eventMode = "none";
  routeLayer.label = "routes";
  improvementLayer.label = "improvements";
  greatWorkLayer.label = "greatWorks";
  cityLayer.label = "cities";
  greatWorkLabelLayer.label = "greatWorkLabels";
  unitLayer.label = "units";
  greatWorkLabelLayer.sortableChildren = true;

  viewport.addChild(terrainLayer, tileWireLayer, routeLayer, improvementLayer, greatWorkLayer, cityLayer, greatWorkLabelLayer, unitLayer);

  return {
    terrainLayer,
    terrainBorderGlow,
    tileWireLayer,
    tileWirePackets: [],
    tileWireAnchors: [],
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

function clampViewportPosition(
  x: number,
  y: number,
  zoom: number,
  viewport: { width: number; height: number },
  world: { width: number; height: number },
) {
  const bounds = getCameraBounds(zoom, viewport, world);
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    y: clamp(y, bounds.minY, bounds.maxY),
  };
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
  const cameraRef = useRef(camera);
  const terrainAtPointRef = useRef(terrainAtPoint);
  const renderClockRef = useRef(0);
  const syncingCameraRef = useRef(false);
  const pointerDebugRef = useRef({ down: 0, move: 0, up: 0, dragging: false });
  const lastMapCityOpenRef = useRef<{ slug: string; at: number } | null>(null);
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
    cameraRef.current = camera;
    terrainAtPointRef.current = terrainAtPoint;
  }, [
    camera,
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

        const next = clampViewportPosition(
          viewport.x + dx,
          viewport.y + dy,
          viewport.scale.x,
          { width: host.clientWidth, height: host.clientHeight },
          { width: staticWorldWidth, height: staticWorldHeight },
        );

        viewport.x = next.x;
        viewport.y = next.y;
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
        const nextZoom = clamp(
          viewport.scale.x * Math.exp(delta),
          CAMERA_ZOOM_LIMITS.min,
          CAMERA_ZOOM_LIMITS.max,
        );
        const nextPosition = clampViewportPosition(
          anchor.x - node.worldX * nextZoom,
          anchor.y - node.worldY * nextZoom,
          nextZoom,
          { width: host.clientWidth, height: host.clientHeight },
          { width: staticWorldWidth, height: staticWorldHeight },
        );

        viewport.scale.set(nextZoom);
        viewport.x = nextPosition.x;
        viewport.y = nextPosition.y;
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
          tileWirePacketCount: sceneRef.current?.tileWirePackets.length ?? 0,
          tileWireAnchorCount: sceneRef.current?.tileWireAnchors.length ?? 0,
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
          greatWorks: sceneRef.current
            ? Array.from(sceneRef.current.greatWorkNodes.entries()).map(([key, node]) => ({
                key,
                citySlug: node.citySlug,
                alpha: node.root.alpha,
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
    let resizeObserver: ResizeObserver | null = null;
    let pressStart: { x: number; y: number } | null = null;
    const activeTouchPointers = new Map<number, { clientX: number; clientY: number }>();
    let pinchGesture:
      | {
          startDistance: number;
          startScale: number;
          centerClientX: number;
          centerClientY: number;
          worldAnchor: { x: number; y: number };
        }
      | null = null;
    let touchGestureWasPinch = false;
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

        await Assets.load(
          Array.from(new Set(Object.values(cityArtworkFileBySlug))).flatMap((fileSlug) => [
            `/assets/cities/${fileSlug}.png`,
            `/assets/cities/shadows/${fileSlug}.png`,
          ]),
        );
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
        viewport.clampZoom({ minScale: CAMERA_ZOOM_LIMITS.min, maxScale: CAMERA_ZOOM_LIMITS.max });
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

          drawTerrainHex(terrainBase, hex, fillColor, rimColor, shadeColor, tileSeed);

          const resourceKind = pickTileResource(hex, tileSeed);
          if (resourceKind) {
            drawTileResource(terrainBase, resourceKind, hex.x, hex.y, rimColor, tileSeed);
          }
        });
        scene.terrainLayer.addChild(terrainBase);
        setupTileWirePackets(scene, staticWorldHexes, renderClockRef.current);

        addSimplePath(scene.terrainLayer, "M 80 610 C 240 540, 320 470, 490 490 C 670 512, 720 640, 910 620 C 1060 603, 1130 530, 1260 450", 0x7abde8, 18, 0.18);
        addSimplePath(scene.terrainLayer, "M 80 610 C 240 540, 320 470, 490 490 C 670 512, 720 640, 910 620 C 1060 603, 1130 530, 1260 450", 0x9ad5f6, 7, 0.42);
        addSimplePath(scene.terrainLayer, "M 260 120 C 340 200, 340 320, 470 380 C 560 420, 610 460, 670 560", 0x9ad5f6, 12, 0.22);
        addSimplePath(scene.terrainLayer, "M 260 120 C 340 200, 340 320, 470 380 C 560 420, 610 460, 670 560", 0x9ad5f6, 5, 0.4);
        scene.terrainLayer.cacheAsTexture({ antialias: true, resolution: 1.5 });

        appRef.current = app;
        viewportRef.current = viewport;
        sceneRef.current = scene;
        const latestCamera = cameraRef.current;
        viewport.position.set(latestCamera.x, latestCamera.y);
        viewport.scale.set(latestCamera.zoom);
        updateVisibility(scene, viewport, selectedSlugRef.current, hoveredCityRef.current);
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
        const syncViewportSize = () => {
          const width = host.clientWidth || staticWorldWidth;
          const height = host.clientHeight || staticWorldHeight;
          if (
            Math.abs(viewport.screenWidth - width) < 1 &&
            Math.abs(viewport.screenHeight - height) < 1
          ) {
            return;
          }

          viewport.resize(width, height, staticWorldWidth, staticWorldHeight);

          const next = clampViewportPosition(
            viewport.x,
            viewport.y,
            viewport.scale.x,
            { width, height },
            { width: staticWorldWidth, height: staticWorldHeight },
          );

          viewport.position.set(next.x, next.y);
          updateVisibility(scene, viewport, selectedSlugRef.current, hoveredCityRef.current);
          callbacksRef.current.onCameraChange(
            {
              zoom: viewport.scale.x,
              x: viewport.x,
              y: viewport.y,
            },
            { fromClamp: introActiveRef.current },
          );
        };
        const shouldIgnoreDragTarget = (target: EventTarget | null) =>
          target instanceof Element &&
          target.closest("button, a, input, textarea, select, label, [role='button']");
        const applyDragPosition = (startViewportX: number, startViewportY: number, dx: number, dy: number) => {
          const next = clampViewportPosition(
            startViewportX + dx,
            startViewportY + dy,
            viewport.scale.x,
            { width: host.clientWidth, height: host.clientHeight },
            { width: staticWorldWidth, height: staticWorldHeight },
          );

          viewport.x = next.x;
          viewport.y = next.y;
          movedHandler?.();
        };
        const getTouchPair = () => {
          const touches = Array.from(activeTouchPointers.values());
          if (touches.length < 2) {
            return null;
          }
          return [touches[0], touches[1]] as const;
        };
        const getPinchDistance = (pair: readonly [{ clientX: number; clientY: number }, { clientX: number; clientY: number }]) =>
          Math.max(1, Math.hypot(pair[0].clientX - pair[1].clientX, pair[0].clientY - pair[1].clientY));
        const getPinchCenter = (pair: readonly [{ clientX: number; clientY: number }, { clientX: number; clientY: number }]) => ({
          clientX: (pair[0].clientX + pair[1].clientX) / 2,
          clientY: (pair[0].clientY + pair[1].clientY) / 2,
        });
        const startPinchGesture = () => {
          const pair = getTouchPair();
          if (!pair) {
            return;
          }

          const hostRect = host.getBoundingClientRect();
          const center = getPinchCenter(pair);
          pinchGesture = {
            startDistance: getPinchDistance(pair),
            startScale: viewport.scale.x,
            centerClientX: center.clientX,
            centerClientY: center.clientY,
            worldAnchor: viewport.toWorld(center.clientX - hostRect.left, center.clientY - hostRect.top),
          };
          touchGestureWasPinch = true;
          dragPointer = null;
          pressStart = null;
          callbacksRef.current.onDragStateChange(false);
          pointerDebugRef.current = {
            ...pointerDebugRef.current,
            dragging: false,
          };
        };
        const applyPinchGesture = () => {
          const pair = getTouchPair();
          if (!pair || !pinchGesture) {
            return;
          }

          const center = getPinchCenter(pair);
          const hostRect = host.getBoundingClientRect();
          const localX = center.clientX - hostRect.left;
          const localY = center.clientY - hostRect.top;
          const scale = clamp(
            pinchGesture.startScale * (getPinchDistance(pair) / pinchGesture.startDistance),
            CAMERA_ZOOM_LIMITS.min,
            CAMERA_ZOOM_LIMITS.max,
          );
          const next = clampViewportPosition(
            localX - pinchGesture.worldAnchor.x * scale,
            localY - pinchGesture.worldAnchor.y * scale,
            scale,
            { width: host.clientWidth, height: host.clientHeight },
            { width: staticWorldWidth, height: staticWorldHeight },
          );

          viewport.scale.set(scale);
          viewport.x = next.x;
          viewport.y = next.y;
          movedHandler?.();
        };
        const openMapCity = (slug: string) => {
          const now = Date.now();
          const lastMapCityOpen = lastMapCityOpenRef.current;
          if (lastMapCityOpen && lastMapCityOpen.slug === slug && now - lastMapCityOpen.at < 300) {
            return;
          }
          lastMapCityOpenRef.current = { slug, at: now };
          callbacksRef.current.onOpenWork(slug);
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
          if (event.pointerType === "touch") {
            activeTouchPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
            if (activeTouchPointers.size >= 2) {
              startPinchGesture();
              callbacksRef.current.onStopIntro();
              callbacksRef.current.onClearSelectedUnit();
              try {
                host.setPointerCapture(event.pointerId);
              } catch {}
              return;
            }
          }
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
          if (event.pointerType === "touch" && activeTouchPointers.has(event.pointerId)) {
            activeTouchPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
            if (pinchGesture && activeTouchPointers.size >= 2) {
              pointerDebugRef.current = {
                ...pointerDebugRef.current,
                move: pointerDebugRef.current.move + 1,
              };
              applyPinchGesture();
              return;
            }
          }
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
          if (event.pointerType === "touch") {
            activeTouchPointers.delete(event.pointerId);
          }
          const pointer = dragPointer;
          dragPointer = null;
          callbacksRef.current.onDragStateChange(false);
          try {
            host.releasePointerCapture(event.pointerId);
          } catch {}

          const hostRect = host.getBoundingClientRect();
          const start = pressStart;
          pressStart = null;
          if (pinchGesture || touchGestureWasPinch) {
            if (activeTouchPointers.size < 2) {
              pinchGesture = null;
            }
            if (activeTouchPointers.size === 0) {
              touchGestureWasPinch = false;
            }
            return;
          }
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
            openMapCity(cityHit.slug);
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
            const targetScale = clamp(
              previousScale * (previousScale >= 1.05 ? 1 / 1.6 : 1.6),
              CAMERA_ZOOM_LIMITS.min,
              CAMERA_ZOOM_LIMITS.max,
            );
            const worldAnchor = viewport.toWorld(localX, localY);
            const next = clampViewportPosition(
              localX - worldAnchor.x * targetScale,
              localY - worldAnchor.y * targetScale,
              targetScale,
              { width: host.clientWidth, height: host.clientHeight },
              { width: staticWorldWidth, height: staticWorldHeight },
            );
            viewport.scale.set(targetScale);
            viewport.x = next.x;
            viewport.y = next.y;
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
          if (event.pointerType === "touch") {
            activeTouchPointers.delete(event.pointerId);
          }
          dragPointer = null;
          pressStart = null;
          pinchGesture = null;
          touchGestureWasPinch = activeTouchPointers.size > 0;
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
            openMapCity(cityHit.slug);
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
        resizeObserver = new ResizeObserver(syncViewportSize);
        resizeObserver.observe(host);

        app.ticker.add((ticker) => {
          renderClockRef.current += ticker.deltaMS;
          const activeScene = sceneRef.current;
          if (activeScene) {
            drawElectricBorderGlow(activeScene.terrainBorderGlow, staticWorldHexes, renderClockRef.current);
            updateTileWires(activeScene, renderClockRef.current);
          }
          if (introActiveRef.current) {
            return;
          }

          const activeState = currentStateRef.current;
          if (!activeScene || activeState.cities.length === 0) {
            return;
          }

          updateCityAnimations(activeScene, renderClockRef.current);

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
      resizeObserver?.disconnect();

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

          root.alpha = hoveredGreatWorkRef.current === key ? 1 : 0.82;
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
        const now = Date.now();
        const lastMapCityOpen = lastMapCityOpenRef.current;
        if (lastMapCityOpen && lastMapCityOpen.slug === city.slug && now - lastMapCityOpen.at < 300) {
          return;
        }
        lastMapCityOpenRef.current = { slug: city.slug, at: now };
        callbacksRef.current.onOpenWork(city.slug);
      });
      hitArea.on("pointerenter", () => callbacksRef.current.onSetHoveredCity(city.slug));
      hitArea.on("pointerleave", () => callbacksRef.current.onSetHoveredCity(null));
      root.addChild(hitArea);

      const halo = new Graphics();
      halo.scale.set(1.06);
      const cityActive =
        selectedSlugRef.current === city.slug ||
        introFocusSlugRef.current === city.slug ||
        hoveredCityRef.current === city.slug;
      redrawCachedCityGlyph(halo, city, cityActive);
      root.addChild(halo);

      const groundLight = createCityGroundLight(city, cityActive);
      root.addChild(groundLight);

      const shadow = createCityShadow(city, cityActive);
      root.addChild(shadow);

      const artwork = createCityArtwork(city, cityActive);
      root.addChild(artwork);

      const animation = createCityAnimation(city, cityActive);
      root.addChild(animation.root);

      const { label, background, titleText, width } = createBanner(city.title, city.bannerTone);
      drawRoundedLabel(background, width, city.bannerTone, cityActive);
      label.position.set(0, getCityArtworkLabelOffset(city));
      root.addChild(label);

      scene.cityLayer.addChild(root);
      scene.cityNodes.set(city.slug, {
        city,
        hitArea,
        halo,
        groundLight,
        shadow,
        artwork,
        animation,
        label,
        labelBackground: background,
        labelText: titleText,
        labelWidth: width,
        active: cityActive,
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
      node.city = city;
      if (node.active !== active) {
        redrawCachedCityGlyph(node.halo, city, active);
        drawCityGroundLight(node.groundLight, city, active);
        setCityShadowState(node.shadow, city, active);
        setCityArtworkState(node.artwork, city, active);
        drawRoundedLabel(node.labelBackground, node.labelWidth, city.bannerTone, active);
        node.labelText.style.fill = active ? 0xfff1cf : 0xf7e8c7;
        node.active = active;
      }
      node.label.alpha = slug === selectedSlug || slug === introFocusSlug ? 1 : active ? 0.98 : 0.92;
    });

    scene.greatWorkNodes.forEach((node, key) => {
      const city = visibleCityMap.get(node.citySlug);
      if (!city) {
        return;
      }

      const active = key === hoveredGreatWork;
      drawGreatWorkMonument(node.monument, city, node.title, active);
      node.root.alpha = active ? 1 : 0.82;
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

  return <div ref={hostRef} className="absolute inset-0 h-full w-full" role="img" aria-label="Project Empire world map" />;
}
