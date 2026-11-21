import { Component, type ReactNode, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Phase } from "../../conversation/types";
import { ACCENT_RGB, type HudAccent, type ReactorStyle } from "../../services/hudEffectsStore";
import { getSessionMeter } from "../../speech/sessionMeter";

interface Reactor3DProps {
  phase: Phase;
  offline?: boolean;
  thinkHard?: boolean;
  accent: HudAccent;
  style: ReactorStyle;
  fallback: ReactNode;
}

const CORE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uLevel;
  uniform float uPhase;
  uniform float uStyle;
  uniform float uIntensity;

  varying vec2 vUv;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  float band(float r, float r0, float w) {
    return exp(-pow((r - r0) / w, 2.0));
  }

  #define TAU 6.28318530718

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * 1.24;
    float r = length(p);
    float a = atan(p.y, p.x);
    vec2 ring = vec2(cos(a), sin(a));

    float wob   = fbm(ring * 2.6 + vec2(uPhase * 0.22, 0.0)) * 0.052;
    float grain = fbm(ring * 9.0 - vec2(uPhase * 0.4, 0.0)) * 0.018;
    float R = 0.74 + wob + grain + uLevel * 0.032;

    float erode = smoothstep(-0.25, 0.35, fbm(ring * 5.0 + vec2(uPhase * 0.5, 3.0)));

    float wSphere = clamp(1.0 - abs(uStyle - 1.0), 0.0, 1.0);
    float wWire   = clamp(1.0 - abs(uStyle - 2.0), 0.0, 1.0);

    float kOutline = mix(1.0, 0.45, wSphere) * mix(1.0, 0.70, wWire);
    float kDust    = mix(1.0, 0.30, wSphere) * mix(1.0, 0.80, wWire);
    float kLines   = mix(1.0, 0.35, wSphere) * mix(1.0, 3.00, wWire);
    float kMesh    = mix(1.0, 0.60, wSphere) * mix(1.0, 2.60, wWire);
    float kWash    = mix(1.0, 1.60, wSphere) * mix(1.0, 0.00, wWire);
    float kGlow    = mix(1.0, 2.20, wSphere) * mix(1.0, 0.30, wWire);

    float outer = band(r, R, 0.030) * (0.45 + erode * 0.6);
    float wall  = band(r, R - 0.055, 0.020) * 0.5;
    float edge  = band(r, R + 0.004, 0.007) * (0.5 + uLevel * 0.45);

    float speck = fbm(ring * 46.0 + vec2(uPhase * 0.15, 11.0));
    speck = pow(max(speck, 0.0), 3.0);
    float dust = speck * band(r, R + 0.028, 0.055) * (1.4 + uLevel);

    float sweepA = mod(uPhase * 0.55, TAU);
    float dA = mod(a - sweepA + TAU + 3.14159, TAU) - 3.14159;
    float wake = smoothstep(-2.6, -0.15, dA) * (1.0 - smoothstep(0.0, 0.22, dA));
    float radar = wake * band(r, R - 0.02, 0.075) * (0.55 + uLevel * 0.45);

    float lines =
        band(r, 0.615, 0.0035) * 0.45
      + band(r, 0.560, 0.0030) * 0.28
      + band(r, 0.470, 0.0035) * 0.36;

    float m1 = (sin(a * 96.0 + uPhase * 0.6) * 0.5 + 0.5) * (sin(r * 210.0) * 0.5 + 0.5);
    float m2 = (sin(a * 60.0 - uPhase * 0.4) * 0.5 + 0.5) * (sin(r * 150.0 - uPhase) * 0.5 + 0.5);
    float mesh = mix(m1, m2, 0.5);
    float core = smoothstep(0.40, 0.36, r);
    float coreTex = core * (0.04 * kWash + mesh * 0.12 * kMesh) * (0.55 + uLevel * 0.9);
    float coreEdge = band(r, 0.385, 0.010) * (0.55 + uLevel * 0.5);
    float pulse = band(r, fract(uPhase * 0.08) * 0.40, 0.020) * core * 0.45;
    float bloom = exp(-r * 3.4) * (0.16 + uLevel * 0.34);
    float bodyFill = wSphere * smoothstep(R + 0.02, R - 0.32, r) * (0.10 + uLevel * 0.10);

    float v = (outer + wall + edge + coreEdge) * kOutline
            + dust * kDust
            + radar
            + lines * kLines
            + coreTex + pulse
            + bloom * kGlow
            + bodyFill;

    vec3 col = mix(uColor, uHot, clamp(edge * 1.3 + radar * 0.7 + pulse * 0.5 + dust * 0.4, 0.0, 1.0));
    v *= uIntensity;
    gl_FragColor = vec4(col * v, v);
  }
`;

const PARTICLE_COUNT = 2600;

const PARTICLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uSize;

  attribute float aSeed;
  attribute float aRadius;

  varying float vAlpha;

  void main() {
    float t = uTime * (0.06 + aSeed * 0.05);
    float c = cos(t), s = sin(t);
    vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);

    float push = 1.0 + uLevel * 0.32 + sin(uTime * 2.0 + aSeed * 12.0) * 0.02;
    p *= push;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vAlpha = smoothstep(-11.5, -2.5, mv.z) * (0.26 + uLevel * 0.34) * (1.0 - aRadius * 0.55);
    gl_PointSize = uSize * (1.0 + uLevel * 0.65) * (13.0 / max(0.5, -mv.z));
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float falloff = 1.0 - smoothstep(0.0, 0.5, r);
    gl_FragColor = vec4(uColor, vAlpha * falloff);
  }
`;

function seeded(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function CoreAndParticles({
  phase,
  offline,
  thinkHard,
  accent,
  style
}: Omit<Reactor3DProps, "fallback">) {
  const coreMatRef = useRef<THREE.ShaderMaterial>(null);
  const coreMeshRef = useRef<THREE.Mesh>(null);
  const particleMatRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);
  const levelRef = useRef(0);
  const viewport = useThree((s) => s.viewport);
  const micBuf = useMemo(() => new Float32Array(16), []);

  const coreUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(...ACCENT_RGB.cyan.main) },
      uHot: { value: new THREE.Color(...ACCENT_RGB.cyan.hot) },
      uLevel: { value: 0 },
      uPhase: { value: 0 },
      uStyle: { value: 0 },
      uIntensity: { value: 1 }
    }),
    []
  );

  const particleUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uSize: { value: 3.2 },
      uColor: { value: new THREE.Color("#22d3ee") }
    }),
    []
  );

  const particlesData = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      const u = seeded(i * 3 + 1) * 2 - 1;
      const theta = seeded(i * 3 + 2) * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const radius = 1.9 + Math.pow(seeded(i * 3 + 3), 2) * 2.9;
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = u * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius;
      seeds[i] = seeded(i * 7 + 5);
      radii[i] = (radius - 1.9) / 2.9;
    }
    return { positions, seeds, radii };
  }, []);

  useFrame((_state, delta) => {
    const dt = Math.min(0.05, delta);
    timeRef.current += dt;

    let targetLevel = phase === "speaking" ? 0.65 : phase === "thinking" ? (thinkHard ? 0.72 : 0.45) : 0.08;
    if (phase === "listening") {
      const meter = getSessionMeter();
      if (meter && meter.read(micBuf)) {
        let sum = 0;
        for (let i = 0; i < micBuf.length; i += 1) sum += micBuf[i] ?? 0;
        targetLevel = Math.min(1, (sum / micBuf.length) * 2.2 + 0.14);
      } else {
        targetLevel = 0.34;
      }
    }

    levelRef.current = THREE.MathUtils.lerp(levelRef.current, targetLevel, 0.14);

    const rgb = offline ? { main: [0.97, 0.44, 0.44], hot: [1.0, 0.65, 0.48], css: "#f87171" } : ACCENT_RGB[accent];
    const coreMat = coreMatRef.current;
    if (coreMat && coreMeshRef.current) {
      coreMat.uniforms.uColor.value.setRGB(rgb.main[0], rgb.main[1], rgb.main[2]);
      coreMat.uniforms.uHot.value.setRGB(rgb.hot[0], rgb.hot[1], rgb.hot[2]);
      coreMat.uniforms.uLevel.value = levelRef.current;
      const speed = phase === "thinking" ? (thinkHard ? 2.1 : 1.55) : phase === "speaking" ? 1.55 : 0.85;
      coreMat.uniforms.uPhase.value += dt * speed;
      const styleTarget = style === "sphere" ? 1 : style === "wire" ? 2 : 0;
      coreMat.uniforms.uStyle.value = THREE.MathUtils.lerp(coreMat.uniforms.uStyle.value, styleTarget, 0.12);

      // ปรับขนาดให้อยู่กลางจอสวยพอดีทุกสัดส่วนหน้าจอ
      const shortSide = Math.min(viewport.width, viewport.height);
      const scale = (shortSide * 0.62) / 2.25;
      coreMeshRef.current.scale.setScalar(scale);
    }

    const pMat = particleMatRef.current;
    if (pMat) {
      pMat.uniforms.uTime.value = timeRef.current;
      pMat.uniforms.uLevel.value = levelRef.current;
      pMat.uniforms.uColor.value.setRGB(rgb.main[0], rgb.main[1], rgb.main[2]);
    }
  });

  return (
    <group>
      <mesh ref={coreMeshRef}>
        <planeGeometry args={[3.6, 3.6]} />
        <shaderMaterial
          ref={coreMatRef}
          vertexShader={CORE_VERTEX}
          fragmentShader={CORE_FRAGMENT}
          uniforms={coreUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlesData.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[particlesData.seeds, 1]} />
          <bufferAttribute attach="attributes-aRadius" args={[particlesData.radii, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={particleMatRef}
          uniforms={particleUniforms}
          vertexShader={PARTICLE_VERTEX}
          fragmentShader={PARTICLE_FRAGMENT}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

class WebGlErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // WebGL ไม่พร้อมใช้งาน: fallback เป็น 2D OrbitalEnergyCore อัตโนมัติ
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * 3D Holographic Reactor เต็มหน้าจอ (Core Shader + Particles 3D + Bloom)
 */
export function Reactor3D(props: Reactor3DProps) {
  const webglReady = useMemo(() => canUseWebGL(), []);

  if (!webglReady || typeof document === "undefined") return <>{props.fallback}</>;

  return createPortal(
    <WebGlErrorBoundary fallback={props.fallback}>
      <div
        className="reactor-3d-wrap"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
          pointerEvents: "none"
        }}
        aria-hidden
      >
        <Canvas
          style={{ width: "100%", height: "100%", display: "block" }}
          camera={{ position: [0, 0, 6.2], fov: 42 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          dpr={[1, 1.75]}
        >
          <color attach="background" args={["#02060c"]} />
          <CoreAndParticles
            phase={props.phase}
            offline={props.offline}
            thinkHard={props.thinkHard}
            accent={props.accent}
            style={props.style}
          />
          <EffectComposer>
            <Bloom intensity={0.7} luminanceThreshold={0.22} luminanceSmoothing={0.45} mipmapBlur />
          </EffectComposer>
        </Canvas>
      </div>
    </WebGlErrorBoundary>,
    document.body
  );
}
