import { Component, type ReactNode, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
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

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
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
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  float band(float r, float r0, float w) {
    return exp(-pow((r - r0) / w, 2.0));
  }

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * 1.18;
    float r = length(p);
    float a = atan(p.y, p.x);
    vec2 ring = vec2(cos(a), sin(a));

    float wob = fbm(ring * 2.5 + vec2(uPhase * 0.25, 0.0)) * 0.05;
    float grain = fbm(ring * 8.5 - vec2(uPhase * 0.45, 0.0)) * 0.018;
    float R = 0.72 + wob + grain + uLevel * 0.035;
    float erode = smoothstep(-0.25, 0.35, fbm(ring * 5.0 + vec2(uPhase * 0.5, 3.0)));

    float wSphere = clamp(1.0 - abs(uStyle - 1.0), 0.0, 1.0);
    float wWire = clamp(1.0 - abs(uStyle - 2.0), 0.0, 1.0);

    float kOutline = mix(1.0, 0.55, wSphere) * mix(1.0, 0.72, wWire);
    float kLines = mix(1.0, 0.45, wSphere) * mix(1.0, 2.6, wWire);

    float rim = band(r, R, 0.045) * erode * kOutline;
    float innerHalo = band(r, R * 0.76, 0.06) * 0.55 * kLines;
    float hair = band(r, R * 0.56, 0.015) * (0.45 + 0.55 * sin(a * 6.0 + uPhase * 1.4)) * kLines;
    float coreDot = exp(-pow(r / (0.19 + uLevel * 0.04), 2.0)) * (0.55 + wSphere * 0.65);

    float alpha = clamp((rim + innerHalo + hair + coreDot) * uIntensity, 0.0, 1.0);
    vec3 col = mix(uColor, uHot, clamp(rim * 0.7 + coreDot, 0.0, 1.0));
    gl_FragColor = vec4(col * (1.2 + uLevel * 0.5), alpha);
  }
`;

function ReactorCoreMesh({
  phase,
  offline,
  thinkHard,
  accent,
  style
}: Omit<Reactor3DProps, "fallback">) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const orbitsRef = useRef<THREE.Group>(null);
  const micBuf = useMemo(() => new Float32Array(16), []);

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(...ACCENT_RGB[accent].main) },
      uHot: { value: new THREE.Color(...ACCENT_RGB[accent].hot) },
      uLevel: { value: 0 },
      uPhase: { value: 0 },
      uStyle: { value: 0 },
      uIntensity: { value: 1 }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((_state, delta) => {
    const dt = Math.min(0.05, delta);
    const mat = materialRef.current;
    if (!mat) return;

    let targetLevel = phase === "speaking" ? 0.65 : phase === "thinking" ? (thinkHard ? 0.75 : 0.48) : 0.14;
    if (phase === "listening") {
      const meter = getSessionMeter();
      if (meter && meter.read(micBuf)) {
        let sum = 0;
        for (let i = 0; i < micBuf.length; i += 1) sum += micBuf[i] ?? 0;
        targetLevel = Math.min(1, (sum / micBuf.length) * 2.2 + 0.18);
      } else {
        targetLevel = 0.38;
      }
    }

    const rgb = offline ? { main: [0.97, 0.44, 0.44], hot: [1.0, 0.65, 0.48] } : ACCENT_RGB[accent];
    mat.uniforms.uColor.value.setRGB(rgb.main[0], rgb.main[1], rgb.main[2]);
    mat.uniforms.uHot.value.setRGB(rgb.hot[0], rgb.hot[1], rgb.hot[2]);
    mat.uniforms.uLevel.value = THREE.MathUtils.lerp(mat.uniforms.uLevel.value, targetLevel, 0.16);

    const speed = phase === "thinking" ? (thinkHard ? 2.4 : 1.7) : phase === "speaking" ? 1.6 : 0.85;
    mat.uniforms.uPhase.value += dt * speed;
    const styleTarget = style === "sphere" ? 1 : style === "wire" ? 2 : 0;
    mat.uniforms.uStyle.value = THREE.MathUtils.lerp(mat.uniforms.uStyle.value, styleTarget, 0.12);

    if (orbitsRef.current) {
      orbitsRef.current.rotation.z += dt * speed * 0.35;
      orbitsRef.current.rotation.x = Math.sin(mat.uniforms.uPhase.value * 0.4) * 0.28;
      orbitsRef.current.rotation.y = Math.cos(mat.uniforms.uPhase.value * 0.3) * 0.24;
    }
  });

  const ringColor = offline ? "#f87171" : ACCENT_RGB[accent].css;

  return (
    <group>
      <mesh>
        <planeGeometry args={[2.5, 2.5]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={orbitsRef}>
        <mesh rotation={[0.6, 0.3, 0]}>
          <torusGeometry args={[1.05, 0.008, 8, 96]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.55} />
        </mesh>
        <mesh rotation={[-0.7, 0.5, 0.8]}>
          <torusGeometry args={[1.18, 0.006, 8, 96]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.35} />
        </mesh>
      </group>
    </group>
  );
}

class WebGlErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // WebGL ไม่พร้อมใช้งานบนเครื่องนี้: ใช้ 2D OrbitalEnergyCore แทนเงียบๆ
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
 * แกนพลังงาน 3 มิติ (Three.js + GLSL + Bloom) พร้อม fallback เป็น 2D OrbitalEnergyCore อัตโนมัติถ้าอุปกรณ์ไม่รองรับ WebGL
 */
export function Reactor3D(props: Reactor3DProps) {
  const [webglReady] = useState(() => canUseWebGL());

  if (!webglReady) return <>{props.fallback}</>;

  return (
    <WebGlErrorBoundary fallback={props.fallback}>
      <div className="reactor-3d-wrap" aria-hidden>
        <Canvas
          camera={{ position: [0, 0, 3.2], fov: 42 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          dpr={[1, 1.75]}
        >
          <ReactorCoreMesh
            phase={props.phase}
            offline={props.offline}
            thinkHard={props.thinkHard}
            accent={props.accent}
            style={props.style}
          />
          <EffectComposer>
            <Bloom intensity={0.65} luminanceThreshold={0.25} luminanceSmoothing={0.45} mipmapBlur />
          </EffectComposer>
        </Canvas>
      </div>
    </WebGlErrorBoundary>
  );
}
