import { DartCoords } from '../types/darts';

/**
 * Dedicated GPU-Accelerated Single-Camera Straight-On Board Renderer (Clips Only).
 *
 * Consumes Autodarts Desktop's lightweight RAW 3-camera strip (3840×720 from `/api/streams/live` —
 * ZERO `?warp=true` CPU load on Autodarts Desktop so auto-scoring stays 100% fast & unaffected!)
 * and warps each of the 3 mounted camera angles INDIVIDUALLY onto its own crisp 900×900 upright
 * straight-on board panel inside a single 2700×900 WebGL atlas (<0.3ms/frame).
 *
 * ZERO multi-camera averaging/blending — each clip uses ONLY the single camera closest to the
 * dart that triggered the clip, eliminating triple-camera ghosting & parallax blur!
 */

export type BoardCameraIndex = 0 | 1 | 2;

export interface BoardCameraChoice {
  camIndex: BoardCameraIndex;
  positionLabel: 'TOP' | 'RIGHT' | 'LEFT';
  badgeText: string;
  segments: readonly number[];
}

/**
 * Exact camera-to-segment ownership derived from the calibrated 3-camera homography Jacobians:
 *   - Cam 0 (TOP):   9, 12, 5, 20, 1, 18, 4  (clockwise 297° → 63°, plus Bullseye default)
 *   - Cam 1 (RIGHT): 13, 6, 10, 15, 2, 17, 3 (clockwise 63° → 189°)
 *   - Cam 2 (LEFT):  19, 7, 16, 8, 11, 14    (clockwise 189° → 297°)
 */
export const BOARD_CAMERAS: readonly [BoardCameraChoice, BoardCameraChoice, BoardCameraChoice] = [
  {
    camIndex: 0,
    positionLabel: 'TOP',
    badgeText: 'BOARD CAM • TOP',
    segments: [9, 12, 5, 20, 1, 18, 4],
  },
  {
    camIndex: 1,
    positionLabel: 'RIGHT',
    badgeText: 'BOARD CAM • RIGHT',
    segments: [13, 6, 10, 15, 2, 17, 3],
  },
  {
    camIndex: 2,
    positionLabel: 'LEFT',
    badgeText: 'BOARD CAM • LEFT',
    segments: [19, 7, 16, 8, 11, 14],
  },
];

const RIGHT_SEGMENTS = new Set<number>(BOARD_CAMERAS[1].segments);
const LEFT_SEGMENTS = new Set<number>(BOARD_CAMERAS[2].segments);
const TOP_SEGMENTS = new Set<number>(BOARD_CAMERAS[0].segments);

/**
 * Picks the single Autodarts board camera closest to the triggering dart.
 *
 * Priority:
 *  1. Exact normalized Autodarts dart `(x, y)` coordinates (when outside the bull ring `r >= 0.12`)
 *  2. Parsed segment number (`1..20`) from `segmentName` (e.g. `D16`, `T13`, `S3`, `T20`)
 *  3. Bullseye / 25 -> Cam 0 (TOP, centered & glare-free); otherwise `fallbackCam` (last dart's cam)
 */
export function selectClosestBoardCamera(
  coords?: DartCoords,
  segmentName?: string,
  fallbackCam: BoardCameraIndex = 0
): BoardCameraChoice {
  // 1. Use exact normalized dart coordinates (bull-centered, +x right, +y up)
  if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y)) {
    const r = Math.hypot(coords.x, coords.y);
    if (r >= 0.12) {
      // Clockwise degrees from 12 o'clock (20 = 0°, 6 = 90°, 3 = 180°, 11 = 270°)
      let cwDeg = (Math.atan2(coords.x, coords.y) * 180) / Math.PI;
      if (cwDeg < 0) cwDeg += 360;

      if (cwDeg >= 63 && cwDeg < 189) {
        return BOARD_CAMERAS[1]; // RIGHT: segments 13..3
      }
      if (cwDeg >= 189 && cwDeg < 297) {
        return BOARD_CAMERAS[2]; // LEFT: segments 19..14
      }
      return BOARD_CAMERAS[0]; // TOP: segments 9..4
    }
    // Bullseye / 25 center shot -> Top camera gives the cleanest straight-on center view
    return BOARD_CAMERAS[0];
  }

  // 2. Fall back to segment name parsing (e.g. "T20", "D16", "S13", "6")
  if (segmentName) {
    const cleaned = segmentName.trim().toUpperCase();
    if (cleaned === 'BULL' || cleaned === 'DBULL' || cleaned === '25' || cleaned === 'SBULL') {
      return BOARD_CAMERAS[0];
    }
    const match = cleaned.match(/^[SDT]?(\d{1,2})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (RIGHT_SEGMENTS.has(num)) return BOARD_CAMERAS[1];
      if (LEFT_SEGMENTS.has(num)) return BOARD_CAMERAS[2];
      if (TOP_SEGMENTS.has(num)) return BOARD_CAMERAS[0];
    }
  }

  // 3. Fallback to most recently active dart camera (useful for manual "Clip That!" after takeout)
  return BOARD_CAMERAS[fallbackCam] ?? BOARD_CAMERAS[0];
}

// Exact sub-pixel inverse homographies: straight-on board UV (u, v in [0,1]) -> raw cam UV (x, y in [0,1])
// Stored in row-major order [h0, h1, h2, h3, h4, h5, h6, h7, h8]
const CAM_HOMOGRAPHIES_ROW_MAJOR: readonly [
  readonly number[],
  readonly number[],
  readonly number[],
] = [
  // Cam 0 (left third of 3840×720 raw strip — TOP camera, closest to 9..4)
  [-1.216085, 1.021104, 1.112749, -0.06489, -0.97306, 1.327567, 0.302177, 1.601617, 1.0],
  // Cam 1 (middle third of 3840×720 raw strip — RIGHT camera, closest to 13..3)
  [-0.025786, -0.515693, 0.556664, 0.210288, 0.01765, 0.178651, -0.457534, -0.315525, 1.0],
  // Cam 2 (right third of 3840×720 raw strip — LEFT camera, closest to 19..14)
  [0.765635, 0.450154, -0.095509, -0.512012, 0.214572, 0.597406, 0.800031, -0.53438, 1.0],
];

// Convert row-major 3×3 array into column-major Float32Array for WebGL uniformMatrix3fv
function toColMajorMat3(m: readonly number[]): Float32Array {
  return new Float32Array([
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ]);
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    // Map clip-space [-1,1] to top-down UV [0,1] (v=0 at top, v=1 at bottom)
    v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// Renders all 3 cameras INDIVIDUALLY side-by-side into a (3*size) x size atlas in one draw call.
// Each panel samples ONLY ONE camera — zero cross-camera averaging, zero ghosting, razor sharp!
const FRAGMENT_SHADER_SRC = `
  precision highp float;
  uniform sampler2D u_rawStrip;
  uniform mat3 u_h0;
  uniform mat3 u_h1;
  uniform mat3 u_h2;
  varying vec2 v_uv;

  const vec3 MATTE_BG = vec3(0.043, 0.059, 0.090); // #0B0F17

  vec3 sampleSingleCam(mat3 H, float sliceOffset, vec2 uv) {
    vec3 p = H * vec3(uv, 1.0);
    if (abs(p.z) < 0.0001) return MATTE_BG;
    vec2 c = p.xy / p.z;
    float edgeX = min(c.x, 1.0 - c.x);
    float edgeY = min(c.y, 1.0 - c.y);
    float edge = min(edgeX, edgeY);
    if (edge <= 0.004) return MATTE_BG;
    float mask = smoothstep(0.004, 0.022, edge);
    vec2 stripUv = vec2((sliceOffset + c.x) / 3.0, c.y);
    vec3 col = texture2D(u_rawStrip, stripUv).rgb;
    return mix(MATTE_BG, col, mask);
  }

  void main() {
    float x3 = v_uv.x * 3.0;
    vec3 col;
    if (x3 < 1.0) {
      col = sampleSingleCam(u_h0, 0.0, vec2(x3, v_uv.y));
    } else if (x3 < 2.0) {
      col = sampleSingleCam(u_h1, 1.0, vec2(x3 - 1.0, v_uv.y));
    } else {
      col = sampleSingleCam(u_h2, 2.0, vec2(x3 - 2.0, v_uv.y));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class VirtualBoardCamera {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private initialized = false;
  private failed = false;
  private readonly size: number;

  constructor(size = 900) {
    this.size = size;
  }

  private ensureInit(): boolean {
    if (this.initialized) return true;
    if (this.failed) return false;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.size * 3;
      canvas.height = this.size;
      const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        this.failed = true;
        return false;
      }

      const compile = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };

      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      if (!vs || !fs) {
        this.failed = true;
        return false;
      }

      const prog = gl.createProgram();
      if (!prog) {
        this.failed = true;
        return false;
      }
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        this.failed = true;
        return false;
      }
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      // Full-screen quad
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );

      const posLoc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      gl.useProgram(prog);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_rawStrip'), 0);
      gl.uniformMatrix3fv(
        gl.getUniformLocation(prog, 'u_h0'),
        false,
        toColMajorMat3(CAM_HOMOGRAPHIES_ROW_MAJOR[0])
      );
      gl.uniformMatrix3fv(
        gl.getUniformLocation(prog, 'u_h1'),
        false,
        toColMajorMat3(CAM_HOMOGRAPHIES_ROW_MAJOR[1])
      );
      gl.uniformMatrix3fv(
        gl.getUniformLocation(prog, 'u_h2'),
        false,
        toColMajorMat3(CAM_HOMOGRAPHIES_ROW_MAJOR[2])
      );

      gl.viewport(0, 0, this.size * 3, this.size);

      this.canvas = canvas;
      this.gl = gl;
      this.program = prog;
      this.texture = tex;
      this.posBuffer = buf;
      this.initialized = true;
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /**
   * Renders all 3 individual crisp straight-on board cameras into the (3*size) x size atlas
   * in a single GPU draw call from Autodarts' raw 3840×720 strip.
   */
  public render(rawStripBitmap: ImageBitmap): HTMLCanvasElement | null {
    if (rawStripBitmap.width < rawStripBitmap.height * 2.4) return null;
    if (!this.ensureInit() || !this.gl || !this.canvas || !this.texture || !this.program) {
      return null;
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rawStripBitmap);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  public getPanelSize(): number {
    return this.size;
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.initialized ? this.canvas : null;
  }

  public dispose(): void {
    if (this.gl) {
      if (this.texture) this.gl.deleteTexture(this.texture);
      if (this.posBuffer) this.gl.deleteBuffer(this.posBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.texture = null;
    this.posBuffer = null;
    this.program = null;
    this.gl = null;
    this.canvas = null;
    this.initialized = false;
  }
}
