"use client";

import type { ButtonHTMLAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SiteConfig } from "@/lib/content/schema";
import { cn } from "@/lib/utils";

export type ParkedUnitState = {
  x: number;
  y: number;
  until: number;
};

export function useWorldAudio(audioConfig: SiteConfig["audio"]) {
  const [status, setStatus] = useState<"off" | "on" | "blocked">(
    audioConfig.enabledByDefault ? "on" : "off",
  );
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const hasUserInteractedRef = useRef(false);
  const ambientVolume = 0.09;

  const createAmbientAudio = useCallback(() => {
    const audio = new Audio(audioConfig.track);
    audio.loop = true;
    audio.volume = ambientVolume;
    audio.preload = "metadata";
    return audio;
  }, [ambientVolume, audioConfig.track]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const context = contextRef.current ?? new window.AudioContext();
    contextRef.current = context;

    if (context.state === "suspended") {
      await context.resume();
    }

    return context;
  }, []);

  const markUserInteracted = useCallback(() => {
    hasUserInteractedRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      musicRef.current?.pause();
      musicRef.current = null;
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleInteraction = () => {
      hasUserInteractedRef.current = true;
    };

    window.addEventListener("pointerdown", handleInteraction, { passive: true });
    window.addEventListener("keydown", handleInteraction);

    return () => {
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (!audioConfig.enabledByDefault || !audioConfig.track) {
      return;
    }

    let cancelled = false;

    async function startPlayback() {
      if (!musicRef.current) {
        musicRef.current = createAmbientAudio();
      }

      try {
        await musicRef.current.play();
        if (!cancelled) {
          setStatus("on");
        }
      } catch {
        if (!cancelled) {
          setStatus("blocked");
        }
      }
    }

    void startPlayback();

    return () => {
      cancelled = true;
    };
  }, [audioConfig.enabledByDefault, audioConfig.track, createAmbientAudio]);

  useEffect(() => {
    if (!audioConfig.enabledByDefault || !audioConfig.track || status !== "blocked") {
      return;
    }

    async function retryOnInteraction() {
      if (!musicRef.current) {
        musicRef.current = createAmbientAudio();
      }

      try {
        await musicRef.current.play();
        setStatus("on");
      } catch {
        // Keep blocked until the next interaction.
      }
    }

    const handler = () => {
      void retryOnInteraction();
    };

    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [audioConfig.enabledByDefault, audioConfig.track, createAmbientAudio, status]);

  const toggleMusic = useCallback(async () => {
    if (!audioConfig.track) {
      setStatus("blocked");
      return;
    }

    markUserInteracted();

    if (!musicRef.current) {
      musicRef.current = createAmbientAudio();
    }

    if (status === "on" && musicRef.current) {
      musicRef.current.pause();
      setStatus("off");
      return;
    }

    try {
      await musicRef.current?.play();
      setStatus("on");
    } catch {
      setStatus("blocked");
    }
  }, [audioConfig.track, createAmbientAudio, markUserInteracted, status]);

  const stopMusic = useCallback(() => {
    if (!musicRef.current) {
      return;
    }

    musicRef.current.pause();
    setStatus("off");
  }, []);

  const playUiClick = useCallback((kind: "button" | "toggle" | "city" | "close" | "troop" = "button") => {
    if (typeof window === "undefined") {
      return;
    }

    void (async () => {
      try {
        markUserInteracted();
        const context = await ensureAudioContext();
        if (!context) {
          return;
        }
        const now = context.currentTime;

        const master = context.createGain();
        master.gain.setValueAtTime(kind === "city" ? 0.07 : kind === "troop" ? 0.05 : 0.045, now);
        master.connect(context.destination);

        const body = context.createOscillator();
        const bodyGain = context.createGain();
        body.type = kind === "toggle" ? "sine" : kind === "troop" ? "square" : "triangle";
        body.frequency.setValueAtTime(
          kind === "city" ? 196 : kind === "troop" ? 330 : kind === "close" ? 520 : kind === "toggle" ? 720 : 620,
          now,
        );
        body.frequency.exponentialRampToValueAtTime(
          kind === "city" ? 148 : kind === "troop" ? 246 : kind === "close" ? 360 : kind === "toggle" ? 560 : 430,
          now + (kind === "city" ? 0.22 : kind === "troop" ? 0.18 : 0.14),
        );
        bodyGain.gain.setValueAtTime(0.0001, now);
        bodyGain.gain.exponentialRampToValueAtTime(kind === "city" ? 0.55 : kind === "troop" ? 0.32 : 0.36, now + 0.02);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "city" ? 0.24 : kind === "troop" ? 0.19 : 0.15));
        body.connect(bodyGain);
        bodyGain.connect(master);
        body.start(now);
        body.stop(now + (kind === "city" ? 0.26 : kind === "troop" ? 0.2 : 0.17));

        if (kind === "city") {
          const horn = context.createOscillator();
          const hornGain = context.createGain();
          horn.type = "sawtooth";
          horn.frequency.setValueAtTime(294, now + 0.03);
          horn.frequency.exponentialRampToValueAtTime(220, now + 0.22);
          hornGain.gain.setValueAtTime(0.0001, now + 0.02);
          hornGain.gain.exponentialRampToValueAtTime(0.18, now + 0.06);
          hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
          horn.connect(hornGain);
          hornGain.connect(master);
          horn.start(now + 0.02);
          horn.stop(now + 0.26);

          const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.12), context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let index = 0; index < data.length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
          }
          const rattle = context.createBufferSource();
          const filter = context.createBiquadFilter();
          const rattleGain = context.createGain();
          rattle.buffer = buffer;
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(820, now);
          filter.Q.value = 1.1;
          rattleGain.gain.setValueAtTime(0.0001, now);
          rattleGain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
          rattleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
          rattle.connect(filter);
          filter.connect(rattleGain);
          rattleGain.connect(master);
          rattle.start(now);
          rattle.stop(now + 0.12);
        }

        if (kind === "troop") {
          const snare = context.createBufferSource();
          const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.09), context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let index = 0; index < data.length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
          }
          const filter = context.createBiquadFilter();
          const snareGain = context.createGain();
          snare.buffer = buffer;
          filter.type = "highpass";
          filter.frequency.setValueAtTime(1200, now);
          snareGain.gain.setValueAtTime(0.0001, now);
          snareGain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
          snareGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
          snare.connect(filter);
          filter.connect(snareGain);
          snareGain.connect(master);
          snare.start(now + 0.01);
          snare.stop(now + 0.09);
        }
      } catch {
        // Ignore audio errors on unsupported browsers.
      }
    })();
  }, [ensureAudioContext, markUserInteracted]);

  const playIntroCue = useCallback((kind: "start" | "founding" | "complete" = "founding") => {
    if (typeof window === "undefined" || (!hasUserInteractedRef.current && status !== "on")) {
      return;
    }

    void (async () => {
      try {
        const context = await ensureAudioContext();
        if (!context) {
          return;
        }

        const master = context.createGain();
        const now = context.currentTime;
        master.gain.setValueAtTime(kind === "complete" ? 0.062 : kind === "start" ? 0.05 : 0.046, now);
        master.connect(context.destination);

        const body = context.createOscillator();
        const bodyGain = context.createGain();
        body.type = kind === "start" ? "triangle" : "triangle";
        body.frequency.setValueAtTime(kind === "complete" ? 220 : kind === "start" ? 196 : 164, now);
        body.frequency.exponentialRampToValueAtTime(kind === "complete" ? 330 : kind === "start" ? 294 : 220, now + 0.42);
        bodyGain.gain.setValueAtTime(0.0001, now);
        bodyGain.gain.exponentialRampToValueAtTime(kind === "start" ? 0.3 : 0.48, now + 0.03);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "start" ? 0.62 : 0.55));
        body.connect(bodyGain);
        bodyGain.connect(master);
        body.start(now);
        body.stop(now + (kind === "start" ? 0.66 : 0.58));

        const low = context.createOscillator();
        const lowGain = context.createGain();
        low.type = "sine";
        low.frequency.setValueAtTime(kind === "complete" ? 110 : kind === "start" ? 123 : 92, now);
        low.frequency.exponentialRampToValueAtTime(kind === "complete" ? 147 : kind === "start" ? 164 : 123, now + 0.34);
        lowGain.gain.setValueAtTime(0.0001, now);
        lowGain.gain.exponentialRampToValueAtTime(kind === "start" ? 0.16 : 0.19, now + 0.04);
        lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        low.connect(lowGain);
        lowGain.connect(master);
        low.start(now);
        low.stop(now + 0.4);

        const chime = context.createOscillator();
        const chimeGain = context.createGain();
        chime.type = "sine";
        chime.frequency.setValueAtTime(kind === "complete" ? 587 : kind === "start" ? 523 : 440, now + 0.08);
        chime.frequency.exponentialRampToValueAtTime(kind === "complete" ? 784 : kind === "start" ? 880 : 659, now + 0.38);
        chimeGain.gain.setValueAtTime(0.0001, now + 0.06);
        chimeGain.gain.exponentialRampToValueAtTime(kind === "start" ? 0.22 : 0.24, now + 0.12);
        chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "start" ? 0.56 : 0.5));
        chime.connect(chimeGain);
        chimeGain.connect(master);
        chime.start(now + 0.06);
        chime.stop(now + (kind === "start" ? 0.58 : 0.52));

        const sparkleTimes =
          kind === "complete"
            ? [0.12, 0.2, 0.3]
            : kind === "start"
              ? [0.12, 0.22, 0.32]
              : [0.18];
        sparkleTimes.forEach((offset, index) => {
          const sparkle = context.createOscillator();
          const sparkleGain = context.createGain();
          sparkle.type = "triangle";
          sparkle.frequency.setValueAtTime((kind === "complete" ? 880 : kind === "start" ? 988 : 740) + index * 110, now + offset);
          sparkle.frequency.exponentialRampToValueAtTime((kind === "complete" ? 1174 : kind === "start" ? 1318 : 988) + index * 96, now + offset + 0.12);
          sparkleGain.gain.setValueAtTime(0.0001, now + offset);
          sparkleGain.gain.exponentialRampToValueAtTime(kind === "founding" ? 0.08 : kind === "start" ? 0.13 : 0.11, now + offset + 0.02);
          sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
          sparkle.connect(sparkleGain);
          sparkleGain.connect(master);
          sparkle.start(now + offset);
          sparkle.stop(now + offset + 0.16);
        });

        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.22), context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) {
          data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
        }

        const noise = context.createBufferSource();
        const noiseFilter = context.createBiquadFilter();
        const noiseGain = context.createGain();
        noise.buffer = buffer;
        noiseFilter.type = "bandpass";
        noiseFilter.frequency.setValueAtTime(kind === "complete" ? 900 : kind === "start" ? 980 : 620, now);
        noiseFilter.Q.value = 0.9;
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.exponentialRampToValueAtTime(kind === "start" ? 0.09 : 0.16, now + 0.02);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "start" ? 0.26 : 0.2));
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(master);
        noise.start(now);
        noise.stop(now + (kind === "start" ? 0.28 : 0.22));

        if (kind !== "founding") {
          const pulseCount = kind === "complete" ? 3 : 2;
          for (let index = 0; index < pulseCount; index += 1) {
            const pulseTime = now + 0.08 + index * 0.12;
            const pulse = context.createOscillator();
            const pulseGain = context.createGain();
            pulse.type = "square";
            pulse.frequency.setValueAtTime(kind === "complete" ? 294 : 330, pulseTime);
            pulse.frequency.exponentialRampToValueAtTime(kind === "complete" ? 392 : 440, pulseTime + 0.08);
            pulseGain.gain.setValueAtTime(0.0001, pulseTime);
            pulseGain.gain.exponentialRampToValueAtTime(0.07, pulseTime + 0.01);
            pulseGain.gain.exponentialRampToValueAtTime(0.0001, pulseTime + 0.1);
            pulse.connect(pulseGain);
            pulseGain.connect(master);
            pulse.start(pulseTime);
            pulse.stop(pulseTime + 0.11);
          }
        }
      } catch {
        // Ignore audio errors on unsupported browsers.
      }
    })();
  }, [ensureAudioContext, status]);

  const playIntroTransition = useCallback(() => {
    if (typeof window === "undefined" || (!hasUserInteractedRef.current && status !== "on")) {
      return;
    }

    void (async () => {
      try {
        const context = await ensureAudioContext();
        if (!context) {
          return;
        }

        const now = context.currentTime;
        const master = context.createGain();
        master.gain.setValueAtTime(0.048, now);
        master.connect(context.destination);

        const swell = context.createOscillator();
        const swellGain = context.createGain();
        swell.type = "triangle";
        swell.frequency.setValueAtTime(392, now);
        swell.frequency.exponentialRampToValueAtTime(220, now + 0.42);
        swellGain.gain.setValueAtTime(0.0001, now);
        swellGain.gain.exponentialRampToValueAtTime(0.28, now + 0.04);
        swellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
        swell.connect(swellGain);
        swellGain.connect(master);
        swell.start(now);
        swell.stop(now + 0.5);

        const horn = context.createOscillator();
        const hornGain = context.createGain();
        horn.type = "sawtooth";
        horn.frequency.setValueAtTime(659, now + 0.04);
        horn.frequency.exponentialRampToValueAtTime(440, now + 0.28);
        hornGain.gain.setValueAtTime(0.0001, now + 0.03);
        hornGain.gain.exponentialRampToValueAtTime(0.16, now + 0.08);
        hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
        horn.connect(hornGain);
        hornGain.connect(master);
        horn.start(now + 0.03);
        horn.stop(now + 0.36);

        [0.06, 0.14].forEach((offset, index) => {
          const sparkle = context.createOscillator();
          const sparkleGain = context.createGain();
          sparkle.type = "sine";
          sparkle.frequency.setValueAtTime(1046 - index * 132, now + offset);
          sparkle.frequency.exponentialRampToValueAtTime(784 - index * 98, now + offset + 0.1);
          sparkleGain.gain.setValueAtTime(0.0001, now + offset);
          sparkleGain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.015);
          sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12);
          sparkle.connect(sparkleGain);
          sparkleGain.connect(master);
          sparkle.start(now + offset);
          sparkle.stop(now + offset + 0.13);
        });
      } catch {
        // Ignore audio errors on unsupported browsers.
      }
    })();
  }, [ensureAudioContext, status]);

  const playWorldEventCue = useCallback((kind: "storm" | "battle" | "greatLeader" | "invention" | "festival" | "trade" | "discovery" | "sabotage") => {
    if (typeof window === "undefined") {
      return;
    }

    void (async () => {
      try {
        markUserInteracted();
        const context = await ensureAudioContext();
        if (!context) {
          return;
        }

        const now = context.currentTime;
        const master = context.createGain();
        master.gain.setValueAtTime(
          kind === "storm"
            ? 0.16
            : kind === "battle"
              ? 0.18
              : kind === "sabotage"
                ? 0.17
                : kind === "greatLeader" || kind === "festival"
                  ? 0.16
                  : 0.15,
          now,
        );
        master.connect(context.destination);

        const alertTimes = kind === "battle" ? [0, 0.12, 0.24] : [0, 0.16];
        alertTimes.forEach((offset, index) => {
          const alert = context.createOscillator();
          const alertGain = context.createGain();
          alert.type = kind === "storm" ? "triangle" : "sawtooth";
          alert.frequency.setValueAtTime(kind === "greatLeader" ? 392 + index * 98 : kind === "invention" ? 523 + index * 131 : 220 + index * 74, now + offset);
          alert.frequency.exponentialRampToValueAtTime(kind === "greatLeader" ? 587 + index * 132 : kind === "invention" ? 784 + index * 165 : 164 + index * 54, now + offset + 0.16);
          alertGain.gain.setValueAtTime(0.0001, now + offset);
          alertGain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
          alertGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
          alert.connect(alertGain);
          alertGain.connect(master);
          alert.start(now + offset);
          alert.stop(now + offset + 0.2);
        });

        if (kind === "storm") {
          const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.9), context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let index = 0; index < data.length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / data.length * 0.4);
          }

          const wind = context.createBufferSource();
          const windFilter = context.createBiquadFilter();
          const windGain = context.createGain();
          wind.buffer = buffer;
          windFilter.type = "bandpass";
          windFilter.frequency.setValueAtTime(420, now);
          windFilter.frequency.exponentialRampToValueAtTime(260, now + 0.7);
          windFilter.Q.value = 0.6;
          windGain.gain.setValueAtTime(0.0001, now);
          windGain.gain.exponentialRampToValueAtTime(0.2, now + 0.08);
          windGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
          wind.connect(windFilter);
          windFilter.connect(windGain);
          windGain.connect(master);
          wind.start(now);
          wind.stop(now + 0.84);

          const thunder = context.createOscillator();
          const thunderGain = context.createGain();
          thunder.type = "triangle";
          thunder.frequency.setValueAtTime(86, now + 0.06);
          thunder.frequency.exponentialRampToValueAtTime(44, now + 0.48);
          thunderGain.gain.setValueAtTime(0.0001, now + 0.04);
          thunderGain.gain.exponentialRampToValueAtTime(0.24, now + 0.08);
          thunderGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.54);
          thunder.connect(thunderGain);
          thunderGain.connect(master);
          thunder.start(now + 0.04);
          thunder.stop(now + 0.58);

          const crackBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.08), context.sampleRate);
          const crackData = crackBuffer.getChannelData(0);
          for (let index = 0; index < crackData.length; index += 1) {
            crackData[index] = (Math.random() * 2 - 1) * (1 - index / crackData.length);
          }
          const crack = context.createBufferSource();
          const crackFilter = context.createBiquadFilter();
          const crackGain = context.createGain();
          crack.buffer = crackBuffer;
          crackFilter.type = "highpass";
          crackFilter.frequency.setValueAtTime(1800, now + 0.18);
          crackGain.gain.setValueAtTime(0.0001, now + 0.18);
          crackGain.gain.exponentialRampToValueAtTime(0.17, now + 0.195);
          crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
          crack.connect(crackFilter);
          crackFilter.connect(crackGain);
          crackGain.connect(master);
          crack.start(now + 0.18);
          crack.stop(now + 0.27);

          return;
        }

        if (kind === "battle") {
          const drumTimes = [0, 0.14, 0.31];
          drumTimes.forEach((offset, index) => {
            const impact = context.createOscillator();
            const impactGain = context.createGain();
            impact.type = index === 2 ? "triangle" : "square";
            impact.frequency.setValueAtTime(index === 2 ? 132 : 92, now + offset);
            impact.frequency.exponentialRampToValueAtTime(48, now + offset + 0.12);
            impactGain.gain.setValueAtTime(0.0001, now + offset);
            impactGain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.012);
            impactGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
            impact.connect(impactGain);
            impactGain.connect(master);
            impact.start(now + offset);
            impact.stop(now + offset + 0.14);
          });

          const horn = context.createOscillator();
          const hornGain = context.createGain();
          horn.type = "sawtooth";
          horn.frequency.setValueAtTime(220, now + 0.02);
          horn.frequency.exponentialRampToValueAtTime(165, now + 0.28);
          hornGain.gain.setValueAtTime(0.0001, now + 0.01);
          hornGain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
          hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
          horn.connect(hornGain);
          hornGain.connect(master);
          horn.start(now + 0.01);
          horn.stop(now + 0.34);

          const snare = context.createBufferSource();
          const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.12), context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let index = 0; index < data.length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
          }
          const filter = context.createBiquadFilter();
          const snareGain = context.createGain();
          snare.buffer = buffer;
          filter.type = "highpass";
          filter.frequency.setValueAtTime(1400, now + 0.16);
          snareGain.gain.setValueAtTime(0.0001, now + 0.16);
          snareGain.gain.exponentialRampToValueAtTime(0.1, now + 0.18);
          snareGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
          snare.connect(filter);
          filter.connect(snareGain);
          snareGain.connect(master);
          snare.start(now + 0.16);
          snare.stop(now + 0.26);

          const clang = context.createOscillator();
          const clangGain = context.createGain();
          clang.type = "triangle";
          clang.frequency.setValueAtTime(1180, now + 0.08);
          clang.frequency.exponentialRampToValueAtTime(620, now + 0.34);
          clangGain.gain.setValueAtTime(0.0001, now + 0.07);
          clangGain.gain.exponentialRampToValueAtTime(0.16, now + 0.1);
          clangGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
          clang.connect(clangGain);
          clangGain.connect(master);
          clang.start(now + 0.07);
          clang.stop(now + 0.4);

          return;
        }

        if (kind === "greatLeader") {
          const brass = context.createOscillator();
          const brassGain = context.createGain();
          brass.type = "sawtooth";
          brass.frequency.setValueAtTime(196, now);
          brass.frequency.exponentialRampToValueAtTime(294, now + 0.34);
          brassGain.gain.setValueAtTime(0.0001, now);
          brassGain.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
          brassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
          brass.connect(brassGain);
          brassGain.connect(master);
          brass.start(now);
          brass.stop(now + 0.42);

          const body = context.createOscillator();
          const bodyGain = context.createGain();
          body.type = "triangle";
          body.frequency.setValueAtTime(294, now + 0.02);
          body.frequency.exponentialRampToValueAtTime(392, now + 0.28);
          bodyGain.gain.setValueAtTime(0.0001, now + 0.01);
          bodyGain.gain.exponentialRampToValueAtTime(0.14, now + 0.05);
          bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
          body.connect(bodyGain);
          bodyGain.connect(master);
          body.start(now + 0.01);
          body.stop(now + 0.36);

          [0.08, 0.18].forEach((offset, index) => {
            const bell = context.createOscillator();
            const bellGain = context.createGain();
            bell.type = "sine";
            bell.frequency.setValueAtTime(784 + index * 98, now + offset);
            bell.frequency.exponentialRampToValueAtTime(1046 + index * 110, now + offset + 0.16);
            bellGain.gain.setValueAtTime(0.0001, now + offset);
            bellGain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.015);
            bellGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
            bell.connect(bellGain);
            bellGain.connect(master);
            bell.start(now + offset);
            bell.stop(now + offset + 0.2);
          });

          [0, 0.14, 0.28].forEach((offset, index) => {
            const fanfare = context.createOscillator();
            const fanfareGain = context.createGain();
            fanfare.type = "sawtooth";
            fanfare.frequency.setValueAtTime([262, 330, 392][index] ?? 392, now + offset);
            fanfare.frequency.exponentialRampToValueAtTime([330, 392, 523][index] ?? 523, now + offset + 0.16);
            fanfareGain.gain.setValueAtTime(0.0001, now + offset);
            fanfareGain.gain.exponentialRampToValueAtTime(0.11, now + offset + 0.025);
            fanfareGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
            fanfare.connect(fanfareGain);
            fanfareGain.connect(master);
            fanfare.start(now + offset);
            fanfare.stop(now + offset + 0.2);
          });

          return;
        }

        if (kind === "festival") {
          [0, 0.1, 0.2, 0.32].forEach((offset, index) => {
            const bell = context.createOscillator();
            const bellGain = context.createGain();
            bell.type = "sine";
            bell.frequency.setValueAtTime([523, 659, 784, 1046][index] ?? 1046, now + offset);
            bell.frequency.exponentialRampToValueAtTime([659, 784, 1046, 1318][index] ?? 1318, now + offset + 0.14);
            bellGain.gain.setValueAtTime(0.0001, now + offset);
            bellGain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.018);
            bellGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.17);
            bell.connect(bellGain);
            bellGain.connect(master);
            bell.start(now + offset);
            bell.stop(now + offset + 0.18);
          });

          const drum = context.createOscillator();
          const drumGain = context.createGain();
          drum.type = "triangle";
          drum.frequency.setValueAtTime(132, now + 0.02);
          drum.frequency.exponentialRampToValueAtTime(92, now + 0.34);
          drumGain.gain.setValueAtTime(0.0001, now + 0.02);
          drumGain.gain.exponentialRampToValueAtTime(0.13, now + 0.05);
          drumGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
          drum.connect(drumGain);
          drumGain.connect(master);
          drum.start(now + 0.02);
          drum.stop(now + 0.4);

          return;
        }

        if (kind === "trade") {
          [0, 0.13, 0.26].forEach((offset, index) => {
            const hoof = context.createOscillator();
            const hoofGain = context.createGain();
            hoof.type = "square";
            hoof.frequency.setValueAtTime(156 - index * 12, now + offset);
            hoof.frequency.exponentialRampToValueAtTime(96, now + offset + 0.08);
            hoofGain.gain.setValueAtTime(0.0001, now + offset);
            hoofGain.gain.exponentialRampToValueAtTime(0.11, now + offset + 0.012);
            hoofGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.09);
            hoof.connect(hoofGain);
            hoofGain.connect(master);
            hoof.start(now + offset);
            hoof.stop(now + offset + 0.1);
          });

          [0.08, 0.2].forEach((offset, index) => {
            const coin = context.createOscillator();
            const coinGain = context.createGain();
            coin.type = "triangle";
            coin.frequency.setValueAtTime(880 + index * 220, now + offset);
            coin.frequency.exponentialRampToValueAtTime(1320 + index * 180, now + offset + 0.16);
            coinGain.gain.setValueAtTime(0.0001, now + offset);
            coinGain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.012);
            coinGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
            coin.connect(coinGain);
            coinGain.connect(master);
            coin.start(now + offset);
            coin.stop(now + offset + 0.2);
          });

          return;
        }

        if (kind === "discovery") {
          const sweep = context.createOscillator();
          const sweepGain = context.createGain();
          sweep.type = "sine";
          sweep.frequency.setValueAtTime(294, now);
          sweep.frequency.exponentialRampToValueAtTime(1174, now + 0.58);
          sweepGain.gain.setValueAtTime(0.0001, now);
          sweepGain.gain.exponentialRampToValueAtTime(0.16, now + 0.04);
          sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
          sweep.connect(sweepGain);
          sweepGain.connect(master);
          sweep.start(now);
          sweep.stop(now + 0.64);

          [0.18, 0.3, 0.42].forEach((offset, index) => {
            const sparkle = context.createOscillator();
            const sparkleGain = context.createGain();
            sparkle.type = "triangle";
            sparkle.frequency.setValueAtTime(740 + index * 147, now + offset);
            sparkle.frequency.exponentialRampToValueAtTime(988 + index * 196, now + offset + 0.12);
            sparkleGain.gain.setValueAtTime(0.0001, now + offset);
            sparkleGain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.015);
            sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
            sparkle.connect(sparkleGain);
            sparkleGain.connect(master);
            sparkle.start(now + offset);
            sparkle.stop(now + offset + 0.16);
          });

          return;
        }

        if (kind === "sabotage") {
          const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.22), context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let index = 0; index < data.length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
          }

          const hiss = context.createBufferSource();
          const hissFilter = context.createBiquadFilter();
          const hissGain = context.createGain();
          hiss.buffer = buffer;
          hissFilter.type = "highpass";
          hissFilter.frequency.setValueAtTime(1600, now);
          hissGain.gain.setValueAtTime(0.0001, now);
          hissGain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
          hissGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
          hiss.connect(hissFilter);
          hissFilter.connect(hissGain);
          hissGain.connect(master);
          hiss.start(now);
          hiss.stop(now + 0.22);

          const thump = context.createOscillator();
          const thumpGain = context.createGain();
          thump.type = "sawtooth";
          thump.frequency.setValueAtTime(118, now + 0.14);
          thump.frequency.exponentialRampToValueAtTime(46, now + 0.42);
          thumpGain.gain.setValueAtTime(0.0001, now + 0.12);
          thumpGain.gain.exponentialRampToValueAtTime(0.22, now + 0.16);
          thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
          thump.connect(thumpGain);
          thumpGain.connect(master);
          thump.start(now + 0.12);
          thump.stop(now + 0.5);

          return;
        }

        const bed = context.createOscillator();
        const bedGain = context.createGain();
        bed.type = "triangle";
        bed.frequency.setValueAtTime(220, now);
        bed.frequency.exponentialRampToValueAtTime(330, now + 0.22);
        bedGain.gain.setValueAtTime(0.0001, now);
        bedGain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
        bedGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        bed.connect(bedGain);
        bedGain.connect(master);
        bed.start(now);
        bed.stop(now + 0.3);

        const sweep = context.createOscillator();
        const sweepGain = context.createGain();
        sweep.type = "sawtooth";
        sweep.frequency.setValueAtTime(176, now);
        sweep.frequency.exponentialRampToValueAtTime(880, now + 0.52);
        sweepGain.gain.setValueAtTime(0.0001, now);
        sweepGain.gain.exponentialRampToValueAtTime(0.1, now + 0.05);
        sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);
        sweep.connect(sweepGain);
        sweepGain.connect(master);
        sweep.start(now);
        sweep.stop(now + 0.58);

        [0, 0.09, 0.18].forEach((offset, index) => {
          const sparkle = context.createOscillator();
          const sparkleGain = context.createGain();
          sparkle.type = "sine";
          sparkle.frequency.setValueAtTime(440 + index * 165, now + offset);
          sparkle.frequency.exponentialRampToValueAtTime(660 + index * 220, now + offset + 0.12);
          sparkleGain.gain.setValueAtTime(0.0001, now + offset);
          sparkleGain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.015);
          sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
          sparkle.connect(sparkleGain);
          sparkleGain.connect(master);
          sparkle.start(now + offset);
          sparkle.stop(now + offset + 0.17);
        });
      } catch {
        // Ignore audio errors on unsupported browsers.
      }
    })();
  }, [ensureAudioContext, markUserInteracted]);

  return useMemo(
    () => ({ status, stopMusic, toggleMusic, playUiClick, playIntroCue, playIntroTransition, playWorldEventCue }),
    [playIntroCue, playIntroTransition, playUiClick, playWorldEventCue, status, stopMusic, toggleMusic],
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function isInteractiveMapTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "button",
        "a",
        "input",
        "select",
        "textarea",
        "[role='button']",
        "[data-map-interactive='true']",
      ].join(", "),
    ),
  );
}

export function OverlayButton({
  active = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "pointer-events-auto relative z-10 inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition",
        active
          ? "border-[var(--accent)] bg-[rgba(244,211,141,0.14)] text-[var(--accent-strong)]"
          : "border-white/12 bg-[rgba(255,255,255,0.06)] text-[var(--muted-soft)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]",
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-[rgba(12,10,9,0.62)] px-4 py-3 shadow-[0_18px_35px_rgba(0,0,0,0.22)] backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-display text-2xl leading-none text-[var(--parchment)]">{value}</div>
    </div>
  );
}

export function usePresence(active: boolean, duration = 220) {
  const [present, setPresent] = useState(active);

  useEffect(() => {
    if (active) {
      const enter = window.setTimeout(() => setPresent(true), 16);
      return () => window.clearTimeout(enter);
    }

    const timeout = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timeout);
  }, [active, duration]);

  return present;
}

export function useRetainedPresence<T>(value: T | null, active: boolean, duration = 220) {
  const present = usePresence(active, duration);
  const [retained, setRetained] = useState<T | null>(value);

  useEffect(() => {
    if (active && value) {
      const enter = window.setTimeout(() => setRetained(value), 16);
      return () => window.clearTimeout(enter);
    }

    if (!present) {
      const clear = window.setTimeout(() => setRetained(null), 0);
      return () => window.clearTimeout(clear);
    }
  }, [active, present, value]);

  return { present, retained };
}

export function ToolUnitSprite({
  type,
  color,
  label,
  active = false,
  onWater = false,
}: {
  type: SiteConfig["scene"]["toolUnits"][number]["type"];
  color: string;
  label: string;
  active?: boolean;
  onWater?: boolean;
}) {
  return (
    <g className={cn("unit-float", active ? "unit-focus" : null)} opacity={active ? "1" : "0.82"}>
      <title>{label}</title>
      {onWater ? (
        <>
          <ellipse cx="0" cy="12.5" rx="15" ry="4.8" fill="rgba(7,14,22,0.34)" />
          <path d="M -15 11 C -10 14 -4 15 0 15 C 4 15 10 14 15 11" fill="rgba(129,194,226,0.18)" />
          <path
            d="M -12 8.5 L 0 11.5 L 12 8.5 L 8 14.5 L -8 14.5 Z"
            fill="rgba(58,79,96,0.92)"
            stroke="rgba(166,214,240,0.42)"
            strokeWidth="0.9"
          />
          <path d="M -2 10.5 L -2 0.5" stroke="rgba(217,201,161,0.78)" strokeWidth="1" strokeLinecap="round" />
          <path d="M -2 0.5 L 6 4.5 L -2 7.5 Z" fill="rgba(236,226,188,0.76)" />
        </>
      ) : null}
      <ellipse cx="0" cy="11" rx="12" ry="4.8" fill="rgba(0,0,0,0.22)" />
      <path
        d="M -5 10 C -6 3 -3 -4 0 -4 C 3 -4 6 3 5 10 Z"
        fill="rgba(20,15,11,0.84)"
        stroke={color}
        strokeOpacity="0.68"
        strokeWidth="1"
      />
      <circle cx="0" cy="-7" r="3.8" fill="#f3d9be" stroke="rgba(54,30,18,0.4)" strokeWidth="0.6" />

      {type === "trader" ? (
        <>
          <rect x="-9" y="-1" width="5" height="7" rx="1.5" fill={color} fillOpacity="0.82" />
          <path d="M 6 10 L 10 2 L 14 10 Z" fill={color} fillOpacity="0.8" />
          <circle cx="10" cy="10" r="2.1" fill="rgba(17,12,9,0.8)" />
        </>
      ) : null}

      {type === "army" ? (
        <>
          <path d="M 7 -2 L 12 10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 9 -2 L 14 0 L 10 3 Z" fill={color} />
          <circle cx="-9" cy="4" r="3.3" fill="rgba(24,18,14,0.88)" stroke={color} strokeWidth="1.1" />
        </>
      ) : null}

      {type === "builder" ? (
        <>
          <rect x="-9" y="2" width="5" height="6" rx="1.2" fill={color} fillOpacity="0.76" />
          <path d="M 6 0 L 11 -4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 10 -6 L 13 -3 L 8 -1 Z" fill={color} />
        </>
      ) : null}

      {type === "scholar" ? (
        <>
          <path d="M 8 10 L 8 -1" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8" cy="-3.5" r="1.9" fill={color} />
          <rect x="-10" y="0" width="6" height="4.4" rx="1.1" fill={color} fillOpacity="0.72" />
        </>
      ) : null}

      {type === "robot" ? (
        <>
          <rect x="-6" y="-2" width="12" height="10" rx="2.6" fill={color} fillOpacity="0.86" />
          <rect x="-4.4" y="-12" width="8.8" height="8" rx="2.2" fill="rgba(20,15,11,0.92)" stroke={color} strokeWidth="1" />
          <circle cx="-1.6" cy="-8" r="1.2" fill={color} />
          <circle cx="1.6" cy="-8" r="1.2" fill={color} />
          <path d="M -8 -1 L -12 4 M 8 -1 L 12 4 M -3 8 L -5 13 M 3 8 L 5 13" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M 0 -12 L 0 -16" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="0" cy="-17" r="1.4" fill={color} />
        </>
      ) : null}

      {type === "scout" ? (
        <>
          <path d="M -9 6 L 0 -10 L 9 6 Z" fill={color} fillOpacity="0.82" />
          <path d="M -1 -4 L 8 -12" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="9.5" cy="-13" r="1.8" fill={color} />
          <rect x="-2.4" y="6" width="4.8" height="6" rx="1.4" fill="rgba(20,15,11,0.78)" stroke={color} strokeWidth="0.8" />
        </>
      ) : null}

      {type === "sage" ? (
        <>
          <path d="M -7 8 C -7 -2 -3 -8 0 -8 C 3 -8 7 -2 7 8 Z" fill={color} fillOpacity="0.78" />
          <path d="M -2 -12 C -2 -15 2 -15 2 -12" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
          <circle cx="0" cy="-14" r="1.9" fill={color} />
          <path d="M 9 8 L 9 -4" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="9" cy="-6.5" r="1.8" fill={color} />
        </>
      ) : null}

      {type === "horse" ? (
        <>
          <path d="M -10 5 C -9 -2 -4 -7 3 -7 C 8 -7 11 -4 11 0 C 11 4 9 6 5 7 L -1 8 Z" fill={color} fillOpacity="0.84" />
          <path d="M 2 -6 L 7 -12 L 10 -10 L 7 -4" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M -6 8 L -7 14 M -1 8 L -1 14 M 5 8 L 6 14 M 9 5 L 10 12" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
          <path d="M -10 2 L -14 0" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
        </>
      ) : null}

      {type === "archer" ? (
        <>
          <circle cx="0" cy="-9" r="2.1" fill={color} />
          <path d="M 0 -6 L 0 4 M -6 -1 L 4 -3 M -1 4 L -4 12 M 1 4 L 5 12" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
          <path d="M 7 -7 C 11 -3 11 3 7 7" fill="none" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
          <path d="M 3 -4 L 10 -1" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
        </>
      ) : null}

      {type === "camel-trader" ? (
        <>
          <path d="M -12 6 C -11 1 -8 -2 -4 -2 C -2 -8 3 -8 4 -2 C 8 -3 12 0 12 5 C 12 8 9 10 4 10 L -4 10 C -9 10 -12 9 -12 6 Z" fill={color} fillOpacity="0.84" />
          <circle cx="10" cy="-2.5" r="2" fill={color} />
          <path d="M -8 10 L -9 15 M -2 10 L -2 15 M 4 10 L 5 15 M 9 9 L 10 15" stroke={color} strokeWidth="1.15" strokeLinecap="round" />
          <rect x="-3.5" y="0.5" width="7" height="5" rx="1.2" fill="rgba(18,12,9,0.78)" stroke={color} strokeWidth="0.8" />
        </>
      ) : null}
    </g>
  );
}

export function ImprovementTile({
  kind,
  label,
  tone,
}: {
  kind: "farm" | "academy" | "workshop" | "harbor";
  label: string;
  tone: string;
}) {
  return (
    <g>
      <title>{label}</title>
      <ellipse cx="0" cy="14" rx="16" ry="6" fill="rgba(7,4,3,0.24)" />
      <rect x="-14" y="-2" width="28" height="18" rx="5" fill="rgba(18,12,9,0.66)" stroke={tone} strokeOpacity="0.45" />
      {kind === "farm" ? (
        <>
          <path d="M -8 9 L -8 1 M -2 9 L -2 -1 M 4 9 L 4 1 M 10 9 L 10 -1" stroke={tone} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M -11 3 C -6 -1 3 -1 11 3" fill="none" stroke={tone} strokeOpacity="0.6" strokeWidth="1.2" />
        </>
      ) : null}
      {kind === "academy" ? (
        <>
          <path d="M -9 8 L 0 -5 L 9 8 Z" fill={tone} fillOpacity="0.72" />
          <rect x="-2.2" y="1" width="4.4" height="8" rx="1" fill="#f7e8c7" />
        </>
      ) : null}
      {kind === "workshop" ? (
        <>
          <rect x="-8" y="0" width="16" height="8" rx="2" fill={tone} fillOpacity="0.68" />
          <path d="M 2 -5 L 8 -10" stroke={tone} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 7 -12 L 11 -8 L 5 -6 Z" fill={tone} />
        </>
      ) : null}
      {kind === "harbor" ? (
        <>
          <path d="M -10 9 C -4 4 4 4 10 9" fill="none" stroke={tone} strokeWidth="1.3" />
          <path d="M -3 7 L 0 -2 L 3 7 Z" fill={tone} fillOpacity="0.78" />
        </>
      ) : null}
    </g>
  );
}

export function getTravelerFlavor(label: string, type: string) {
  const key = label.toLowerCase();

  if (key.includes("gstack")) return "Arrives with a clipboard, a benchmark, and three opinions you did not ask for.";
  if (key.includes("codex")) return "Travels fast, reviews harshly, and somehow still ships before sunset.";
  if (key.includes("slack")) return "Moves rumors, approvals, and the occasional urgent message between capitals.";
  if (key.includes("openai")) return "Carries prompts, prototypes, and suspiciously strong opinions about tool use.";
  if (key.includes("ibm bob")) return "An old enterprise sage who remembers every workaround and none of the meetings.";
  if (key.includes("robot courier")) return "Delivers polished automations with the emotional range of a premium toaster.";
  if (key.includes("agent scout")) return "Ranges ahead of the empire looking for the next strange and useful capability.";
  if (key.includes("oracle sage")) return "Speaks in architecture notes, product instincts, and mildly prophetic roadmaps.";
  if (key.includes("horse")) return "Covers ground fast, carries urgency well, and refuses to attend status meetings.";
  if (key.includes("archer")) return "Keeps bugs at range and somehow still lands the shot from two tiles out.";
  if (key.includes("camel")) return "Crosses dry stretches of the roadmap with supplies, patience, and mild judgment.";
  if (key.includes("vs code")) return "Brings tabs, snippets, and the quiet confidence of a tool opened all day.";

  if (type === "trader") return "Keeps the empire supplied with tools, habits, and improbable productivity gains.";
  if (type === "army") return "A disciplined unit deployed wherever bugs, complexity, or chaos start gathering.";
  if (type === "builder") return "Raises scaffolds, systems, and entirely new districts wherever work needs structure.";
  if (type === "scholar") return "Studies the frontier, then returns with cleaner abstractions and worse sleep.";
  if (type === "robot") return "Executes the boring parts cheerfully so the humans can chase harder problems.";
  if (type === "scout") return "Tests the fog of war for new territory, new tools, and new obsessions.";
  if (type === "sage") return "Turns experience into doctrine and doctrine into suspiciously practical advice.";
  if (type === "horse") return "A fast rider carrying momentum, instincts, and one very urgent feature request.";
  if (type === "archer") return "A ranged specialist trained to strike cleanly before problems can close the gap.";
  if (type === "camel-trader") return "A long-haul trader built for difficult terrain, odd integrations, and dry humor.";

  return "A roaming specialist carrying skills, systems, and a little local mythology between cities.";
}

export function getImprovementKind(label: string) {
  const key = label.toLowerCase();
  if (key.includes("ai") || key.includes("agentic") || key.includes("openai")) return "academy" as const;
  if (key.includes("react") || key.includes("next") || key.includes("express") || key.includes("typescript")) return "workshop" as const;
  if (key.includes("youtube") || key.includes("video") || key.includes("publishing")) return "harbor" as const;
  return "farm" as const;
}

export function getRoutePoint(
  routeCities: Array<{ x: number; y: number }>,
  speed: number,
  timeMs: number,
) {
  const segments = routeCities.slice(1).map((city, index) => {
    const from = routeCities[index];
    const dx = city.x - from.x;
    const dy = city.y - from.y;
    const length = Math.hypot(dx, dy);

    return { from, to: city, dx, dy, length };
  });

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength === 0) {
    const origin = routeCities[0];
    return { x: origin.x, y: origin.y, angle: 0 };
  }

  const distance = ((timeMs / 1000) * 26 * speed) % totalLength;
  let traveled = 0;

  for (const segment of segments) {
    if (distance <= traveled + segment.length) {
      const progress = (distance - traveled) / segment.length;
      return {
        x: segment.from.x + segment.dx * progress,
        y: segment.from.y + segment.dy * progress,
        angle: Math.atan2(segment.dy, segment.dx),
      };
    }
    traveled += segment.length;
  }

  const fallback = segments[segments.length - 1];
  return { x: fallback.to.x, y: fallback.to.y, angle: Math.atan2(fallback.dy, fallback.dx) };
}
