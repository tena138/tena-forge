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

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = vec2((uv.x - 0.54) * aspect, uv.y - 0.51);
  float t = u_time * 0.055;

  float radius = length(p);
  float angle = atan(p.y, p.x);
  float spiral = angle + radius * 5.6 - t * 1.15;
  float counterSpiral = angle - radius * 4.2 + t * 0.76;

  float n1 = fbm(vec2(spiral * 0.34, radius * 2.35) + vec2(t * 0.54, -t * 0.18));
  float n2 = fbm(p * 2.25 + vec2(n1 * 0.48 + t * 0.22, -t * 0.34));
  float n3 = fbm(vec2(counterSpiral * 0.28, radius * 3.1) - vec2(t * 0.28, n2 * 0.32));

  vec3 base = vec3(0.020, 0.019, 0.036);
  vec3 deep = vec3(0.006, 0.008, 0.020);
  vec3 blue = vec3(0.105, 0.295, 0.820);
  vec3 indigo = vec3(0.185, 0.145, 0.500);
  vec3 violet = vec3(0.455, 0.205, 0.940);
  vec3 magenta = vec3(0.780, 0.140, 0.680);

  float ringA = exp(-pow((radius - (0.34 + 0.035 * sin(t * 0.92 + n1 * 2.2))) / 0.245, 2.0));
  float ringB = exp(-pow((radius - (0.58 + 0.045 * cos(t * 0.70 + n2 * 2.6))) / 0.320, 2.0));
  float ringC = exp(-pow((radius - (0.82 + 0.035 * sin(t * 0.46 + n3 * 2.0))) / 0.380, 2.0));
  float armA = smoothstep(0.10, 0.95, sin(spiral * 1.74 + n2 * 2.2) * 0.5 + 0.5);
  float armB = smoothstep(0.12, 0.92, sin(counterSpiral * 1.38 + n3 * 2.0) * 0.5 + 0.5);
  float aurora = ringA * (0.52 + armA * 0.24) + ringB * (0.36 + armB * 0.28) + ringC * 0.18;
  aurora *= 0.66 + n1 * 0.24 + n2 * 0.18;

  vec3 bandColor = mix(blue, violet, smoothstep(-0.58, 0.62, sin(spiral + n1)));
  bandColor = mix(bandColor, magenta, smoothstep(0.56, 1.0, sin(counterSpiral * 0.84 + n3) * 0.5 + 0.5) * 0.52);
  bandColor = mix(bandColor, indigo, smoothstep(0.52, 1.0, radius) * 0.34);

  float centerShadow = smoothstep(0.36, 0.02, radius);
  float outerFalloff = smoothstep(1.18, 0.28, radius);
  vec3 color = mix(deep, base, outerFalloff * 0.62);
  color += bandColor * aurora * (0.74 + outerFalloff * 0.42);
  color = mix(color, deep, centerShadow * 0.34);

  float sideFade = smoothstep(1.46, 0.22, length(p * vec2(0.74, 1.04)));
  color *= 0.52 + sideFade * 0.66;
  color = mix(color, deep, smoothstep(0.82, 1.24, abs(p.x)) * 0.34);
  color = mix(color, deep, smoothstep(0.70, 1.12, abs(p.y)) * 0.22);

  float grain = hash(gl_FragCoord.xy + u_time * 11.0) - 0.5;
  color += grain * 0.026;

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
      <div className="absolute inset-x-0 bottom-0 h-[42vh] bg-[linear-gradient(180deg,transparent,rgba(5,5,10,0.34)_100%)]" />
    </div>
  );
}
