export type HudAccent = "cyan" | "red" | "gold" | "emerald" | "purple";
export type ReactorStyle = "ring" | "sphere" | "wire";
export type HudScreenEffect = "none" | "glitch" | "pulse" | "scan" | "shake" | "flash";

export interface HudVisualState {
  accent: HudAccent;
  style: ReactorStyle;
  effect: HudScreenEffect;
}

export const ACCENT_RGB: Record<HudAccent, { main: [number, number, number]; hot: [number, number, number]; css: string }> = {
  cyan: { main: [0.13, 0.83, 0.93], hot: [0.4, 0.91, 0.98], css: "#22d3ee" },
  red: { main: [0.97, 0.32, 0.32], hot: [1.0, 0.62, 0.44], css: "#f87171" },
  gold: { main: [0.98, 0.75, 0.14], hot: [1.0, 0.88, 0.48], css: "#fbbf24" },
  emerald: { main: [0.2, 0.83, 0.6], hot: [0.43, 0.91, 0.72], css: "#34d399" },
  purple: { main: [0.66, 0.55, 0.98], hot: [0.85, 0.71, 0.99], css: "#a78bfa" }
};

type Listener = () => void;

let state: HudVisualState = {
  accent: "cyan",
  style: "ring",
  effect: "none"
};

let effectTimer: number | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export const hudEffectsStore = {
  get: (): HudVisualState => state,
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setAccent: (accent: HudAccent) => {
    if (state.accent === accent) return;
    state = { ...state, accent };
    emit();
  },
  setStyle: (style: ReactorStyle) => {
    if (state.style === style) return;
    state = { ...state, style };
    emit();
  },
  triggerEffect: (effect: HudScreenEffect) => {
    if (effectTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(effectTimer);
      effectTimer = null;
    }
    state = { ...state, effect };
    emit();
    if (effect !== "none" && typeof window !== "undefined") {
      effectTimer = window.setTimeout(() => {
        state = { ...state, effect: "none" };
        effectTimer = null;
        emit();
      }, 1400);
    }
  },
  reset: () => {
    if (effectTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(effectTimer);
      effectTimer = null;
    }
    state = { accent: "cyan", style: "ring", effect: "none" };
    emit();
  }
};
