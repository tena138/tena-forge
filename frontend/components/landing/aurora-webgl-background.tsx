"use client";

import { useEffect, useRef, useState } from "react";

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_mobile;

varying vec2 v_uv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotation = mat2(0.82, -0.58, 0.58, 0.82);

  for (int i = 0; i < 5; i++) {
    float mobileWeight = i > 2 ? 1.0 - (u_mobile * 0.72) : 1.0;
    value += amplitude * noise(p) * mobileWeight;
    p = rotation * p * 2.02 + vec2(17.2, 9.3);
    amplitude *= 0.5;
  }

  return value;
}

float orb(vec2 p, vec2 center, float radius) {
  vec2 delta = p - center;
  return exp(-dot(delta, delta) / (radius * radius));
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.032;

  vec2 flow = vec2(sin(t * 0.74), cos(t * 0.61)) * 0.22;
  float n1 = fbm(p * 1.48 + flow);
  float n2 = fbm(p * 2.18 - flow * 0.72 + n1 * 0.42);
  float n3 = fbm(p * 3.08 + vec2(n2, n1) * 0.28 - t * 0.12);

  vec3 base = vec3(0.031, 0.031, 0.059);
  vec3 blue = vec3(0.231, 0.435, 0.961);
  vec3 teal = vec3(0.176, 0.831, 0.749);
  vec3 purple = vec3(0.486, 0.361, 1.000);
  vec3 magenta = vec3(0.635, 0.294, 1.000);

  float veil = smoothstep(0.28, 0.92, n1 + n2 * 0.34);
  float ribbon = smoothstep(0.50, 0.84, sin((p.x * 1.22 + p.y * 0.46 + n2 * 1.28 + t * 0.86) * 3.141592) * 0.5 + 0.5);

  vec3 aurora = mix(blue, teal, smoothstep(0.16, 0.82, n1));
  aurora = mix(aurora, purple, smoothstep(0.30, 0.94, n2));
  aurora = mix(aurora, magenta, smoothstep(0.72, 1.0, n3) * 0.35);

  vec2 orbA = vec2(-0.46 + 0.10 * sin(t * 1.18), 0.08 + 0.08 * cos(t * 0.86));
  vec2 orbB = vec2(0.38 + 0.12 * cos(t * 0.92), -0.10 + 0.10 * sin(t * 1.04));
  vec2 orbC = vec2(0.04 + 0.10 * sin(t * 0.72), 0.32 + 0.08 * cos(t * 0.98));
  float glow = orb(p, orbA, 0.34) * 0.56 + orb(p, orbB, 0.42) * 0.44 + orb(p, orbC, 0.28) * 0.30;

  vec3 color = base;
  color += aurora * (veil * 0.34 + ribbon * 0.18);
  color += mix(blue, purple, uv.x) * glow * 0.34;

  float vignette = smoothstep(1.18, 0.22, length(p * vec2(0.92, 1.08)));
  color *= 0.54 + vignette * 0.68;
  color = mix(color, base, smoothstep(0.74, 1.18, abs(p.x)) * 0.28);
  color = mix(color, base, smoothstep(0.58, 1.08, abs(p.y)) * 0.34);

  float grain = hash(gl_FragCoord.xy + u_time * 11.0) - 0.5;
  color += grain * 0.034;

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown WebGL program link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

export function AuroraWebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setFallback(true);
      return;
    }

    const gl = canvasElement.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
      stencil: false,
    });

    if (!gl) {
      setFallback(true);
      return;
    }
    const glContext = gl;

    let animationFrame = 0;
    let disposed = false;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;

    try {
      program = createProgram(glContext);
      buffer = glContext.createBuffer();
      if (!buffer) throw new Error("Unable to create WebGL buffer.");

      glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer);
      glContext.bufferData(
        glContext.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        glContext.STATIC_DRAW
      );

      const positionLocation = glContext.getAttribLocation(program, "a_position");
      const resolutionLocation = glContext.getUniformLocation(program, "u_resolution");
      const timeLocation = glContext.getUniformLocation(program, "u_time");
      const mobileLocation = glContext.getUniformLocation(program, "u_mobile");
      const mobile = window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4 ? 1 : 0;
      const maxDpr = mobile ? 1.35 : 2;

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        const width = Math.max(1, Math.floor(window.innerWidth * dpr));
        const height = Math.max(1, Math.floor(window.innerHeight * dpr));
        if (canvasElement.width !== width || canvasElement.height !== height) {
          canvasElement.width = width;
          canvasElement.height = height;
          glContext.viewport(0, 0, width, height);
        }
      }

      function render(now: number) {
        if (disposed || document.hidden) return;
        resize();
        glContext.useProgram(program);
        glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer);
        glContext.enableVertexAttribArray(positionLocation);
        glContext.vertexAttribPointer(positionLocation, 2, glContext.FLOAT, false, 0, 0);
        glContext.uniform2f(resolutionLocation, canvasElement.width, canvasElement.height);
        glContext.uniform1f(timeLocation, now * 0.001);
        glContext.uniform1f(mobileLocation, mobile);
        glContext.drawArrays(glContext.TRIANGLES, 0, 6);
        animationFrame = window.requestAnimationFrame(render);
      }

      function start() {
        if (!animationFrame && !document.hidden) {
          animationFrame = window.requestAnimationFrame(render);
        }
      }

      function stop() {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
      }

      function handleVisibilityChange() {
        if (document.hidden) stop();
        else start();
      }

      function handleContextLost(event: Event) {
        event.preventDefault();
        stop();
        setFallback(true);
      }

      window.addEventListener("resize", resize);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      canvasElement.addEventListener("webglcontextlost", handleContextLost, false);
      resize();
      start();

      return () => {
        disposed = true;
        stop();
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        canvasElement.removeEventListener("webglcontextlost", handleContextLost);
        if (buffer) glContext.deleteBuffer(buffer);
        if (program) glContext.deleteProgram(program);
      };
    } catch {
      setFallback(true);
      if (buffer) glContext.deleteBuffer(buffer);
      if (program) glContext.deleteProgram(program);
    }
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-[var(--landing-bg-base)]" style={{ zIndex: -1 }}>
      <div className="landing-webgl-fallback absolute inset-0" />
      <canvas ref={canvasRef} className={fallback ? "absolute inset-0 h-full w-full opacity-0" : "absolute inset-0 h-full w-full opacity-100"} />
      <div className="landing-film-grain absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,10,15,0.08)_0%,rgba(10,10,15,0.38)_54%,rgba(10,10,15,0.96)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-80 bg-[linear-gradient(180deg,transparent,var(--landing-bg-base)_84%)]" />
    </div>
  );
}
