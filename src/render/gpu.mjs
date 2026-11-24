import * as shader from './shaders.mjs';
import { buildReef, waters } from './reef.mjs';
import { populate } from './life.mjs';

function program(gl, vert, frag) {
  const shaders = [];
  const p = gl.createProgram();
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vert],
      [gl.FRAGMENT_SHADER, frag],
    ]) {
      const s = gl.createShader(type);
      shaders.push(s);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  } catch (e) {
    gl.deleteProgram(p);
    throw e;
  } finally {
    for (const s of shaders) gl.deleteShader(s);
  }
  const uniforms = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const u = gl.getActiveUniform(p, i);
    uniforms[u.name] = gl.getUniformLocation(p, u.name);
  }
  const attributes = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) {
    const { name } = gl.getActiveAttrib(p, i);
    attributes[name] = gl.getAttribLocation(p, name);
  }
  return { p, uniforms, attributes };
}

export function makeGpu(gl) {
  const all = [],
    buffers = [];
  function addProgram(v, f) {
    const p = program(gl, v, f);
    all.push(p);
    return p;
  }
  let sky, terrain, fish, motes, shadowProgram;
  try {
    sky = addProgram(shader.skyVert, shader.skyFrag);
    terrain = addProgram(shader.meshVert, shader.meshFrag);
    fish = addProgram(shader.fishVert, shader.fishFrag);
    motes = addProgram(shader.moteVert, shader.moteFrag);
    shadowProgram = addProgram(shader.shadowVert, shader.shadowFrag);
  } catch (e) {
    all.forEach((p) => gl.deleteProgram(p.p));
    throw e;
  }
  function buffer(data, stride) {
    const id = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, id);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const b = { id, stride, count: data.length / stride };
    buffers.push(b);
    return b;
  }
  const background = buffer(new Float32Array([-1, -1, 3, -1, -1, 3]), 2);
  let reef, swimmers, points, activeKey;
  let enabled = [];
  const shadowSize = Math.min(
    1536,
    gl.getParameter(gl.MAX_TEXTURE_SIZE),
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  );
  const texture = gl.createTexture(),
    depth = gl.createRenderbuffer(),
    target = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shadowSize, shadowSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, shadowSize, shadowSize);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  function use(p, b, layout, values) {
    gl.useProgram(p.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.id);
    for (const loc of enabled) gl.disableVertexAttribArray(loc);
    enabled = [];
    let offset = 0;
    for (const [name, size] of layout) {
      const loc = p.attributes[name];
      if (loc !== undefined) {
        gl.enableVertexAttribArray(loc);
        enabled.push(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, b.stride * 4, offset * 4);
      }
      offset += size;
    }
    for (const [key, loc] of Object.entries(p.uniforms)) {
      const v = values[key];
      if (key === 'shadowMap') gl.uniform1i(loc, 0);
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v?.length === 3) gl.uniform3fv(loc, v);
      else if (v?.length === 2) gl.uniform2fv(loc, v);
    }
  }
  return {
    draw(f, c, width, height) {
      const key = f.zone + '|' + f.sites.map((s) => [s.id, s.x, s.z, s.kind].join(',')).join('/');
      if (activeKey !== key) {
        for (const b of buffers.splice(1)) gl.deleteBuffer(b.id);
        reef = buffer(buildReef(f.zone, f.sites), 10);
        const life = populate(f.zone, f.sites);
        swimmers = buffer(life.fish, 11);
        points = buffer(life.motes, 6);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, shadowSize, shadowSize);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.disable(gl.DITHER);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        use(
          shadowProgram,
          reef,
          [
            ['pos', 3],
            ['norm', 3],
            ['col', 3],
            ['emission', 1],
          ],
          {},
        );
        gl.drawArrays(gl.TRIANGLES, 0, reef.count);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.enable(gl.DITHER);
        activeKey = key;
      }
      const w = waters[f.zone],
        biome = ['shelf', 'vent', 'trench'].indexOf(f.zone);
      const u = {
        ...c,
        time: f.time,
        water: w.fog,
        top: w.sky,
        biome,
        heading: f.vehicle.heading,
        pitch: f.vehicle.pitch,
        lamps: f.lights ? 1 : 0,
        ping: f.ping,
        visibility: [0.022, 0.031, 0.03][biome],
        screenHeight: height,
        shadowSize,
      };
      gl.viewport(0, 0, width, height);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      use(sky, background, [['pos', 2]], u);
      gl.drawArrays(gl.TRIANGLES, 0, background.count);
      gl.enable(gl.DEPTH_TEST);
      use(
        terrain,
        reef,
        [
          ['pos', 3],
          ['norm', 3],
          ['col', 3],
          ['emission', 1],
        ],
        u,
      );
      gl.drawArrays(gl.TRIANGLES, 0, reef.count);
      use(
        fish,
        swimmers,
        [
          ['local', 3],
          ['home', 3],
          ['col', 3],
          ['info', 2],
        ],
        u,
      );
      gl.drawArrays(gl.TRIANGLES, 0, swimmers.count);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      use(
        motes,
        points,
        [
          ['pos', 3],
          ['info', 3],
        ],
        u,
      );
      gl.drawArrays(gl.POINTS, 0, points.count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    },
    dispose() {
      for (const b of buffers) gl.deleteBuffer(b.id);
      for (const p of all) gl.deleteProgram(p.p);
      gl.deleteFramebuffer(target);
      gl.deleteRenderbuffer(depth);
      gl.deleteTexture(texture);
    },
  };
}
