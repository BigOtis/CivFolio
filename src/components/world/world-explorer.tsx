"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { WorkDetail } from "@/components/work/work-detail";
import { WorldMapPixi } from "@/components/world/world-map-pixi";
import {
  clamp,
  getTravelerFlavor,
  OverlayButton,
  StatChip,
  usePresence,
  useRetainedPresence,
  useWorldAudio,
} from "@/components/world/world-explorer-support";
import {
  CAMERA_ZOOM_LIMITS,
  clampCameraToViewport,
  localPointToWorldPoint,
  worldPointToLocalPoint,
  zoomCameraAtPoint,
} from "@/components/world/world-camera";
import type { WorldRenderModel, WorldRoute, WorldState } from "@/lib/content/derive";
import type { GithubCache, LeaderProfile, SiteConfig, Work } from "@/lib/content/schema";
import { cn, formatDisciplineLabel, formatDisplayLabel } from "@/lib/utils";

const disciplineTone = {
  code: "#f2c36f",
  art: "#e6aa72",
  music: "#80cadc",
  video: "#95dab7",
  writing: "#d2c77e",
  client: "#d59750",
} as const;

type CameraState = {
  zoom: number;
  x: number;
  y: number;
};

const initialCamera: CameraState = {
  zoom: 0.82,
  x: 80,
  y: 30,
};

const INTRO_DISMISSED_KEY = "project-empire:intro-dismissed:v1";

function markIntroDismissed() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(INTRO_DISMISSED_KEY, "1");
  } catch {
    // Storage may be disabled; nothing to persist.
  }
}

function clearIntroDismissed() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(INTRO_DISMISSED_KEY);
  } catch {
    // Storage may be disabled; nothing to clear.
  }
}

function getDefaultCamera({
  isMobile,
  viewport,
  world,
}: {
  isMobile: boolean;
  viewport: { width: number; height: number };
  world: { width: number; height: number };
}): CameraState {
  if (!isMobile || viewport.width <= 1 || viewport.height <= 1) {
    return initialCamera;
  }

  // Reserve vertical space for the mobile HUD up top (~64px) and the
  // timeline/sheet handle at the bottom (~140px) so cities are never hidden
  // behind chrome at the default fit. Horizontal margin keeps a small breath
  // along the edges so the map doesn't kiss the viewport border.
  const horizontalMargin = 24;
  const verticalChromeAllowance = 200;
  const usableWidth = Math.max(viewport.width - horizontalMargin, 1);
  const usableHeight = Math.max(viewport.height - verticalChromeAllowance, 1);

  const overviewZoom = clamp(
    Math.min(usableWidth / world.width, usableHeight / world.height),
    0.32,
    0.6,
  );

  return {
    zoom: overviewZoom,
    x: viewport.width * 0.5 - world.width * overviewZoom * 0.5,
    // Bias slightly upward so the map's vertical center sits above the
    // bottom-anchored timeline rather than getting clipped underneath it.
    y: (viewport.height - verticalChromeAllowance * 0.45) * 0.5 - world.height * overviewZoom * 0.5,
  };
}

// Mobile bottom-sheet height ratios as fraction of available container height.
// peek leaves room to glance at the map; half is the comfortable read state;
// full consumes the screen for deep reading.
const MOBILE_SHEET_HEIGHT_RATIOS = {
  peek: 0.22,
  half: 0.52,
  full: 0.86,
} as const;

type SheetState = "peek" | "half" | "full";
const SHEET_STATE_ORDER: readonly SheetState[] = ["peek", "half", "full"];

function getMobileSheetHeightRatio(state: SheetState) {
  return MOBILE_SHEET_HEIGHT_RATIOS[state];
}

function MobileSheetHandle({
  state,
  onChange,
  onDismiss,
}: {
  state: SheetState;
  onChange: (next: SheetState) => void;
  onDismiss: () => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startState: SheetState;
    moved: boolean;
  } | null>(null);

  const stepInDirection = useCallback(
    (delta: number, current: SheetState) => {
      const index = SHEET_STATE_ORDER.indexOf(current);
      const next = SHEET_STATE_ORDER[clamp(index + delta, 0, SHEET_STATE_ORDER.length - 1)];
      return next ?? current;
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startState: state,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) > 6) {
      drag.moved = true;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dy = event.clientY - drag.startY;

    if (!drag.moved || Math.abs(dy) < 28) {
      // Treat as a tap: cycle to the next larger state, or dismiss from peek.
      if (drag.startState === "peek") {
        onChange("half");
      } else if (drag.startState === "half") {
        onChange("full");
      } else {
        onChange("half");
      }
      return;
    }

    // Drag down -> step toward peek (and dismiss past peek). Drag up -> step
    // toward full.
    if (dy > 0) {
      const next = stepInDirection(-1, drag.startState);
      if (next === drag.startState && drag.startState === "peek" && dy > 80) {
        onDismiss();
        return;
      }
      onChange(next);
    } else {
      onChange(stepInDirection(1, drag.startState));
    }
  };

  return (
    <div
      role="slider"
      aria-label="City dossier sheet position"
      aria-valuetext={state}
      data-testid="city-popup-handle"
      data-sheet-state={state}
      className="flex w-full cursor-grab touch-none items-center justify-center pt-2 pb-1.5 active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <div className="h-1.5 w-12 rounded-full bg-white/30" />
    </div>
  );
}

type WorldEventKind =
  | "storm"
  | "battle"
  | "greatLeader"
  | "invention"
  | "festival"
  | "trade"
  | "discovery"
  | "sabotage";

type WorldEvent = {
  id: string;
  kind: WorldEventKind;
  citySlug: string;
  cityTitle: string;
  targetCitySlug?: string;
  targetCityTitle?: string;
  title: string;
  detail: string;
  accent: string;
  badge: string;
  markerLabel: string;
};

type ActiveWorldEvent = WorldEvent & {
  expiresAt: number;
};

const worldEventTheme: Record<
  WorldEventKind,
  { accent: string; badge: string; markerLabel: string }
> = {
  storm: { accent: "#86a2a3", badge: "Weather", markerLabel: "Storm Front" },
  battle: { accent: "#d59750", badge: "Conflict", markerLabel: "Battle" },
  greatLeader: { accent: "#f4d38d", badge: "Leader", markerLabel: "Great Leader" },
  invention: { accent: "#95dab7", badge: "Breakthrough", markerLabel: "Invention" },
  festival: { accent: "#e6aa72", badge: "Culture", markerLabel: "Festival" },
  trade: { accent: "#d2c77e", badge: "Trade", markerLabel: "Caravan" },
  discovery: { accent: "#80cadc", badge: "Discovery", markerLabel: "Expedition" },
  sabotage: { accent: "#c77b66", badge: "Intrigue", markerLabel: "Sabotage" },
};

function chooseRandomItem<T>(items: T[]) {
  if (items.length === 0) {
    return null;
  }

  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function chooseRandomWithFallback<T>(preferredItems: T[], fallbackItems: T[]) {
  return chooseRandomItem(preferredItems.length > 0 ? preferredItems : fallbackItems);
}

function getWorldEventRouteKey(from?: string, to?: string) {
  if (!from || !to) {
    return null;
  }

  return [from, to].sort().join("::");
}

function buildWorldEvent({
  eventId,
  cities,
  routes,
  forcedKind,
  avoidKinds = [],
  avoidCitySlugs = [],
  avoidRouteKeys = [],
}: {
  eventId: number;
  cities: WorldRenderModel["states"][number]["cities"];
  routes: WorldRenderModel["states"][number]["routes"];
  forcedKind?: WorldEventKind;
  avoidKinds?: WorldEventKind[];
  avoidCitySlugs?: string[];
  avoidRouteKeys?: string[];
}) {
  if (cities.length === 0) {
    return null;
  }

  const cityTitles = new Map(cities.map((city) => [city.slug, city.title]));
  const avoidedCities = new Set(avoidCitySlugs);
  const avoidedRoutes = new Set(avoidRouteKeys);
  const routeMap = new Map<string, string[]>();

  routes.forEach((route) => {
    if (!cityTitles.has(route.from) || !cityTitles.has(route.to)) {
      return;
    }
    routeMap.set(route.from, [...(routeMap.get(route.from) ?? []), route.to]);
    routeMap.set(route.to, [...(routeMap.get(route.to) ?? []), route.from]);
  });

  const routeCities = cities.filter((city) => (routeMap.get(city.slug)?.length ?? 0) > 0);
  const availableKinds: WorldEventKind[] = routeCities.length
    ? ["storm", "battle", "greatLeader", "invention", "festival", "trade", "discovery", "sabotage"]
    : ["storm", "greatLeader", "invention", "festival", "discovery", "sabotage"];
  const kindChoices = availableKinds.filter((entry) => !avoidKinds.includes(entry));
  const kind = forcedKind && availableKinds.includes(forcedKind)
    ? forcedKind
    : chooseRandomWithFallback(kindChoices, availableKinds);
  if (!kind) {
    return null;
  }

  const theme = worldEventTheme[kind];
  const sourceCities = kind === "battle" || kind === "trade" ? routeCities : cities;
  const preferredSourceCities = sourceCities.filter((city) => !avoidedCities.has(city.slug));
  const sourceCity = chooseRandomWithFallback(preferredSourceCities, sourceCities);
  if (!sourceCity) {
    return null;
  }

  if (kind === "storm") {
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      title: `Storm Over ${sourceCity.title}`,
      detail: `A sudden front is rolling across ${sourceCity.title}, slowing routes and throwing the frontier into rough weather.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  if (kind === "battle") {
    const targetOptions = routeMap.get(sourceCity.slug) ?? [];
    const preferredTargets = targetOptions.filter((target) => {
      const routeKey = getWorldEventRouteKey(sourceCity.slug, target);
      return !avoidedCities.has(target) && (!routeKey || !avoidedRoutes.has(routeKey));
    });
    const targetSlug = chooseRandomWithFallback(preferredTargets, targetOptions);
    const targetCityTitle = targetSlug ? cityTitles.get(targetSlug) : null;
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      targetCitySlug: targetSlug ?? undefined,
      targetCityTitle: targetCityTitle ?? undefined,
      title: targetCityTitle
        ? `Skirmish Between ${sourceCity.title} and ${targetCityTitle}`
        : `Border Clash Near ${sourceCity.title}`,
      detail: targetCityTitle
        ? `Scouts report a brief clash on the road between ${sourceCity.title} and ${targetCityTitle}.`
        : `Scouts report a brief clash on the roads outside ${sourceCity.title}.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  if (kind === "trade") {
    const targetOptions = routeMap.get(sourceCity.slug) ?? [];
    const preferredTargets = targetOptions.filter((target) => {
      const routeKey = getWorldEventRouteKey(sourceCity.slug, target);
      return !avoidedCities.has(target) && (!routeKey || !avoidedRoutes.has(routeKey));
    });
    const targetSlug = chooseRandomWithFallback(preferredTargets, targetOptions);
    const targetCityTitle = targetSlug ? cityTitles.get(targetSlug) : null;
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      targetCitySlug: targetSlug ?? undefined,
      targetCityTitle: targetCityTitle ?? undefined,
      title: targetCityTitle
        ? `Trade Caravan: ${sourceCity.title} to ${targetCityTitle}`
        : `Trade Caravan Leaves ${sourceCity.title}`,
      detail: targetCityTitle
        ? `A loaded caravan is moving between ${sourceCity.title} and ${targetCityTitle}, carrying materials, ideas, and momentum across the road network.`
        : `A loaded caravan has rolled out of ${sourceCity.title}, carrying materials, ideas, and momentum across the road network.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  if (kind === "greatLeader") {
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      title: `Great Leader Rises in ${sourceCity.title}`,
      detail: `${sourceCity.title} has rallied around a new leader, boosting morale, output, and ambition across the district.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  if (kind === "festival") {
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      title: `Festival in ${sourceCity.title}`,
      detail: `${sourceCity.title} is celebrating a public milestone, turning local progress into morale, attention, and new creative energy.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  if (kind === "discovery") {
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      title: `Discovery Near ${sourceCity.title}`,
      detail: `An expedition outside ${sourceCity.title} has uncovered a promising lead, revealing a new path through the fog of work still ahead.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  if (kind === "sabotage") {
    return {
      id: `world-event-${eventId}`,
      kind,
      citySlug: sourceCity.slug,
      cityTitle: sourceCity.title,
      title: `Sabotage Reported in ${sourceCity.title}`,
      detail: `A fragile system in ${sourceCity.title} has been disrupted, forcing emergency repairs before the local machine can return to full speed.`,
      accent: theme.accent,
      badge: theme.badge,
      markerLabel: theme.markerLabel,
    } satisfies WorldEvent;
  }

  return {
    id: `world-event-${eventId}`,
    kind,
    citySlug: sourceCity.slug,
    cityTitle: sourceCity.title,
    title: `New Invention at ${sourceCity.title}`,
    detail: `Makers in ${sourceCity.title} have unveiled a fresh breakthrough, pushing the local tech tree forward.`,
    accent: theme.accent,
    badge: theme.badge,
    markerLabel: theme.markerLabel,
  } satisfies WorldEvent;
}

function WorldEventEffect({ event }: { event: WorldEvent }) {
  if (event.kind === "storm") {
    return (
      <div className="world-event-effect world-event-effect-storm" data-testid="world-event-effect-storm">
        <span className="storm-cloud storm-cloud-left" />
        <span className="storm-cloud storm-cloud-right" />
        <span className="storm-rain storm-rain-left" />
        <span className="storm-rain storm-rain-right" />
        <span className="storm-lightning" />
      </div>
    );
  }

  if (event.kind === "battle") {
    return (
      <div className="world-event-effect world-event-effect-battle" data-testid="world-event-effect-battle">
        <span className="battle-blast" />
        <span className="battle-sword battle-sword-left" />
        <span className="battle-sword battle-sword-right" />
        <span className="battle-spark battle-spark-top" />
        <span className="battle-spark battle-spark-bottom" />
      </div>
    );
  }

  if (event.kind === "greatLeader") {
    return (
      <div className="world-event-effect world-event-effect-leader" data-testid="world-event-effect-greatLeader">
        <span className="leader-standard" />
        <span className="leader-banner" />
        <span className="leader-crown" />
        <span className="leader-rays" />
      </div>
    );
  }

  if (event.kind === "festival") {
    return (
      <div className="world-event-effect world-event-effect-festival" data-testid="world-event-effect-festival">
        <span className="festival-lantern festival-lantern-left" />
        <span className="festival-lantern festival-lantern-right" />
        <span className="festival-burst festival-burst-top" />
        <span className="festival-burst festival-burst-bottom" />
        <span className="festival-stage" />
      </div>
    );
  }

  if (event.kind === "trade") {
    return (
      <div className="world-event-effect world-event-effect-trade" data-testid="world-event-effect-trade">
        <span className="trade-cart" />
        <span className="trade-wheel trade-wheel-left" />
        <span className="trade-wheel trade-wheel-right" />
        <span className="trade-crate" />
        <span className="trade-arrow" />
      </div>
    );
  }

  if (event.kind === "discovery") {
    return (
      <div className="world-event-effect world-event-effect-discovery" data-testid="world-event-effect-discovery">
        <span className="discovery-lens" />
        <span className="discovery-handle" />
        <span className="discovery-star discovery-star-one" />
        <span className="discovery-star discovery-star-two" />
        <span className="discovery-sweep" />
      </div>
    );
  }

  if (event.kind === "sabotage") {
    return (
      <div className="world-event-effect world-event-effect-sabotage" data-testid="world-event-effect-sabotage">
        <span className="sabotage-bomb" />
        <span className="sabotage-fuse" />
        <span className="sabotage-spark sabotage-spark-one" />
        <span className="sabotage-spark sabotage-spark-two" />
        <span className="sabotage-smoke" />
      </div>
    );
  }

  return (
    <div className="world-event-effect world-event-effect-invention" data-testid="world-event-effect-invention">
      <span className="invention-core" />
      <span className="invention-ring invention-ring-one" />
      <span className="invention-ring invention-ring-two" />
      <span className="invention-spark invention-spark-one" />
      <span className="invention-spark invention-spark-two" />
      <span className="invention-spark invention-spark-three" />
    </div>
  );
}

function buildIntroMapState({
  currentState,
  foundedSlugs,
  world,
}: {
  currentState: WorldState;
  foundedSlugs: Set<string>;
  world: WorldRenderModel;
}): WorldState {
  const foundedCities = new Map<string, WorldState["cities"][number]>();
  const foundedRoutes = new Map<string, WorldRoute>();

  world.years.forEach((year) => {
    const state = world.states[year];

    state.cities.forEach((city) => {
      if (foundedSlugs.has(city.slug) && !foundedCities.has(city.slug)) {
        foundedCities.set(city.slug, city);
      }
    });

    state.routes.forEach((route) => {
      if (foundedSlugs.has(route.from) && foundedSlugs.has(route.to) && !foundedRoutes.has(route.id)) {
        foundedRoutes.set(route.id, route);
      }
    });
  });

  return {
    ...currentState,
    cities: [...foundedCities.values()].sort((left, right) => left.radius - right.radius),
    routes: [...foundedRoutes.values()],
  };
}

declare global {
  interface Window {
    __CIVFOLIO_INTRO_STEP_MS?: number;
    __CIVFOLIO_INTRO_FINAL_MS?: number;
    __CIVFOLIO_CREATOR_PROMPT_DELAY_MS?: number;
    __CIVFOLIO_CREATOR_PROMPT_LIFETIME_MS?: number;
    __CIVFOLIO_WORLD_EVENT_MIN_MS?: number;
    __CIVFOLIO_WORLD_EVENT_MAX_MS?: number;
    __CIVFOLIO_WORLD_EVENT_DURATION_MS?: number;
    __CIVFOLIO_WORLD_EVENT_KIND?: WorldEventKind;
  }
}

export function WorldExplorer({
  site,
  leader,
  world,
  works,
  github,
}: {
  site: SiteConfig;
  leader: LeaderProfile;
  world: WorldRenderModel;
  works: Work[];
  github: GithubCache;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraTargetRef = useRef<CameraState>(initialCamera);
  const cameraFrameRef = useRef<number | null>(null);
  const lastCameraTickRef = useRef<number | null>(null);
  const appliedCameraModeRef = useRef<string | null>(null);
  const previousViewportSizeRef = useRef({ width: 1200, height: 840 });
  const isDraggingRef = useRef(false);
  const introCancelledRef = useRef(false);
  const introTimeoutRef = useRef<number | null>(null);
  const introCueKeyRef = useRef<string | null>(null);
  const introActiveRef = useRef(site.scene.introEnabled);
  const introPanelVisibleRef = useRef(false);
  const worldEventCueRef = useRef<Set<string>>(new Set());
  const worldEventNonceRef = useRef(0);
  const activeWorldEventsRef = useRef<ActiveWorldEvent[]>([]);
  const worldEventKindHistoryRef = useRef<WorldEventKind[]>([]);
  const worldEventCityHistoryRef = useRef<string[]>([]);
  const worldEventRouteHistoryRef = useRef<string[]>([]);
  const worldEventContextRef = useRef({
    currentState: world.states[world.years[world.years.length - 1]],
    visibleCities: [] as typeof world.states[number]["cities"],
    camera: initialCamera,
    containerSize: { width: 1200, height: 840 },
  });
  const selectionSourceRef = useRef<"map" | "route">("route");
  const skipNextSheetCameraNudgeRef = useRef(false);
  const [selectedYear, setSelectedYear] = useState(world.years[world.years.length - 1]);
  const [filter, setFilter] = useState<Work["discipline"] | "all">("all");
  const [camera, setCamera] = useState<CameraState>(initialCamera);
  const [cameraMotionToken, setCameraMotionToken] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 840 });
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [hoveredGreatWork, setHoveredGreatWork] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnitCard, setSelectedUnitCard] = useState<{
    id: string;
    label: string;
    type: string;
    x: number;
    y: number;
  } | null>(null);
  const [selectedUnitLock, setSelectedUnitLock] = useState<{ id: string; x: number; y: number } | null>(null);
  const [introActive, setIntroActive] = useState(site.scene.introEnabled);
  const [introIndex, setIntroIndex] = useState(0);
  // Once the intro has been dismissed or completed it stays dismissed across
  // reloads. Replay button always re-enables it.
  // We use useLayoutEffect so the dismissal lands before the intro-sequence
  // effect runs and tries to advance the timeline to the first founding step.
  useLayoutEffect(() => {
    if (typeof window === "undefined" || !site.scene.introEnabled) {
      return;
    }
    try {
      if (window.localStorage.getItem(INTRO_DISMISSED_KEY) === "1") {
        // Mark cancelled so the year-restore effect snaps the map back to the
        // latest year if the intro effect briefly nudged it during the first
        // render pass.
        introCancelledRef.current = true;
        setIntroActive(false);
        const finalYear = world.years[world.years.length - 1];
        setSelectedYear(finalYear);
      }
    } catch {
      // Storage may be disabled (private mode); fall through.
    }
  }, [site.scene.introEnabled, world.years]);
  const [showLeader, setShowLeader] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [showMobileTimelineDetails, setShowMobileTimelineDetails] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showCreatorPrompt, setShowCreatorPrompt] = useState(false);
  const [activeWorldEvents, setActiveWorldEvents] = useState<ActiveWorldEvent[]>([]);
  const [sheetState, setSheetState] = useState<SheetState>("half");
  const mobileHudRef = useRef<HTMLDivElement | null>(null);
  const [mobileHudHeight, setMobileHudHeight] = useState(0);
  // Dismissable per-session "tap anywhere to enable music" toast. We only
  // surface it when the browser actually blocked autoplay (audio.status ===
  // "blocked") and the user has not dismissed it for this session.
  const [audioToastDismissed, setAudioToastDismissed] = useState(false);
  const audio = useWorldAudio(site.audio);
  // Auto-dismiss the audio toast once the user interacts and the music
  // actually starts playing. The user already knows audio is on at that
  // point, so the prompt is no longer useful.
  useEffect(() => {
    if (audio.status === "on" && !audioToastDismissed) {
      setAudioToastDismissed(true);
    }
  }, [audio.status, audioToastDismissed]);
  const { playIntroCue, playIntroTransition, playWorldEventCue } = audio;
  const isTablet = containerSize.width < 1100;
  const isMobile = containerSize.width < 760;
  const isShort = containerSize.height < 760;
  // isCompact treats short landscape phones (e.g. 720x400) like mobile so the
  // map stays visible. Width-based mobile is the default; landscape phones
  // collapse the same way when they're both short and not very wide.
  const isCompact = isMobile || (isShort && containerSize.width < 920);
  const showMobileTimeline = !isMobile || !introActive;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Track the mobile HUD height so panels (Map Key, Leader Profile) can sit
  // immediately under it instead of relying on a magic `pt-20`.
  useEffect(() => {
    const node = mobileHudRef.current;
    if (!node) {
      setMobileHudHeight(0);
      return;
    }
    const update = () => {
      setMobileHudHeight(node.getBoundingClientRect().height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isCompact, showMobileControls, showLeader]);

  useEffect(() => {
    if (cameraFrameRef.current !== null) {
      window.cancelAnimationFrame(cameraFrameRef.current);
      cameraFrameRef.current = null;
    }
    lastCameraTickRef.current = null;

    const tick = (now: number) => {
      setCamera((current) => {
        const target = cameraTargetRef.current;
        let dt = 16.7;
        if (lastCameraTickRef.current !== null) {
          dt = Math.min(56, Math.max(8, now - lastCameraTickRef.current));
        }
        lastCameraTickRef.current = now;

        // Frame-rate independent exponential smoothing so pans/zooms ease cleanly
        // on high-refresh displays and under load (vs. a fixed 0.16 lerp).
        const dragBoost = isDraggingRef.current ? 1.5 : 1;
        const lambda = 11.5 * dragBoost;
        const alpha = 1 - Math.exp((-lambda * dt) / 1000);
        const next = {
          zoom: current.zoom + (target.zoom - current.zoom) * alpha,
          x: current.x + (target.x - current.x) * alpha,
          y: current.y + (target.y - current.y) * alpha,
        };

        if (
          Math.abs(next.zoom - target.zoom) < 0.001 &&
          Math.abs(next.x - target.x) < 0.5 &&
          Math.abs(next.y - target.y) < 0.5
        ) {
          cameraFrameRef.current = null;
          lastCameraTickRef.current = null;
          return target;
        }

        cameraFrameRef.current = window.requestAnimationFrame(tick);
        return next;
      });
    };

    cameraFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (cameraFrameRef.current !== null) {
        window.cancelAnimationFrame(cameraFrameRef.current);
        cameraFrameRef.current = null;
      }
      lastCameraTickRef.current = null;
    };
  }, [cameraMotionToken]);

  const currentState = world.states[selectedYear];
  const currentCityMap = useMemo(
    () => new Map(currentState.cities.map((city) => [city.slug, city])),
    [currentState.cities],
  );
  const routeSelectedSlug = searchParams.get("work");
  const [optimisticSelectedSlug, setOptimisticSelectedSlug] = useState<string | null>(routeSelectedSlug);
  const selectedSlug = optimisticSelectedSlug;
  const cityLookup = currentCityMap;
  const selectedWork = works.find((work) => work.slug === selectedSlug);
  useEffect(() => {
    setOptimisticSelectedSlug(routeSelectedSlug);
  }, [routeSelectedSlug]);
  const workBySlug = useMemo(() => new Map(works.map((work) => [work.slug, work])), [works]);
  const selectedCity = selectedSlug ? cityLookup.get(selectedSlug) : undefined;
  const selectedWorkVisible = Boolean(selectedCity);
  const introSequence = useMemo(
    () =>
      site.scene.introSequence
        .map((slug) => works.find((work) => work.slug === slug))
        .filter((work): work is Work => Boolean(work)),
    [site.scene.introSequence, works],
  );
  const introFoundedSlugs = useMemo(() => {
    if (!introActive) {
      return null;
    }

    return new Set(introSequence.slice(0, introIndex + 1).map((work) => work.slug));
  }, [introActive, introIndex, introSequence]);
  const mapState = useMemo(() => {
    if (!introFoundedSlugs) {
      return currentState;
    }

    return buildIntroMapState({
      currentState,
      foundedSlugs: introFoundedSlugs,
      world,
    });
  }, [currentState, introFoundedSlugs, world]);
  const visibleCities = useMemo(
    () => mapState.cities.filter((city) => filter === "all" || city.discipline === filter),
    [filter, mapState.cities],
  );
  const minimapRoutes = useMemo(
    () => mapState.routes.filter((route) => route.type !== "inspiration"),
    [mapState.routes],
  );
  const currentIntroWork = introSequence[Math.min(introIndex, Math.max(introSequence.length - 1, 0))];
  const introFocusSlug = introActive && currentIntroWork ? currentIntroWork.slug : null;
  const latestYear = world.years[world.years.length - 1];
  const introPanelVisible = usePresence(introActive && Boolean(currentIntroWork), 260);
  const leaderPanelVisible = usePresence(showLeader, 220);
  const legendPanelVisible = usePresence(showLegend, 220);
  const creatorPromptVisible = usePresence(showCreatorPrompt, 220);
  const commandBriefVisible = usePresence(!selectedWork && !showLeader && !isTablet && !isShort, 220);
  const selectedWorkPanel = useRetainedPresence(selectedWorkVisible ? selectedWork ?? null : null, Boolean(selectedWork && selectedWorkVisible), 240);
  const hiddenWorkPanel = useRetainedPresence(
    !selectedWorkVisible ? selectedWork ?? null : null,
    Boolean(selectedWork && !selectedWorkVisible),
    240,
  );
  const selectedPanelCity = selectedWorkPanel.retained
    ? world.states[selectedYear].cities.find((city) => city.slug === selectedWorkPanel.retained?.slug) ?? selectedCity
    : undefined;
  const selectedPanelGithub =
    selectedWorkPanel.retained?.code?.repo &&
    github.repos[`${selectedWorkPanel.retained.code.repo.owner}/${selectedWorkPanel.retained.code.repo.name}`];
  const introProgress = introSequence.length > 0 ? (introIndex + 1) / introSequence.length : 0;
  const viewportSize = useMemo(
    () => ({
      width: Math.max(1, containerSize.width),
      height: Math.max(1, containerSize.height),
    }),
    [containerSize.height, containerSize.width],
  );
  const defaultCamera = useMemo(
    () =>
      getDefaultCamera({
        isMobile,
        viewport: viewportSize,
        world: { width: world.width, height: world.height },
      }),
    [isMobile, viewportSize, world.height, world.width],
  );
  const cameraZoomLimits = useMemo(
    () => ({
      // Allow a little whitespace beyond the map edge, especially on mobile,
      // so edge cities can be re-anchored without changing zoom.
      min: isMobile ? CAMERA_ZOOM_LIMITS.min : CAMERA_ZOOM_LIMITS.desktopMin,
      max: CAMERA_ZOOM_LIMITS.max,
    }),
    [isMobile],
  );
  const terrainAtPoint = useCallback((x: number, y: number) => {
    return world.hexes.reduce<{ terrain: (typeof world.hexes)[number]["terrain"]; distance: number }>(
      (closest, hex) => {
        const distance = (hex.x - x) ** 2 + (hex.y - y) ** 2;
        if (distance < closest.distance) {
          return { terrain: hex.terrain, distance };
        }
        return closest;
      },
      { terrain: "plains", distance: Number.POSITIVE_INFINITY },
    ).terrain;
  }, [world]);
  function clampCameraToWorld(next: CameraState) {
    return clampCameraToViewport(next, viewportSize, { width: world.width, height: world.height });
  }

  useEffect(() => {
    if (containerSize.width <= 1 || containerSize.height <= 1) {
      return;
    }

    const mode = isMobile ? "mobile" : "desktop";
    const previousViewportSize = previousViewportSizeRef.current;
    previousViewportSizeRef.current = viewportSize;

    if (appliedCameraModeRef.current === mode) {
      if (
        Math.abs(previousViewportSize.width - viewportSize.width) < 1 &&
        Math.abs(previousViewportSize.height - viewportSize.height) < 1
      ) {
        return;
      }

      const current = cameraTargetRef.current;
      const centerWorldX = (previousViewportSize.width * 0.5 - current.x) / current.zoom;
      const centerWorldY = (previousViewportSize.height * 0.5 - current.y) / current.zoom;
      const resized = clampCameraToViewport(
        {
          zoom: current.zoom,
          x: viewportSize.width * 0.5 - centerWorldX * current.zoom,
          y: viewportSize.height * 0.5 - centerWorldY * current.zoom,
        },
        viewportSize,
        { width: world.width, height: world.height },
      );

      cameraTargetRef.current = resized;
      setCamera(resized);
      setCameraMotionToken((value) => value + 1);
      return;
    }

    appliedCameraModeRef.current = mode;
    const clamped = clampCameraToViewport(defaultCamera, viewportSize, { width: world.width, height: world.height });
    cameraTargetRef.current = clamped;
    setCamera(clamped);
    setCameraMotionToken((value) => value + 1);
  }, [containerSize.height, containerSize.width, defaultCamera, isMobile, viewportSize, world.height, world.width]);

  function setCameraTarget(
    next:
      | CameraState
      | ((current: CameraState) => CameraState),
  ) {
    const resolved =
      typeof next === "function" ? next(cameraTargetRef.current) : next;
    const clamped = clampCameraToWorld(resolved);
    cameraTargetRef.current = clamped;
    setCameraMotionToken((value) => value + 1);
  }

  function adjustZoom(
    delta: number,
    anchorX = viewportSize.width * 0.5,
    anchorY = viewportSize.height * 0.5,
    immediate = false,
  ) {
    const next = clampCameraToWorld(
      zoomCameraAtPoint(cameraTargetRef.current, delta, { x: anchorX, y: anchorY }, cameraZoomLimits),
    );
    cameraTargetRef.current = next;
    if (immediate) {
      setCamera(next);
      return;
    }
    setCameraTarget(next);
  }

  function updateWorkInRoute(slug?: string) {
    setOptimisticSelectedSlug(slug ?? null);
    const params = new URLSearchParams(searchParams.toString());
    if (slug) {
      params.set("work", slug);
    } else {
      params.delete("work");
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function startIntro() {
    if (introTimeoutRef.current) {
      window.clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }

    introCancelledRef.current = false;
    introCueKeyRef.current = null;
    setShowLeader(false);
    setShowLegend(false);
    setShowMobileControls(false);
    setShowMobileTimelineDetails(false);
    setFilter("all");
    setIntroIndex(0);
    setCameraTarget(defaultCamera);
    updateWorkInRoute();
    clearIntroDismissed();
    setIntroActive(true);
  }

  function stopIntro({ resetCamera = false }: { resetCamera?: boolean } = {}) {
    if (introTimeoutRef.current) {
      window.clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }
    introCancelledRef.current = true;
    introCueKeyRef.current = null;
    setShowMobileControls(false);
    setShowMobileTimelineDetails(false);
    if (!introActiveRef.current) {
      return;
    }
    setSelectedYear(latestYear);
    if (resetCamera) {
      setCameraTarget(defaultCamera);
    }
    markIntroDismissed();
    setIntroActive(false);
  }

  function openWork(slug: string) {
    selectionSourceRef.current = "map";
    skipNextSheetCameraNudgeRef.current = isCompact && sheetState !== "half";
    audio.playUiClick("city");
    stopIntro();
    setShowLeader(false);
    setShowLegend(false);
    setShowMobileControls(false);
    setShowMobileTimelineDetails(false);
    updateWorkInRoute(slug);
  }

  function closePanels() {
    audio.playUiClick("close");
    setShowLeader(false);
    setShowLegend(false);
    setShowMobileControls(false);
    setShowMobileTimelineDetails(false);
    clearSelectedUnit();
    updateWorkInRoute();
  }

  function nudgeTowardsPoint(x: number, y: number, options: { preserveZoom?: boolean } = {}) {
    const current = cameraTargetRef.current;
    const zoom = options.preserveZoom ? camera.zoom : current.zoom;
    const viewportWidth = viewportSize.width;
    const viewportHeight = viewportSize.height;
    // On mobile the bottom sheet covers the lower portion of the screen; we
    // pin the focused point to the visible region above it so the city stays
    // glanceable while the dossier is open.
    const sheetReserveBottom = isCompact && Boolean(selectedSlug)
      ? Math.min(viewportHeight * getMobileSheetHeightRatio(sheetState), viewportHeight - 96)
      : 0;
    const visibleHeight = Math.max(120, viewportHeight - sheetReserveBottom);
    const focusFractionX = isCompact ? 0.5 : isTablet ? 0.52 : 0.58;
    const focusFractionY = isCompact ? 0.46 : 0.54;
    const desiredX = viewportWidth * focusFractionX - x * zoom;
    const desiredY = visibleHeight * focusFractionY - y * zoom;
    const dx = clamp(desiredX - current.x, -180, 180);
    const dy = clamp(desiredY - current.y, isCompact ? -240 : -72, isCompact ? 240 : 72);

    setCameraTarget({
      zoom,
      x: current.x + dx * (isCompact ? 0.32 : 0.22),
      y: current.y + dy * (isCompact ? 0.38 : 0.18),
    });
  }

  function focusPointForIntro(x: number, y: number) {
    // Frame each founding city generously: derive zoom from the fit-to-world
    // overview so small phones zoom in ~2.4× while wide desktop lands ~1.9×,
    // then center the city. Biasing lower on compact keeps the tile clear of
    // the bottom intro card; on desktop the card is top-aligned so we bias
    // a little lower on the screen.
    const overviewZoom = defaultCamera.zoom;
    const introZoom = isCompact
      ? clamp(
          Math.max(overviewZoom * 2.45, 0.8),
          0.76,
          Math.min(0.98, cameraZoomLimits.max),
        )
      : clamp(
          Math.max(overviewZoom * 1.88, 1.06),
          0.94,
          Math.min(1.38, cameraZoomLimits.max),
        );
    const viewportWidth = viewportSize.width;
    const viewportHeight = viewportSize.height;
    const focusFractionX = 0.5;
    const focusFractionY = isCompact ? 0.37 : isTablet ? 0.54 : 0.58;

    const desiredX = viewportWidth * focusFractionX - x * introZoom;
    const desiredY = viewportHeight * focusFractionY - y * introZoom;

    setCameraTarget({
      zoom: introZoom,
      x: desiredX,
      y: desiredY,
    });
  }

  function resetView() {
    audio.playUiClick("toggle");
    stopIntro();
    setCameraTarget(defaultCamera);
  }

  function jumpToWorkYear(work: Work) {
    audio.playUiClick("button");
    const year = world.years.find((entry) => entry >= work.startYear) ?? world.years[0];
    setSelectedYear(year);
  }

  function worldPointToScreen(x: number, y: number) {
    return worldPointToLocalPoint({ x, y }, camera, viewportSize, containerSize);
  }

  function getWorldEventPoint(event: WorldEvent) {
    const sourceCity = currentState.cities.find((city) => city.slug === event.citySlug);
    if (!sourceCity) {
      return null;
    }

    if ((event.kind === "battle" || event.kind === "trade") && event.targetCitySlug) {
      const targetCity = currentState.cities.find((city) => city.slug === event.targetCitySlug);
      if (targetCity) {
        return {
          x: (sourceCity.x + targetCity.x) / 2,
          y: (sourceCity.y + targetCity.y) / 2,
        };
      }
    }

    return { x: sourceCity.x, y: sourceCity.y };
  }

  function getWorldEventScreenPoint(event: WorldEvent) {
    const point = getWorldEventPoint(event);
    return point ? worldPointToScreen(point.x, point.y) : null;
  }

  function clampCardPosition(x: number, y: number, width: number, height: number) {
    return {
      x: clamp(x, 12, containerSize.width - width),
      y: clamp(y, 12, containerSize.height - height),
    };
  }

  useEffect(() => {
    worldEventContextRef.current = {
      currentState,
      visibleCities,
      camera,
      containerSize,
    };
  }, [camera, containerSize, currentState, visibleCities]);

  function screenPointToWorld(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const localX = clientX - (rect?.left ?? 0);
    const localY = clientY - (rect?.top ?? 0);
    const worldPoint = localPointToWorldPoint(
      { x: localX, y: localY },
      camera,
      viewportSize,
      containerSize,
      { width: world.width, height: world.height },
    );
    return { x: worldPoint.x, y: worldPoint.y, localX, localY };
  }

  function clearSelectedUnit(unitId?: string | null) {
    if (!unitId) {
      setSelectedUnitId(null);
      setSelectedUnitCard(null);
      setSelectedUnitLock(null);
      return;
    }

    setSelectedUnitId((current) => (current === unitId ? null : current));
    setSelectedUnitCard((current) => (current?.id === unitId ? null : current));
    setSelectedUnitLock((current) => (current?.id === unitId ? null : current));
  }

  function selectUnit(unit: {
    id: string;
    label: string;
    type: string;
    worldX: number;
    worldY: number;
  }, clientX?: number, clientY?: number) {
    if (selectedUnitId !== unit.id) {
      audio.playUiClick("troop");
    }

    const next =
      typeof clientX === "number" && typeof clientY === "number"
        ? screenPointToWorld(clientX, clientY)
        : null;

    setSelectedUnitId(unit.id);
    setSelectedUnitLock({ id: unit.id, x: unit.worldX, y: unit.worldY });
    setSelectedUnitCard({
      id: unit.id,
      label: unit.label,
      type: unit.type,
      ...(next
        ? {
            ...clampCardPosition(next.localX + 12, next.localY - 12, 268, 156),
          }
        : clampCardPosition(worldPointToScreen(unit.worldX, unit.worldY).x + 12, worldPointToScreen(unit.worldX, unit.worldY).y - 12, 268, 156)),
    });
  }

  useEffect(() => {
    activeWorldEventsRef.current = activeWorldEvents;
  }, [activeWorldEvents]);

  useEffect(() => {
    if (!selectedSlug) {
      return;
    }
    // Default to a comfortable read state every time a city opens; the user
    // can drag/expand from there.
    setSheetState("half");
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedCity) {
      return;
    }

    if (selectionSourceRef.current === "map") {
      selectionSourceRef.current = "route";
      return;
    }

    nudgeTowardsPoint(selectedCity.x, selectedCity.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity?.slug, containerSize.height, containerSize.width]);

  useEffect(() => {
    if (!isCompact || !selectedCity) {
      return;
    }
    if (skipNextSheetCameraNudgeRef.current) {
      skipNextSheetCameraNudgeRef.current = false;
      return;
    }
    // When the sheet snaps to a new height, re-nudge the camera so the
    // selected city remains visible above the sheet.
    nudgeTowardsPoint(selectedCity.x, selectedCity.y, { preserveZoom: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetState, isCompact]);

  useEffect(() => {
    if (selectedSlug || showLeader) {
      setIntroActive(false);
    }
  }, [selectedSlug, showLeader]);

  useEffect(() => {
    if (!isMobile) {
      setShowMobileControls(false);
      setShowMobileTimelineDetails(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!introActive) {
      return;
    }

    worldEventCueRef.current.clear();
    worldEventKindHistoryRef.current = [];
    worldEventCityHistoryRef.current = [];
    worldEventRouteHistoryRef.current = [];
    setActiveWorldEvents([]);
  }, [introActive]);

  useEffect(() => {
    setActiveWorldEvents((current) => {
      const next = current.filter((event) => {
        const sourceStillVisible = visibleCities.some((city) => city.slug === event.citySlug);
        const targetStillVisible =
          !event.targetCitySlug || visibleCities.some((city) => city.slug === event.targetCitySlug);
        return sourceStillVisible && targetStillVisible;
      });
      return next.length === current.length ? current : next;
    });
  }, [visibleCities]);

  useEffect(() => {
    if (!introActive && introCancelledRef.current) {
      setSelectedYear(latestYear);
    }
  }, [introActive, latestYear]);

  // Expose a small debug snapshot so e2e tests can inspect React-side camera
  // state (target, defaults) that PIXI's debug API can't otherwise see.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.__CIVFOLIO_EXPLORER_DEBUG__ = {
      introActive,
      cameraTarget: { ...cameraTargetRef.current },
      defaultCamera: { ...defaultCamera },
      containerSize: { ...containerSize },
    };
  });

  useEffect(() => {
    if (introActive && !introActiveRef.current) {
      playIntroCue("start");
    }

    introActiveRef.current = introActive;
  }, [introActive, playIntroCue]);

  useEffect(() => {
    if (!introPanelVisible && introPanelVisibleRef.current) {
      playIntroTransition();
    }

    introPanelVisibleRef.current = introPanelVisible;
  }, [introPanelVisible, playIntroTransition]);

  useEffect(() => {
    if (introActive || visibleCities.length === 0) {
      return;
    }

    let timeout: number | null = null;
    let cancelled = false;

    const scheduleNextEvent = () => {
      const minMs = window.__CIVFOLIO_WORLD_EVENT_MIN_MS ?? 55_000;
      const maxMs = Math.max(minMs, window.__CIVFOLIO_WORLD_EVENT_MAX_MS ?? 85_000);
      const delayMs = minMs + Math.random() * (maxMs - minMs);
      timeout = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        const latest = worldEventContextRef.current;
        const activeEvents = activeWorldEventsRef.current;
        const activeEventCitySlugs = activeEvents.flatMap((event) => [
          event.citySlug,
          ...(event.targetCitySlug ? [event.targetCitySlug] : []),
        ]);
        const activeEventRouteKeys = activeEvents
          .map((event) => getWorldEventRouteKey(event.citySlug, event.targetCitySlug))
          .filter((key): key is string => Boolean(key));
        const activeEventKinds = activeEvents.map((event) => event.kind);
        const avoidKinds = [
          ...activeEventKinds,
          ...worldEventKindHistoryRef.current,
        ];
        const avoidCitySlugs = [
          ...activeEventCitySlugs,
          ...worldEventCityHistoryRef.current,
        ];
        const avoidRouteKeys = [
          ...activeEventRouteKeys,
          ...worldEventRouteHistoryRef.current,
        ];
        const candidateCities = latest.visibleCities.filter((city) => {
          const point = worldPointToLocalPoint(
            { x: city.x, y: city.y },
            latest.camera,
            {
              width: Math.max(1, latest.containerSize.width),
              height: Math.max(1, latest.containerSize.height),
            },
            latest.containerSize,
          );

          return (
            point.x >= 72 &&
            point.x <= latest.containerSize.width - 72 &&
            point.y >= 110 &&
            point.y <= latest.containerSize.height - 110 &&
            !activeEventCitySlugs.includes(city.slug)
          );
        });

        const nextEvent = buildWorldEvent({
          eventId: ++worldEventNonceRef.current,
          cities: candidateCities.length > 0 ? candidateCities : latest.visibleCities,
          routes: latest.currentState.routes,
          forcedKind: window.__CIVFOLIO_WORLD_EVENT_KIND,
          avoidKinds: window.__CIVFOLIO_WORLD_EVENT_KIND ? [] : avoidKinds,
          avoidCitySlugs,
          avoidRouteKeys,
        });

        if (nextEvent) {
          const durationMs = window.__CIVFOLIO_WORLD_EVENT_DURATION_MS ?? 24_000;
          const routeKey = getWorldEventRouteKey(nextEvent.citySlug, nextEvent.targetCitySlug);
          worldEventKindHistoryRef.current = [
            nextEvent.kind,
            ...worldEventKindHistoryRef.current.filter((kind) => kind !== nextEvent.kind),
          ].slice(0, 3);
          worldEventCityHistoryRef.current = [
            nextEvent.citySlug,
            ...(nextEvent.targetCitySlug ? [nextEvent.targetCitySlug] : []),
            ...worldEventCityHistoryRef.current.filter(
              (slug) => slug !== nextEvent.citySlug && slug !== nextEvent.targetCitySlug,
            ),
          ].slice(0, 8);
          worldEventRouteHistoryRef.current = routeKey
            ? [
                routeKey,
                ...worldEventRouteHistoryRef.current.filter((entry) => entry !== routeKey),
              ].slice(0, 5)
            : worldEventRouteHistoryRef.current.slice(0, 5);
          setActiveWorldEvents((current) => {
            const next = [
              ...current,
              {
                ...nextEvent,
                expiresAt: Date.now() + durationMs,
              },
            ].slice(-4);
            activeWorldEventsRef.current = next;
            return next;
          });
        }

        scheduleNextEvent();
      }, delayMs);
    };

    scheduleNextEvent();

    return () => {
      cancelled = true;
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [introActive, visibleCities.length]);

  useEffect(() => {
    const activeIds = new Set(activeWorldEvents.map((event) => event.id));
    worldEventCueRef.current.forEach((id) => {
      if (!activeIds.has(id)) {
        worldEventCueRef.current.delete(id);
      }
    });

    activeWorldEvents.forEach((event) => {
      if (worldEventCueRef.current.has(event.id)) {
        return;
      }

      playWorldEventCue(event.kind);
      worldEventCueRef.current.add(event.id);
    });

    if (activeWorldEvents.length === 0) {
      return;
    }

    const nextExpiry = Math.min(...activeWorldEvents.map((event) => event.expiresAt));
    const timeout = window.setTimeout(() => {
      const now = Date.now();
      setActiveWorldEvents((current) => {
        const next = current.filter((event) => event.expiresAt > now);
        activeWorldEventsRef.current = next;
        return next;
      });
    }, Math.max(0, nextExpiry - Date.now()));

    return () => window.clearTimeout(timeout);
  }, [activeWorldEvents, playWorldEventCue]);

  useEffect(() => {
    if (!introActive || introSequence.length === 0 || selectedSlug || showLeader) {
      return;
    }

    const currentWork = introSequence[Math.min(introIndex, introSequence.length - 1)];
    const stepDuration = window.__CIVFOLIO_INTRO_STEP_MS ?? 2100;
    const finalDuration = window.__CIVFOLIO_INTRO_FINAL_MS ?? 1800;
    const cueKey = `${currentWork.slug}:${introIndex}`;
    if (introCueKeyRef.current !== cueKey) {
      audio.playIntroCue(introIndex >= introSequence.length - 1 ? "complete" : "founding");
      introCueKeyRef.current = cueKey;
    }
    const year = world.years.find((entry) => entry >= currentWork.startYear) ?? world.years[0];
    const state = world.states[year];
    const city = state.cities.find((entry) => entry.slug === currentWork.slug);
    setSelectedYear(year);
    if (city) {
      focusPointForIntro(city.x, city.y);
    }

    introTimeoutRef.current = window.setTimeout(() => {
      if (introIndex >= introSequence.length - 1) {
        setSelectedYear(latestYear);
        setCameraTarget(defaultCamera);
        markIntroDismissed();
        setIntroActive(false);
        return;
      }
      setIntroIndex((value) => value + 1);
    }, introIndex === introSequence.length - 1 ? finalDuration : stepDuration);

    return () => {
      if (introTimeoutRef.current) {
        window.clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = null;
      }
    };
  }, [
    audio.playIntroCue,
    containerSize.height,
    containerSize.width,
    defaultCamera,
    introActive,
    introIndex,
    introSequence,
    isCompact,
    isMobile,
    isTablet,
    latestYear,
    selectedSlug,
    showLeader,
    world.states,
    world.years,
  ]);

  useEffect(() => {
    const delayMs = window.__CIVFOLIO_CREATOR_PROMPT_DELAY_MS ?? 60_000;
    const timeout = window.setTimeout(() => {
      setShowCreatorPrompt(true);
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!showCreatorPrompt) {
      return;
    }

    const lifetimeMs = window.__CIVFOLIO_CREATOR_PROMPT_LIFETIME_MS ?? 20_000;
    const timeout = window.setTimeout(() => {
      setShowCreatorPrompt(false);
    }, lifetimeMs);

    return () => window.clearTimeout(timeout);
  }, [showCreatorPrompt]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        stopIntro();
        closePanels();
      }

      if (event.key === "+") {
        stopIntro();
        adjustZoom(0.08);
      }

      if (event.key === "-") {
        stopIntro();
        adjustZoom(-0.08);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Keyboard handlers intentionally bind to the latest route/camera closures without re-attaching per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.height, containerSize.width, pathname, router, searchParams]);

  return (
    <section className="select-none px-1 pb-1 sm:px-4 sm:pb-4 lg:px-6">
      <div
        ref={containerRef}
        data-map-drag-surface="true"
        className={cn(
          "relative isolate min-h-[calc(100svh-3.75rem)] overflow-hidden rounded-[18px] border border-[rgba(244,211,141,0.18)] bg-[radial-gradient(circle_at_top,_rgba(70,120,160,0.28),_rgba(11,12,17,0.98)_56%)] shadow-[0_40px_120px_rgba(0,0,0,0.42)] sm:min-h-[calc(100vh-6.75rem)] sm:rounded-[34px]",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{
          // Prevent iOS rubber-banding from triggering inside the map and
          // keep native pinch/scroll from fighting our pointer-driven
          // pan/zoom. PIXI's canvas already sets `touch-action: none`; we
          // mirror it here so chrome layered above the canvas inherits the
          // same behaviour and the page itself never scroll-bounces.
          touchAction: "none",
          overscrollBehavior: "contain",
        }}
      >
        <div className="world-atmosphere pointer-events-none absolute inset-0" />
        <WorldMapPixi
          world={world}
          currentState={mapState}
          visibleCities={visibleCities}
          workBySlug={workBySlug}
          selectedYear={selectedYear}
          selectedSlug={selectedSlug}
          introFocusSlug={introFocusSlug}
          hoveredCity={hoveredCity}
          hoveredGreatWork={hoveredGreatWork}
          selectedUnitId={selectedUnitId}
          selectedUnitLock={selectedUnitLock}
          introActive={introActive}
          toolUnits={site.scene.toolUnits}
          camera={camera}
          terrainAtPoint={terrainAtPoint}
          onCameraChange={(nextCamera, options) => {
            const clamped = clampCameraToWorld(nextCamera);
            // Clamp-plugin echoes follow our own React → PIXI sync; they would
            // otherwise overwrite the in-progress tween target with the
            // *current* (interpolated) camera state and prematurely settle the
            // tween at the wrong zoom/position. Real user gestures (drag,
            // wheel, pinch) come through without `fromClamp` and DO update the
            // target so the tween stops fighting the user.
            if (!options?.fromClamp) {
              cameraTargetRef.current = clamped;
              // PIXI already moved the viewport (drag, wheel, pinch, or test
              // helpers). Drop any pending React-side rAF lerp so we never
              // overwrite that authoritative state on the next frame.
              if (cameraFrameRef.current !== null) {
                window.cancelAnimationFrame(cameraFrameRef.current);
                cameraFrameRef.current = null;
              }
              lastCameraTickRef.current = null;
            }
            setCamera(clamped);
          }}
          onDragStateChange={setIsDragging}
          onBackgroundClick={closePanels}
          onOpenWork={openWork}
          onSetHoveredCity={setHoveredCity}
          onSetHoveredGreatWork={setHoveredGreatWork}
          onStopIntro={stopIntro}
          onClearSelectedUnit={clearSelectedUnit}
          onSelectUnit={selectUnit}
        />

        <div
          className="world-fog pointer-events-none absolute inset-0"
        />

        {isCompact ? (
          <div
            data-testid="mobile-zoom-rail"
            className="pointer-events-none absolute right-2 z-30 flex flex-col items-center gap-1.5"
            style={{
              top: mobileHudHeight > 0 ? mobileHudHeight + 16 : 80,
            }}
          >
            <button
              type="button"
              data-testid="mobile-zoom-in"
              aria-label="Zoom in"
              onClick={() => {
                audio.playUiClick("toggle");
                stopIntro();
                adjustZoom(0.12);
              }}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(244,211,141,0.18)] bg-[rgba(14,10,8,0.78)] text-base font-semibold text-[var(--accent-strong)] shadow-[0_12px_28px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-[var(--accent)] active:scale-95"
            >
              +
            </button>
            <button
              type="button"
              data-testid="mobile-zoom-out"
              aria-label="Zoom out"
              onClick={() => {
                audio.playUiClick("toggle");
                stopIntro();
                adjustZoom(-0.12);
              }}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(244,211,141,0.18)] bg-[rgba(14,10,8,0.78)] text-base font-semibold text-[var(--accent-strong)] shadow-[0_12px_28px_rgba(0,0,0,0.3)] backdrop-blur-md transition hover:border-[var(--accent)] active:scale-95"
            >
              −
            </button>
            <button
              type="button"
              data-testid="mobile-zoom-reset"
              aria-label="Reset view"
              onClick={() => {
                audio.playUiClick("toggle");
                resetView();
              }}
              className="pointer-events-auto inline-flex h-8 w-9 items-center justify-center rounded-full border border-white/10 bg-[rgba(14,10,8,0.7)] text-[10px] uppercase tracking-[0.1em] text-[var(--muted-soft)] shadow-[0_10px_22px_rgba(0,0,0,0.28)] backdrop-blur-md transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)] active:scale-95"
            >
              Fit
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "pointer-events-none absolute z-20",
            isMobile
              ? "inset-x-1.5 top-[max(env(safe-area-inset-top),0.375rem)]"
              : "inset-x-4 top-4 flex items-start justify-between gap-4 flex-wrap",
          )}
        >
          {isMobile ? (
            <div
              data-testid="mobile-hud"
              ref={mobileHudRef}
              className="hud-drift pointer-events-auto rounded-[14px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.7)] px-2 py-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="min-w-0">
                  <h1 className="font-display text-[1.05rem] leading-none text-[var(--parchment)]">
                    {leader.name}
                  </h1>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--accent-strong)]">
                    <span className="truncate">Strategy Map</span>
                    <span aria-hidden="true" className="text-[var(--muted)]">
                      ·
                    </span>
                    <span className="truncate text-[var(--muted)]">{currentState.label}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <OverlayButton
                    active={showLeader}
                    aria-label="Leader Profile"
                    onClick={() => {
                      audio.playUiClick("button");
                      stopIntro();
                      setShowMobileControls(false);
                      setShowLeader((value) => !value);
                      updateWorkInRoute();
                    }}
                    className="min-h-8 px-2.5 py-1.5 text-[10px] tracking-[0.08em]"
                  >
                    Leader
                  </OverlayButton>
                  <OverlayButton
                    active={showMobileControls}
                    onClick={() => {
                      audio.playUiClick("toggle");
                      setShowMobileTimelineDetails(false);
                      setShowMobileControls((value) => !value);
                    }}
                    className="min-h-8 px-2.5 py-1.5 text-[10px] tracking-[0.08em]"
                  >
                    Controls
                  </OverlayButton>
                </div>
              </div>

              {showMobileControls ? (
                <div
                  data-testid="mobile-controls-panel"
                  className="mt-1.5 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-1.5"
                >
                  <OverlayButton
                    active={showLegend}
                    onClick={() => {
                      audio.playUiClick("toggle");
                      stopIntro();
                      setShowLegend((value) => !value);
                    }}
                    className="min-h-9 w-full px-2.5 py-1.5 text-[11px] tracking-[0.08em]"
                  >
                    Map Key
                  </OverlayButton>
                  <OverlayButton
                    onClick={() => {
                      audio.playUiClick("toggle");
                      void audio.toggleMusic();
                    }}
                    className="min-h-9 w-full px-2.5 py-1.5 text-[11px] tracking-[0.08em]"
                    aria-label={
                      audio.status === "on"
                        ? "Mute music"
                        : audio.status === "blocked"
                          ? "Audio blocked"
                          : "Unmute music"
                    }
                  >
                    {audio.status === "on"
                      ? "Mute"
                      : audio.status === "blocked"
                        ? "Audio blocked"
                        : "Unmute"}
                  </OverlayButton>
                  <Link
                    href="/archive"
                    onClick={() => {
                      audio.playUiClick("button");
                      setShowMobileControls(false);
                    }}
                    className="inline-flex min-h-9 w-full items-center justify-center rounded-full border border-white/12 bg-[rgba(255,255,255,0.06)] px-2.5 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                  >
                    Civilopedia
                  </Link>
                  <Link
                    href="/about"
                    onClick={() => {
                      audio.playUiClick("button");
                      setShowMobileControls(false);
                    }}
                    className="inline-flex min-h-9 w-full items-center justify-center rounded-full border border-white/12 bg-[rgba(255,255,255,0.06)] px-2.5 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--muted-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                  >
                    About
                  </Link>
                  {introActive ? null : (
                    <OverlayButton
                      onClick={() => {
                        audio.playUiClick("button");
                        startIntro();
                      }}
                      className="col-span-2 min-h-9 w-full px-2.5 py-1.5 text-[11px] tracking-[0.08em]"
                    >
                      Replay Intro
                    </OverlayButton>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "hud-drift pointer-events-auto rounded-[26px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.64)] shadow-[0_20px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl",
                  isTablet ? "max-w-[28rem] px-5 py-4" : "max-w-[36rem] px-5 py-4",
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-[var(--accent-strong)]">
                    Living world portfolio
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">
                    {currentState.label}
                  </span>
                </div>
                <h1 className={cn("mt-3 font-display leading-[0.94] text-[var(--parchment)]", isTablet ? "text-5xl" : "text-6xl")}>
                  {leader.name}
                  <span className="mt-2 block uppercase text-[0.5em] leading-[1.08] tracking-[0.18em] text-[var(--accent-strong)]">
                    Strategy Map of Work
                  </span>
                </h1>
                <p className={cn("mt-3 max-w-xl text-[var(--muted-soft)]", isTablet ? "text-sm leading-6" : "text-sm leading-7")}>
                  Pan, zoom, scrub time, and open cities to inspect the systems, products, and media work that built this world.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <OverlayButton
                    active={showLeader}
                    onClick={() => {
                      audio.playUiClick("button");
                      stopIntro();
                      setShowLeader((value) => !value);
                      updateWorkInRoute();
                    }}
                  >
                    Leader Profile
                  </OverlayButton>
                  <Link
                    href="/archive"
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/12 bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--muted-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                  >
                    Civilopedia
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/12 bg-[rgba(255,255,255,0.06)] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--muted-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                  >
                    About
                  </Link>
                </div>
              </div>

              <div className="pointer-events-auto flex items-start justify-end gap-3 flex-wrap">
                <StatChip label="Visible Cities" value={visibleCities.length} />
                <StatChip
                  label="Map Focus"
                  value={filter === "all" ? "All" : formatDisciplineLabel(filter)}
                />
                <div className="rounded-[24px] border border-white/10 bg-[rgba(14,10,8,0.62)] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                  <div className="flex flex-wrap gap-2">
                    <OverlayButton
                      onClick={() => {
                        audio.playUiClick("toggle");
                        stopIntro();
                        adjustZoom(-0.08);
                      }}
                    >
                      -
                    </OverlayButton>
                    <OverlayButton
                      onClick={() => {
                        audio.playUiClick("toggle");
                        stopIntro();
                        adjustZoom(0.08);
                      }}
                    >
                      +
                    </OverlayButton>
                    <OverlayButton onClick={resetView}>Reset</OverlayButton>
                    <OverlayButton
                      onClick={() => {
                        audio.playUiClick("toggle");
                        void audio.toggleMusic();
                      }}
                    >
                      {audio.status === "on"
                        ? `${site.audio.label} on`
                        : audio.status === "blocked"
                          ? "Audio blocked"
                          : `${site.audio.label} off`}
                    </OverlayButton>
                    <OverlayButton
                      active={showLegend}
                      onClick={() => {
                        audio.playUiClick("toggle");
                        stopIntro();
                        setShowLegend((value) => !value);
                      }}
                    >
                      Map Key
                    </OverlayButton>
                    {introActive ? null : (
                      <OverlayButton
                        onClick={() => {
                          audio.playUiClick("button");
                          startIntro();
                        }}
                      >
                        Replay Intro
                      </OverlayButton>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {introPanelVisible && currentIntroWork ? (
          <div className={cn("pointer-events-none absolute z-20 flex justify-center", isMobile ? "inset-x-2 bottom-2" : "inset-x-4 top-28")}>
            <div
              data-testid="intro-panel"
              className={cn(
                "panel-enter hud-drift rounded-[26px] border border-[rgba(244,211,141,0.18)] bg-[rgba(17,12,9,0.72)] text-center shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                isMobile ? "w-full max-w-[23rem] rounded-[16px] px-3 py-2.5" : "w-[min(30rem,100%)] px-5 py-4",
                introActive
                  ? "pointer-events-auto opacity-100 translate-y-0 scale-100 blur-0"
                  : "pointer-events-none opacity-0 -translate-y-3 scale-[0.985] blur-[2px]",
              )}
            >
              <div className={cn("uppercase text-[var(--accent-strong)]", isMobile ? "text-[10px] tracking-[0.12em]" : "text-[10px] tracking-[0.28em]")}>
                Campaign Replay · {introIndex + 1}/{introSequence.length}
              </div>
              <div
                data-testid="intro-title"
                className={cn("font-display text-[var(--parchment)]", isMobile ? "mt-1 text-[1.35rem] leading-none" : "mt-2 text-3xl")}
              >
                Founding {currentIntroWork.title}
              </div>
              <div className={cn("flex flex-wrap items-center justify-center uppercase text-[var(--muted)]", isMobile ? "mt-2 gap-1 text-[10px] tracking-[0.08em]" : "mt-3 gap-2 text-[10px] tracking-[0.22em]")}>
                <span className={cn("rounded-full border border-white/10", isMobile ? "px-2 py-0.5" : "px-3 py-1")}>{currentIntroWork.era}</span>
                <span className={cn("rounded-full border border-white/10", isMobile ? "px-2 py-0.5" : "px-3 py-1")}>{currentIntroWork.startYear}</span>
                <span className={cn("rounded-full border border-white/10", isMobile ? "px-2 py-0.5" : "px-3 py-1")}>{formatDisciplineLabel(currentIntroWork.discipline)}</span>
              </div>
              <p className={cn("text-[var(--muted-soft)]", isMobile ? "mt-2 line-clamp-2 text-[13px] leading-5" : "mt-3 text-sm leading-7")}>
                {currentIntroWork.summary}
              </p>
              <div className={cn("overflow-hidden rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)]", isMobile ? "mt-2 h-1.5" : "mt-4 h-2")}>
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(244,211,141,0.72),rgba(244,211,141,0.96))] transition-[width] duration-500 ease-out"
                  style={{ width: `${introProgress * 100}%` }}
                />
              </div>
              <p className={cn("uppercase text-[var(--muted)]", isMobile ? "sr-only" : "mt-3 text-[11px] tracking-[0.2em]")}>
                The world is founding itself. Drag, zoom, or open any city to take control.
              </p>
              <div className={cn("flex flex-wrap justify-center gap-2", isMobile ? "mt-2" : "mt-4")}>
                <OverlayButton
                  onClick={() => {
                    audio.playUiClick("close");
                    stopIntro({ resetCamera: true });
                  }}
                  className={isMobile ? "min-h-9 px-4 py-1.5 text-[11px] tracking-[0.1em]" : undefined}
                >
                  Skip Intro
                </OverlayButton>
              </div>
            </div>
          </div>
        ) : null}

        {activeWorldEvents.map((event) => {
          const eventScreenPoint = getWorldEventScreenPoint(event);
          if (!eventScreenPoint) {
            return null;
          }

          return (
            <Fragment key={event.id}>
              <div
                data-testid="world-event-marker"
                data-city-slug={event.citySlug}
                data-target-city-slug={event.targetCitySlug ?? ""}
                data-event-kind={event.kind}
                data-event-screen-x={Math.round(eventScreenPoint.x)}
                data-event-screen-y={Math.round(eventScreenPoint.y)}
                className="pointer-events-none absolute z-[44]"
                style={{
                  left: clamp(eventScreenPoint.x - 56, 12, containerSize.width - 112),
                  top: clamp(eventScreenPoint.y - 32, 12, containerSize.height - 126),
                }}
              >
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="world-event-beacon rounded-[8px] border-2 shadow-[0_10px_22px_rgba(0,0,0,0.24)]"
                    style={{
                      borderColor: event.accent,
                      background: "rgba(16,11,9,0.88)",
                      boxShadow: `0 0 0 8px ${event.accent}2a, 0 0 34px ${event.accent}50`,
                    }}
                  >
                    <WorldEventEffect event={event} />
                  </div>
                  <div
                    className="world-event-pulse rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[var(--parchment)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
                    style={{
                      borderColor: `${event.accent}aa`,
                      background: "rgba(14,10,8,0.92)",
                      boxShadow: `0 0 0 1px ${event.accent}55, 0 0 26px ${event.accent}3a`,
                    }}
                  >
                    {event.markerLabel}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })}

        {showMobileTimeline && !(isCompact && Boolean(selectedSlug) && sheetState !== "peek") ? (
          <div
            data-map-interactive="true"
            data-testid={isMobile ? "mobile-timeline-shell" : undefined}
            className={cn(
              "absolute z-20 rounded-[28px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.68)] shadow-[0_20px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl",
              isMobile
                ? "bottom-[max(env(safe-area-inset-bottom),0.5rem)] left-2 right-2 rounded-[20px] px-3 py-2"
                : isTablet
                  ? "bottom-4 left-4 right-40 px-5 py-4"
                  : "bottom-4 left-4 max-w-[620px] px-5 py-4",
            )}
          >
            <div className={cn("flex items-start justify-between", isMobile ? "gap-2" : "flex-wrap gap-3")}>
              <div>
                <div className={cn("uppercase text-[var(--muted)]", isMobile ? "text-[10px] tracking-[0.08em]" : "text-[10px] tracking-[0.28em]")}>Time progression</div>
                <div className={cn("mt-1 font-display text-[var(--accent-strong)]", isMobile ? "text-[2rem]" : "text-3xl")}>
                  {selectedYear}
                </div>
              </div>
              {isMobile ? (
                <OverlayButton
                  active={showMobileTimelineDetails}
                  aria-label={showMobileTimelineDetails ? "Hide Timeline" : "Open Timeline"}
                  onClick={() => {
                    audio.playUiClick("toggle");
                    setShowMobileControls(false);
                    setShowMobileTimelineDetails((value) => !value);
                  }}
                  className="min-h-8 shrink-0 px-3 py-1.5 text-[11px] tracking-[0.08em]"
                >
                  {showMobileTimelineDetails ? "Hide" : "Details"}
                </OverlayButton>
              ) : (
                <div className="max-w-[26rem] text-sm leading-7 text-[var(--muted-soft)]">{currentState.description}</div>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={world.years.length - 1}
              step={1}
              value={world.years.indexOf(selectedYear)}
              onChange={(event) => {
                stopIntro();
                setSelectedYear(world.years[Number(event.currentTarget.value)]);
              }}
              className={cn("w-full accent-[var(--accent)]", isMobile ? "mt-1.5" : "mt-3")}
              aria-label="Timeline slider"
            />
            {isMobile ? (
              showMobileTimelineDetails ? (
                <>
                  <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--muted-soft)]">{currentState.description}</div>
                  {/* Year tick rail. Years are absolutely positioned at the
                      slider's actual notch positions (with the same horizontal
                      inset the native range thumb uses) so the labels line up
                      with the thumb instead of stretching edge-to-edge. */}
                  <div
                    aria-hidden="true"
                    className="relative mt-2 h-3 px-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"
                  >
                    {world.years.map((year, index, list) => {
                      const total = list.length;
                      const isFirst = index === 0;
                      const isLast = index === total - 1;
                      const isMiddle = total > 2 && index === Math.floor(total / 2);
                      // On compact screens we keep just the first, middle and
                      // last labels visible; the rail rendering below shows the
                      // intermediate ticks as small marks.
                      const visible = isFirst || isLast || isMiddle;
                      const leftPct = total > 1 ? (index / (total - 1)) * 100 : 50;
                      return (
                        <Fragment key={year}>
                          <span
                            className={cn(
                              "absolute top-0 -translate-x-1/2 text-[var(--muted)]",
                              !visible && "opacity-0",
                            )}
                            style={{ left: `${leftPct}%` }}
                          >
                            {year}
                          </span>
                          {!visible ? (
                            <span
                              className="absolute top-0 h-1 w-px -translate-x-1/2 bg-white/15"
                              style={{ left: `${leftPct}%` }}
                            />
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </div>
                  <div className="filter-scroll-rail relative mt-2 -mx-1">
                    <div className="overflow-x-auto pb-1">
                      <div className="flex min-w-max gap-1.5 px-1">
                        {(["all", "code", "art", "music", "video", "writing", "client"] as const).map((discipline) => (
                          <OverlayButton
                            key={discipline}
                            active={filter === discipline}
                            onClick={() => {
                              audio.playUiClick("toggle");
                              stopIntro();
                              setFilter(discipline);
                            }}
                            className="min-h-9 px-3 py-1.5 text-[11px] tracking-[0.08em]"
                          >
                            {discipline === "all" ? "All" : formatDisplayLabel(discipline)}
                          </OverlayButton>
                        ))}
                      </div>
                    </div>
                    {/* Right-edge fade so the user knows there is more
                        content scrolled off to the right. Pointer events are
                        disabled so the mask never blocks chip taps. */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[rgba(14,10,8,0.85)] via-[rgba(14,10,8,0.45)] to-transparent" />
                  </div>
                </>
              ) : null
            ) : (
              <>
                <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                  {world.years.map((year) => (
                    <span key={year}>{year}</span>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex flex-wrap gap-2">
                    {(["all", "code", "art", "music", "video", "writing", "client"] as const).map((discipline) => (
                      <OverlayButton
                        key={discipline}
                        active={filter === discipline}
                        onClick={() => {
                          audio.playUiClick("toggle");
                          stopIntro();
                          setFilter(discipline);
                        }}
                        className="px-3 py-1.5 text-[10px]"
                      >
                        {discipline === "all" ? "All" : formatDisplayLabel(discipline)}
                      </OverlayButton>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}

        {isMobile && legendPanelVisible ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-[58] flex items-start justify-center px-2"
            style={{
              top: mobileHudHeight > 0 ? mobileHudHeight + 16 : 80,
              bottom: 0,
            }}
          >
            <div
              data-map-interactive="true"
              data-testid="mobile-legend-panel"
              className={cn(
                "panel-enter pointer-events-auto w-full max-h-[calc(100svh-6rem)] overflow-y-auto overscroll-contain rounded-[20px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.86)] p-3 text-sm leading-6 text-[var(--muted-soft)] shadow-[0_20px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                showLegend
                  ? "opacity-100 translate-y-0 scale-100 blur-0"
                  : "pointer-events-none opacity-0 translate-y-2 scale-[0.985] blur-[2px]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-display text-3xl text-[var(--accent-strong)]">Map Key</div>
                <OverlayButton
                  onClick={() => {
                    audio.playUiClick("close");
                    setShowLegend(false);
                  }}
                  className="px-3 py-2 text-[10px]"
                >
                  Close
                </OverlayButton>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <circle cx="12" cy="12" r="8" fill="#d8b470" fillOpacity="0.2" />
                    <circle cx="12" cy="12" r="5" fill="#f4d38d" />
                  </svg>
                  <p>Settlements, towns, capitals, and wonders scale with project importance, maturity, and momentum.</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <path d="M 3 17 C 7 8 16 8 21 17" fill="none" stroke="#9ad5f6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p>Rivers, roads, and routes mark shared systems, integrations, and cross-project influence.</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <rect x="4" y="7" width="16" height="10" rx="3" fill="rgba(244,211,141,0.18)" stroke="#f4d38d" />
                    <path d="M 7 15 L 7 10 M 11 15 L 11 8 M 15 15 L 15 10" stroke="#f4d38d" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <p>Improvements are skill tiles: farms, workshops, harbors, and academies that show what each city learned to grow.</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <path d="M 5 18 L 12 4 L 19 18 Z" fill="rgba(244,211,141,0.22)" stroke="#f4d38d" />
                  </svg>
                  <p>Great Works are landmark achievements. Their names appear on hover to keep the world readable.</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="absolute bottom-4 right-4 z-20 hidden flex-col items-end gap-3 md:flex">
          {legendPanelVisible ? (
            <div
              data-map-interactive="true"
              className={cn(
                "panel-enter w-80 rounded-[24px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.78)] p-4 text-sm leading-7 text-[var(--muted-soft)] shadow-[0_20px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                showLegend
                  ? "pointer-events-auto opacity-100 translate-y-0 scale-100 blur-0"
                  : "pointer-events-none opacity-0 translate-y-2 scale-[0.985] blur-[2px]",
              )}
            >
              <div className="font-display text-3xl text-[var(--accent-strong)]">Map Key</div>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <circle cx="12" cy="12" r="8" fill="#d8b470" fillOpacity="0.2" />
                    <circle cx="12" cy="12" r="5" fill="#f4d38d" />
                  </svg>
                  <p>Settlements, towns, capitals, and wonders scale with project importance, maturity, and momentum.</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <path d="M 3 17 C 7 8 16 8 21 17" fill="none" stroke="#9ad5f6" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p>Rivers, roads, and routes mark shared systems, integrations, and cross-project influence.</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <rect x="4" y="7" width="16" height="10" rx="3" fill="rgba(244,211,141,0.18)" stroke="#f4d38d" />
                    <path d="M 7 15 L 7 10 M 11 15 L 11 8 M 15 15 L 15 10" stroke="#f4d38d" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <p>Improvements are skill tiles: farms, workshops, harbors, and academies that show what each city learned to grow.</p>
                </div>
                <div className="flex items-start gap-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="mt-1 shrink-0">
                    <path d="M 5 18 L 12 4 L 19 18 Z" fill="rgba(244,211,141,0.22)" stroke="#f4d38d" />
                  </svg>
                  <p>Great Works are landmark achievements. Their names appear on hover to keep the world readable.</p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-end gap-3">
            {activeWorldEvents.length > 0 ? (
              <div
                data-map-interactive="true"
                data-testid="world-event-notifications"
                className="pointer-events-none flex w-[220px] flex-col gap-2"
              >
                {activeWorldEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    data-testid="world-event-card"
                    data-city-slug={event.citySlug}
                    data-target-city-slug={event.targetCitySlug ?? ""}
                    data-event-kind={event.kind}
                    className="world-event-card panel-enter rounded-[14px] border bg-[rgba(16,11,9,0.86)] px-3 py-2.5 text-[var(--muted-soft)] shadow-[0_16px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                    style={{
                      borderColor: `${event.accent}4f`,
                      boxShadow: `0 0 0 1px ${event.accent}2e, 0 14px 34px rgba(0,0,0,0.34), 0 0 24px ${event.accent}1c`,
                    }}
                  >
                    <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.18em]">
                      <span
                        className="rounded-full border px-1.5 py-0.5"
                        style={{ color: event.accent, borderColor: `${event.accent}66`, background: `${event.accent}16` }}
                      >
                        Event
                      </span>
                      <span className="truncate text-[var(--muted)]">{event.badge}</span>
                      <span className="truncate text-[var(--muted)]">{event.cityTitle}</span>
                    </div>
                    <div className="mt-2 line-clamp-1 font-display text-[1.1rem] leading-none text-[var(--parchment)]">
                      {event.title}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[var(--muted-soft)]">
                      {event.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div
              data-map-interactive="true"
              className="rounded-[24px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.72)] p-3 shadow-[0_20px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl"
            >
              <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Minimap</div>
              <svg
                data-map-interactive="true"
                width="220"
                height="148"
                viewBox={`0 0 ${world.width} ${world.height}`}
                onClick={(event) => {
                  stopIntro();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = ((event.clientX - rect.left) / rect.width) * world.width;
                  const y = ((event.clientY - rect.top) / rect.height) * world.height;
                  nudgeTowardsPoint(x, y);
                }}
                className="cursor-pointer"
              >
                <rect width={world.width} height={world.height} rx={14} fill="#0b121b" />
                {minimapRoutes.map((route) => (
                  <path key={route.id} d={route.path} fill="none" stroke="rgba(212,176,106,0.18)" strokeWidth={6} />
                ))}
                {mapState.cities.map((city) => (
                  <circle
                    key={city.slug}
                    cx={city.x}
                    cy={city.y}
                    r={city.slug === selectedSlug ? 22 : city.level === "wonder" ? 16 : 12}
                    fill={disciplineTone[city.discipline]}
                    fillOpacity={city.slug === selectedSlug ? 1 : 0.82}
                  />
                ))}
                <rect
                  x={clamp(-camera.x / camera.zoom, 0, world.width)}
                  y={clamp(-camera.y / camera.zoom, 0, world.height)}
                  width={clamp(containerSize.width / camera.zoom, 120, world.width)}
                  height={clamp(containerSize.height / camera.zoom, 120, world.height)}
                  fill="none"
                  stroke="#f4d38d"
                  strokeWidth={10}
                />
              </svg>
            </div>
          </div>
        </div>

        {hoveredCity && !isCompact ? (
          (() => {
            const city = mapState.cities.find((candidate) => candidate.slug === hoveredCity);
            if (!city) {
              return null;
            }

            const screenPoint = worldPointToScreen(city.x, city.y);
            const tooltipWidth = 320;
            const horizontalOffset = 24;
            const verticalInset = 128;
            const spaceLeft = screenPoint.x;
            const spaceRight = containerSize.width - screenPoint.x;
            const preferRight = spaceRight >= tooltipWidth + 40 || spaceRight >= spaceLeft;
            const anchoredLeft = preferRight
              ? screenPoint.x + horizontalOffset
              : screenPoint.x - tooltipWidth - horizontalOffset;
            const anchoredCenterY = clamp(screenPoint.y, verticalInset, containerSize.height - verticalInset);
            const tooltipPosition = {
              x: clamp(anchoredLeft, 12, containerSize.width - tooltipWidth),
              y: anchoredCenterY,
            };

            return (
              <div
                data-testid="city-tooltip"
                data-city-slug={city.slug}
                data-city-screen-x={screenPoint.x.toFixed(1)}
                data-city-screen-y={screenPoint.y.toFixed(1)}
                data-map-interactive="true"
                className="pointer-events-none absolute z-[70] w-80 rounded-[24px] border border-[var(--accent)] bg-[rgba(18,12,9,0.9)] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.42)]"
                style={{
                  left: tooltipPosition.x,
                  top: tooltipPosition.y,
                  transform: "translateY(-50%)",
                }}
              >
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                  {formatDisplayLabel(city.level)} · {formatDisciplineLabel(city.discipline)}
                </div>
                <div className="mt-1 font-display text-3xl text-[var(--parchment)]">{city.title}</div>
                <div className="mt-2 text-sm leading-7 text-[var(--muted-soft)]">{city.summary}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                  <span>{city.region}</span>
                  <span>{city.era}</span>
                  <span>{formatDisplayLabel(city.terrain)}</span>
                </div>
              </div>
            );
          })()
        ) : null}

        {selectedUnitCard ? (
          <div
            data-map-interactive="true"
            className="pointer-events-none absolute z-[70] w-64 rounded-[22px] border border-[var(--accent)] bg-[rgba(18,12,9,0.92)] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.42)]"
            style={{
              left: clamp(selectedUnitCard.x + 18, 12, containerSize.width - 268),
              top: clamp(selectedUnitCard.y - 84, 12, containerSize.height - 156),
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
              Traveler · {formatDisplayLabel(selectedUnitCard.type)}
            </div>
            <div className="mt-2 font-display text-3xl text-[var(--parchment)]">{selectedUnitCard.label}</div>
            <div className="mt-2 text-sm leading-7 text-[var(--muted-soft)]">
              {getTravelerFlavor(selectedUnitCard.label, selectedUnitCard.type)}
            </div>
          </div>
        ) : null}

        {audio.status === "blocked" && !audioToastDismissed ? (
          <div
            data-testid="audio-toast"
            data-map-interactive="true"
            className={cn(
              "panel-enter pointer-events-auto absolute z-[59] rounded-[16px] border border-[rgba(244,211,141,0.22)] bg-[rgba(16,11,9,0.92)] px-3 py-2 text-[var(--muted-soft)] shadow-[0_18px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl",
              isMobile
                ? "left-2 right-2"
                : "right-4 max-w-[22rem]",
            )}
            style={
              isMobile
                ? { top: mobileHudHeight > 0 ? mobileHudHeight + 12 : 80 }
                : { top: 96 }
            }
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                  Ambient music
                </div>
                <div className="mt-1 text-[12px] leading-5">
                  Tap anywhere to enable the soundtrack, or open Controls to keep it muted.
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss audio notice"
                data-testid="audio-toast-dismiss"
                onClick={() => setAudioToastDismissed(true)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[14px] leading-none text-[var(--muted-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)] active:scale-95"
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        {creatorPromptVisible ? (
          <div
            data-testid="creator-prompt"
            data-map-interactive="true"
            className={cn(
              "panel-enter absolute z-[55] rounded-[24px] border border-[rgba(244,211,141,0.18)] bg-[rgba(16,11,9,0.84)] shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              isMobile ? "bottom-2 left-2 right-2 rounded-[20px] p-3" : "bottom-4 left-4 w-[min(26rem,calc(100%-3rem))] p-4",
              showCreatorPrompt
                ? "pointer-events-auto opacity-100 translate-y-0 scale-100 blur-0"
                : "pointer-events-none opacity-0 translate-y-2 scale-[0.985] blur-[2px]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">Build Your Own</div>
                <div className="mt-2 font-display text-2xl leading-tight text-[var(--parchment)]">
                  Enjoy what you&apos;re seeing here? Want to create your own?
                </div>
              </div>
              <OverlayButton
                onClick={() => setShowCreatorPrompt(false)}
                className="px-3 py-2 text-[10px]"
              >
                Close
              </OverlayButton>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-soft)]">
              Give your Codex or Claude the README link below to get started.
            </p>
            <a
              href="https://github.com/BigOtis/CivFolio"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-full border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--accent-strong)] transition hover:bg-[rgba(244,211,141,0.16)]"
            >
              Project Empire README
            </a>
          </div>
        ) : null}

        {leaderPanelVisible ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-[60] flex p-4",
              isMobile ? "items-start justify-center p-2" : "items-center justify-center",
            )}
            style={
              isMobile
                ? {
                    paddingTop: mobileHudHeight > 0 ? mobileHudHeight + 16 : 80,
                  }
                : undefined
            }
          >
            <div
              data-map-interactive="true"
              className={cn(
                "panel-enter pointer-events-auto flex flex-col overflow-hidden rounded-[30px] border border-[rgba(244,211,141,0.18)] bg-[rgba(17,12,9,0.9)] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
                isMobile
                  ? "w-full max-h-[calc(100svh-6rem)] rounded-[22px]"
                  : "w-[min(40rem,calc(100%-3rem))] max-h-[calc(100vh-8rem)]",
                showLeader
                  ? "opacity-100 translate-y-0 scale-100 blur-0"
                  : "pointer-events-none opacity-0 -translate-y-2 scale-[0.985] blur-[2px]",
              )}
            >
            <div
              className={cn(
                "border-b border-white/10",
                isCompact
                  ? "flex flex-col gap-3 px-3 py-3"
                  : "flex items-start justify-between gap-4 px-4 py-3",
              )}
            >
              <div
                className={cn(
                  isCompact ? "flex items-center gap-3" : "flex items-start gap-4",
                )}
              >
                <Image
                  src={leader.avatar}
                  alt={leader.name}
                  width={640}
                  height={640}
                  className={cn(
                    "rounded-[20px] border border-white/10 object-cover",
                    isCompact ? "h-12 w-12 shrink-0 rounded-[16px]" : "h-16 w-16 rounded-[20px]",
                  )}
                  unoptimized
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "uppercase text-[var(--accent-strong)]",
                      isCompact
                        ? "text-[8px] tracking-[0.18em]"
                        : "text-[10px] tracking-[0.24em]",
                    )}
                  >
                    Leader Screen
                  </div>
                  <h2
                    className={cn(
                      "mt-1 font-display leading-none text-[var(--parchment)]",
                      isCompact ? "text-xl" : "mt-2 text-3xl",
                    )}
                  >
                    {leader.name}
                  </h2>
                  {!isCompact ? (
                    <p className="mt-2 text-[13px] leading-6 text-[var(--muted-soft)]">{leader.headline}</p>
                  ) : null}
                  {leader.currentRole && !isCompact ? (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">
                      Current office: {leader.currentRole}
                    </p>
                  ) : null}
                </div>
                {isCompact ? (
                  <OverlayButton
                    onClick={() => {
                      audio.playUiClick("close");
                      setShowLeader(false);
                    }}
                    className="min-h-8 shrink-0 px-2.5 py-1 text-[8px] tracking-[0.14em]"
                  >
                    Close
                  </OverlayButton>
                ) : null}
              </div>
              {isCompact ? (
                <div className="space-y-1">
                  <p className="text-[12px] leading-5 text-[var(--muted-soft)]">{leader.headline}</p>
                  {leader.currentRole ? (
                    <p className="text-[8px] uppercase tracking-[0.18em] text-[var(--muted)]">
                      Current office: {leader.currentRole}
                    </p>
                  ) : null}
                </div>
              ) : (
                <OverlayButton
                  onClick={() => {
                    audio.playUiClick("close");
                    setShowLeader(false);
                  }}
                  className="px-3 py-2 text-[10px]"
                >
                  Close
                </OverlayButton>
              )}
            </div>

            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                isCompact ? "px-3 py-3 pb-6" : "px-4 py-4 pb-6",
              )}
            >
            <p
              className={cn(
                "text-[var(--muted-soft)]",
                isCompact ? "text-[12px] leading-5" : "text-[13px] leading-6",
              )}
            >
              {leader.summary}
            </p>

            <div
              className={cn(
                "grid gap-3",
                isCompact ? "mt-3 grid-cols-2" : "mt-4 sm:grid-cols-3",
              )}
            >
              <div
                className={cn(
                  "rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)]",
                  isCompact ? "px-3 py-2" : "px-4 py-3",
                )}
              >
                <div
                  className={cn(
                    "uppercase text-[var(--muted)]",
                    isCompact
                      ? "text-[8px] tracking-[0.18em]"
                      : "text-[10px] tracking-[0.24em]",
                  )}
                >
                  Civilization
                </div>
                <div
                  className={cn(
                    "mt-1 text-[var(--parchment)]",
                    isCompact ? "text-[12px]" : "text-sm",
                  )}
                >
                  Builder-Technologist
                </div>
              </div>
              <div
                className={cn(
                  "rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)]",
                  isCompact ? "px-3 py-2" : "px-4 py-3",
                )}
              >
                <div
                  className={cn(
                    "uppercase text-[var(--muted)]",
                    isCompact
                      ? "text-[8px] tracking-[0.18em]"
                      : "text-[10px] tracking-[0.24em]",
                  )}
                >
                  Capital
                </div>
                <div
                  className={cn(
                    "mt-1 text-[var(--parchment)]",
                    isCompact ? "text-[12px]" : "text-sm",
                  )}
                >
                  Robot Future
                </div>
              </div>
              <div
                className={cn(
                  "rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)]",
                  isCompact ? "col-span-2 px-3 py-2" : "px-4 py-3",
                )}
              >
                <div
                  className={cn(
                    "uppercase text-[var(--muted)]",
                    isCompact
                      ? "text-[8px] tracking-[0.18em]"
                      : "text-[10px] tracking-[0.24em]",
                  )}
                >
                  Current Campaign
                </div>
                <div
                  className={cn(
                    "mt-1 text-[var(--parchment)]",
                    isCompact ? "text-[12px]" : "text-sm",
                  )}
                >
                  Agentic AI Systems
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Founding Principles</div>
              {leader.philosophy.map((item) => (
                <div
                  key={item}
                  className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 py-3 text-sm text-[var(--muted-soft)]"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Civilization Traits</div>
                {leader.featuredSkills.map((item) => (
                  <div key={item} className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 py-3 text-sm text-[var(--muted-soft)]">
                    {item}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">Historic Milestones</div>
                {leader.achievements.map((item) => (
                  <div key={item} className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.05)] px-4 py-3 text-sm text-[var(--muted-soft)]">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {leader.contactLinks.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[var(--accent)] bg-[rgba(244,211,141,0.08)] px-4 py-2 text-sm text-[var(--accent-strong)] transition hover:bg-[rgba(244,211,141,0.16)]"
                >
                  {link.label}
                </a>
              ))}
            </div>
            </div>
            </div>
          </div>
        ) : null}

        {selectedWorkPanel.present && selectedWorkPanel.retained ? (
          <div
            data-map-interactive="true"
            data-testid="city-popup"
            data-sheet-state={isCompact ? sheetState : "desktop"}
            className={cn(
              "panel-enter absolute z-30 flex flex-col overflow-hidden border border-[rgba(244,211,141,0.18)] bg-[rgba(16,11,9,0.86)] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-[opacity,transform,filter,height] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              isCompact
                ? "bottom-0 left-0 right-0 top-auto rounded-t-[22px] pb-[env(safe-area-inset-bottom)]"
                : "bottom-4 right-4 top-28 w-[min(440px,calc(100%-2rem))] rounded-[30px] lg:right-6 lg:top-24",
              selectedWork && selectedWorkVisible
                ? "pointer-events-auto opacity-100 translate-x-0 scale-100 blur-0"
                : "pointer-events-none opacity-0 translate-x-4 scale-[0.985] blur-[2px]",
            )}
            style={
              isCompact
                ? {
                    height: `calc(${getMobileSheetHeightRatio(sheetState) * 100}svh)`,
                    maxHeight: "calc(100svh - 1rem)",
                  }
                : undefined
            }
          >
            {isCompact ? (
              <MobileSheetHandle
                state={sheetState}
                onChange={setSheetState}
                onDismiss={closePanels}
              />
            ) : null}
            <div className={cn("flex items-center justify-between gap-3 border-b border-white/10", isCompact ? "px-4 pb-2 pt-1" : "px-5 py-3")}>
              <div className="min-w-0 flex-1">
                <div className={cn("uppercase text-[var(--accent-strong)]", isCompact ? "text-[10px] tracking-[0.18em]" : "text-[10px] tracking-[0.24em]")}>
                  City Management View
                </div>
                <h2 className={cn("mt-1 truncate font-display leading-none text-[var(--parchment)]", isCompact ? "text-xl" : "text-2xl sm:text-3xl")}>
                  {selectedWorkPanel.retained.title}
                </h2>
              </div>
              <OverlayButton
                onClick={closePanels}
                aria-label="Close city dossier"
                className={cn("shrink-0", isCompact ? "px-3 py-1.5 text-[10px]" : "px-3 py-2 text-[10px]")}
              >
                Close
              </OverlayButton>
            </div>
            <div
              data-testid="city-popup-body"
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                isCompact ? "px-4 py-3 pb-5" : "px-5 py-4 pb-5",
                sheetState === "peek" && isCompact ? "pointer-events-none opacity-50" : null,
              )}
            >
              <WorkDetail
                work={selectedWorkPanel.retained}
                github={selectedPanelGithub || undefined}
                cityLevel={selectedPanelCity?.level}
                mode="panel"
              />
            </div>
          </div>
        ) : hiddenWorkPanel.present && hiddenWorkPanel.retained ? (
          (() => {
            const retainedHiddenWork = hiddenWorkPanel.retained;

            return (
          <div
            data-map-interactive="true"
            data-testid="hidden-work-panel"
            className={cn(
              "panel-enter absolute z-30 rounded-[30px] border border-[rgba(244,211,141,0.18)] bg-[rgba(16,11,9,0.86)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-[opacity,transform,filter] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              isMobile
                ? mobileHudHeight > 0
                  ? "left-2 right-2 rounded-[22px] p-4"
                  : "left-2 right-2 top-28 rounded-[22px] p-4"
                : "right-4 top-28 w-[min(440px,calc(100%-2rem))]",
              selectedWork && !selectedWorkVisible
                ? "pointer-events-auto opacity-100 translate-x-0 scale-100 blur-0"
                : "pointer-events-none opacity-0 translate-x-4 scale-[0.985] blur-[2px]",
            )}
            style={
              isMobile && mobileHudHeight > 0
                ? { top: mobileHudHeight + 16 }
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                Not visible in {selectedYear}
              </div>
              <button
                type="button"
                aria-label="Close"
                data-testid="hidden-work-close"
                onClick={closePanels}
                className="pointer-events-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[rgba(14,10,8,0.7)] text-[14px] leading-none text-[var(--muted-soft)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)] active:scale-95"
              >
                ×
              </button>
            </div>
            <h2 className={cn("mt-3 font-display text-[var(--parchment)]", isMobile ? "text-2xl leading-tight" : "text-4xl")}>
              {retainedHiddenWork.title}
            </h2>
            <p className={cn("mt-3 text-[var(--muted-soft)]", isMobile ? "text-[13px] leading-6" : "text-sm leading-8")}>
              This city has not appeared in the selected era. Jump to its founding year or open the full dossier route directly.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <OverlayButton onClick={() => jumpToWorkYear(retainedHiddenWork)} active className={isMobile ? "min-h-9 text-[11px] tracking-[0.08em]" : undefined}>
                Jump to {retainedHiddenWork.startYear}
              </OverlayButton>
              <Link
                href={`/work/${retainedHiddenWork.slug}`}
                className={cn(
                  "rounded-full border border-white/10 uppercase text-[var(--muted-soft)]",
                  isMobile
                    ? "min-h-9 px-3 py-1.5 text-[11px] tracking-[0.08em] inline-flex items-center justify-center"
                    : "px-4 py-2 text-[11px] tracking-[0.24em]",
                )}
              >
                Open Dossier
              </Link>
            </div>
          </div>
            );
          })()
        ) : commandBriefVisible ? (
          <div
            className={cn(
              "panel-enter hud-drift absolute right-4 top-28 z-20 hidden max-w-sm rounded-[26px] border border-[rgba(244,211,141,0.14)] bg-[rgba(14,10,8,0.66)] px-5 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.26)] backdrop-blur-xl xl:block transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
              !selectedWork && !showLeader && !isTablet && !isShort
                ? "pointer-events-auto opacity-100 translate-y-0 scale-100 blur-0"
                : "pointer-events-none opacity-0 translate-y-2 scale-[0.985] blur-[2px]",
            )}
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--accent-strong)]">Command Brief</div>
            <div className="mt-2 font-display text-3xl text-[var(--parchment)]">Open a city to inspect the work.</div>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-soft)]">
              Hover for a quick read, click for the city management dossier, and scrub time to watch the empire grow.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
