import { describe, expect, it } from "vitest";

import {
  CAMERA_ZOOM_LIMITS,
  clampCameraToViewport,
  getCameraBounds,
  localPointToViewportPoint,
  localPointToWorldPoint,
  viewportPointToLocalPoint,
  worldPointToLocalPoint,
  zoomCameraAtPoint,
} from "../src/components/world/world-camera";

describe("world camera math", () => {
  const viewport = { width: 1400, height: 900 };
  const container = { width: 1750, height: 1000 };
  const world = { width: 1400, height: 900 };

  it("converts local pointer coordinates into viewport coordinates", () => {
    const point = localPointToViewportPoint(875, 500, viewport, container);

    expect(point).toEqual({ x: 700, y: 450 });
    expect(viewportPointToLocalPoint(point.x, point.y, viewport, container)).toEqual({
      x: 875,
      y: 500,
    });
  });

  it("round-trips between world and local coordinates", () => {
    const camera = { zoom: 1.08, x: -148, y: 34 };
    const worldPoint = { x: 612, y: 284 };

    const localPoint = worldPointToLocalPoint(worldPoint, camera, viewport, container);
    const roundTrip = localPointToWorldPoint(localPoint, camera, viewport, container, world);

    expect(roundTrip.x).toBeCloseTo(worldPoint.x, 6);
    expect(roundTrip.y).toBeCloseTo(worldPoint.y, 6);
  });

  it("keeps the hovered world point anchored while zooming", () => {
    const camera = { zoom: 0.84, x: 72, y: 48 };
    const anchorLocal = { x: 1020, y: 420 };
    const anchorViewport = localPointToViewportPoint(anchorLocal.x, anchorLocal.y, viewport, container);
    const anchoredWorldPoint = localPointToWorldPoint(anchorLocal, camera, viewport, container, world);

    const next = clampCameraToViewport(
      zoomCameraAtPoint(camera, 0.19, { x: anchorViewport.x, y: anchorViewport.y }),
      viewport,
      world,
    );

    const nextLocal = worldPointToLocalPoint(
      { x: anchoredWorldPoint.x, y: anchoredWorldPoint.y },
      next,
      viewport,
      container,
    );

    expect(nextLocal.x).toBeCloseTo(anchorLocal.x, 6);
    expect(nextLocal.y).toBeCloseTo(anchorLocal.y, 6);
    expect(next.zoom).toBeGreaterThan(camera.zoom);
  });

  it("allows enough overscroll to center edge cities during camera focus", () => {
    const zoom = 1.06;
    const edgeCity = { x: 1236, y: 356 };
    const desired = {
      zoom,
      x: viewport.width * 0.5 - edgeCity.x * zoom,
      y: viewport.height * 0.58 - edgeCity.y * zoom,
    };

    const clamped = clampCameraToViewport(desired, viewport, world);

    expect(clamped.x).toBeCloseTo(desired.x, 6);
    expect(clamped.y).toBeCloseTo(desired.y, 6);
  });

  it("exposes whitespace beyond the map edge at the zoom floor", () => {
    const bounds = getCameraBounds(CAMERA_ZOOM_LIMITS.min, viewport, world);

    expect(bounds.maxX).toBeGreaterThan(0);
    expect(bounds.maxY).toBeGreaterThan(0);
    expect(bounds.minX).toBeLessThan(viewport.width - world.width * CAMERA_ZOOM_LIMITS.min);
    expect(bounds.minY).toBeLessThan(viewport.height - world.height * CAMERA_ZOOM_LIMITS.min);
  });
});
