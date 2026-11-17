"use client";

import { useCallback, useRef, useState } from "react";

/** A short two-tone chime from the Web Audio API. No asset file. Browsers need one click before audio can play. */
export function useAlertSound() {
  const [enabled, setEnabled] = useState(false);
  const ctx = useRef<AudioContext | null>(null);

  const play = useCallback(() => {
    if (!enabled) return;
    try {
      ctx.current ??= new AudioContext();
      const audio = ctx.current;
      const start = audio.currentTime;
      for (const [freq, at] of [
        [880, 0],
        [1320, 0.18],
      ] as const) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(0.2, start + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.3);
        osc.connect(gain).connect(audio.destination);
        osc.start(start + at);
        osc.stop(start + at + 0.32);
      }
    } catch {
      /* audio unavailable; the banner still shows */
    }
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) {
        try {
          ctx.current ??= new AudioContext();
          void ctx.current.resume();
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }, []);

  return { enabled, toggle, play };
}
