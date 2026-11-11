// glx.ts — WebGL1 plumbing: programs, buffers, draws, framebuffers.
// Only the attributes a shader really declares are enabled: enabling a
// missing one (location -1) silently cancels the draw.

export interface Program {
  p: WebGLProgram;
  a: Record<string, number>;
  u: Record<string, WebGLUniformLocation | null>;
}

export interface Buffer { b: WebGLBuffer; n: number }

export interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

export type Layout = Array<[string, number]>;

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (s === null) throw new Error('scene3d: no shader');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`scene3d: ${gl.getShaderInfoLog(s) ?? 'shader error'}`);
  return s;
}

export function program(gl: WebGLRenderingContext, vs: string, fs: string): Program {
  const p = gl.createProgram();
  if (p === null) throw new Error('scene3d: no program');
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`scene3d: ${gl.getProgramInfoLog(p) ?? 'link error'}`);
  const out: Program = { p, a: {}, u: {} };
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES) as number;
  for (let i = 0; i < na; i++) {
    const info = gl.getActiveAttrib(p, i);
    if (info !== null) out.a[info.name] = gl.getAttribLocation(p, info.name);
  }
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < nu; i++) {
    const info = gl.getActiveUniform(p, i);
    if (info !== null) out.u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
  }
  return out;
}

export function buffer(gl: WebGLRenderingContext, data: number[]): Buffer {
  const b = gl.createBuffer();
  if (b === null) throw new Error('scene3d: no buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return { b, n: data.length };
}

export function draw(gl: WebGLRenderingContext, prog: Program, buf: Buffer, layout: Layout, mode: number): void {
  let stride = 0;
  for (const l of layout) stride += l[1];
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
  let off = 0;
  for (const [name, size] of layout) {
    const loc = prog.a[name];
    if (loc !== undefined && loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
    }
    off += size;
  }
  gl.drawArrays(mode, 0, buf.n / stride);
}

export function target(gl: WebGLRenderingContext, w: number, h: number): Target {
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  const rb = gl.createRenderbuffer();
  if (tex === null || fb === null || rb === null) throw new Error('scene3d: no framebuffer');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, w, h };
}
