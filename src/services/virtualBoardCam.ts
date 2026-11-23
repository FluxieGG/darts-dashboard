/**
 * Dedicated GPU-Accelerated Virtual Straight-On Board Camera (Clips Only).
 *
 * Consumes Autodarts Desktop's lightweight RAW 3-camera strip (3840×720 from `/api/streams/live` —
 * ZERO `?warp=true` CPU load on Autodarts Desktop so auto-scoring stays 100% fast & unaffected!)
 * and warps + blends all 3 mounted camera angles on the browser GPU via WebGL (<0.2ms/frame)
 * into ONE seamless 900×900 straight-on front-facing dartboard view exclusively for clips.
 */

// Exact sub-pixel inverse homographies: straight-on board UV (u, v in [0,1]) -> raw cam UV (x, y in [0,1])
// Stored in row-major order [h0, h1, h2, h3, h4, h5, h6, h7, h8]
const CAM_HOMOGRAPHIES_ROW_MAJOR: readonly [
  readonly number[],
  readonly number[],
  readonly number[],
] = [
  // Cam 0 (left third of 3840×720 raw strip)
  [-1.216085, 1.021104, 1.112749, -0.06489, -0.97306, 1.327567, 0.302177, 1.601617, 1.0],
  // Cam 1 (middle third of 3840×720 raw strip)
  [-0.025786, -0.515693, 0.556664, 0.210288, 0.01765, 0.178651, -0.457534, -0.315525, 1.0],
  // Cam 2 (right third of 3840×720 raw strip)
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

const FRAGMENT_SHADER_SRC = `
  precision highp float;
  uniform sampler2D u_rawStrip;
  uniform mat3 u_h0;
  uniform mat3 u_h1;
  uniform mat3 u_h2;
  varying vec2 v_uv;

  vec4 sampleCam(mat3 H, float sliceOffset, vec2 uv) {
    vec3 p = H * vec3(uv, 1.0);
    if (abs(p.z) < 0.0001) return vec4(0.0);
    vec2 c = p.xy / p.z;
    // Soft feather inside [0.015, 0.985] so camera frame borders blend invisibly
    float edgeX = min(c.x, 1.0 - c.x);
    float edgeY = min(c.y, 1.0 - c.y);
    float edge = min(edgeX, edgeY);
    if (edge <= 0.004) return vec4(0.0);
    float weight = smoothstep(0.004, 0.035, edge);
    vec2 stripUv = vec2((sliceOffset + c.x) / 3.0, c.y);
    vec3 col = texture2D(u_rawStrip, stripUv).rgb;
    return vec4(col * weight, weight);
  }

  void main() {
    vec4 s0 = sampleCam(u_h0, 0.0, v_uv);
    vec4 s1 = sampleCam(u_h1, 1.0, v_uv);
    vec4 s2 = sampleCam(u_h2, 2.0, v_uv);

    float totalW = s0.a + s1.a + s2.a;
    if (totalW > 0.001) {
      vec3 fused = (s0.rgb + s1.rgb + s2.rgb) / totalW;
      gl_FragColor = vec4(fused, 1.0);
    } else {
      gl_FragColor = vec4(0.043, 0.059, 0.090, 1.0); // #0B0F17 matte canvas
    }
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
      canvas.width = this.size;
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

      gl.viewport(0, 0, this.size, this.size);

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
   * Renders one straight-on 3-in-1 fused dartboard frame on the GPU from Autodarts' raw 3840×720 strip.
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
