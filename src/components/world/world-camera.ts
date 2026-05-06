export type CameraLike = {
  zoom: number;
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const CAMERA_ZOOM_LIMITS = {
  min: 0.28,
  desktopMin: 0.48,
  max: 1.52,
} as const;

export function getCameraOverscrollMargin(viewport: Size) {
  return {
    x: Math.min(640, Math.max(160, viewport.width * 0.42)),
    y: Math.min(520, Math.max(140, viewport.height * 0.38)),
  };
}

export function getCameraBounds(zoom: number, viewport: Size, world: Size) {
  const margin = getCameraOverscrollMargin(viewport);
  const minX = viewport.width - world.width * zoom - margin.x;
  const maxX = margin.x;
  const minY = viewport.height - world.height * zoom - margin.y;
  const maxY = margin.y;

  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
  };
}

export function getViewportScale(viewport: Size, container: Size) {
  return {
    x: container.width > 0 ? viewport.width / container.width : 1,
    y: container.height > 0 ? viewport.height / container.height : 1,
  };
}

export function localPointToViewportPoint(localX: number, localY: number, viewport: Size, container: Size) {
  const scale = getViewportScale(viewport, container);
  return {
    x: localX * scale.x,
    y: localY * scale.y,
  };
}

export function viewportPointToLocalPoint(viewportX: number, viewportY: number, viewport: Size, container: Size) {
  const scale = getViewportScale(viewport, container);
  return {
    x: viewportX / scale.x,
    y: viewportY / scale.y,
  };
}

export function clampCameraToViewport(next: CameraLike, viewport: Size, world: Size) {
  const bounds = getCameraBounds(next.zoom, viewport, world);

  return {
    ...next,
    x: clamp(next.x, bounds.minX, bounds.maxX),
    y: clamp(next.y, bounds.minY, bounds.maxY),
  };
}

export function zoomCameraAtPoint(
  current: CameraLike,
  delta: number,
  anchor: { x: number; y: number },
  limits: { min: number; max: number } = { min: CAMERA_ZOOM_LIMITS.desktopMin, max: CAMERA_ZOOM_LIMITS.max },
) {
  const zoomFactor = Math.exp(delta);
  const nextZoom = clamp(current.zoom * zoomFactor, limits.min, limits.max);
  const worldX = (anchor.x - current.x) / current.zoom;
  const worldY = (anchor.y - current.y) / current.zoom;

  return {
    zoom: nextZoom,
    x: anchor.x - worldX * nextZoom,
    y: anchor.y - worldY * nextZoom,
  };
}

export function worldPointToLocalPoint(
  worldPoint: { x: number; y: number },
  camera: CameraLike,
  viewport: Size,
  container: Size,
) {
  const viewportPoint = {
    x: camera.x + worldPoint.x * camera.zoom,
    y: camera.y + worldPoint.y * camera.zoom,
  };

  return viewportPointToLocalPoint(viewportPoint.x, viewportPoint.y, viewport, container);
}

export function localPointToWorldPoint(
  localPoint: { x: number; y: number },
  camera: CameraLike,
  viewport: Size,
  container: Size,
  world: Size,
) {
  const viewportPoint = localPointToViewportPoint(localPoint.x, localPoint.y, viewport, container);

  return {
    x: clamp((viewportPoint.x - camera.x) / camera.zoom, 0, world.width),
    y: clamp((viewportPoint.y - camera.y) / camera.zoom, 0, world.height),
    viewportX: viewportPoint.x,
    viewportY: viewportPoint.y,
  };
}
