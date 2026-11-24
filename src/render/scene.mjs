import { floorHeight } from '../core/world.mjs';
import { makeGpu } from './gpu.mjs';
import { makeSoftware } from './software.mjs';

export function cameraFor(zone, vehicle, width, height) {
  const h = vehicle.heading,
    p = vehicle.pitch || 0,
    ch = Math.cos(h),
    sh = Math.sin(h),
    cp = Math.cos(p),
    sp = Math.sin(p);
  // A 65 degree vertical field of view with a wider vertical view in portrait.
  const focal = height > width ? 1.12 : 1.56;
  return {
    eye: [vehicle.x, floorHeight(zone, vehicle.x, vehicle.z) + vehicle.altitude, vehicle.z],
    right: [ch, 0, -sh],
    up: [-sh * sp, cp, -ch * sp],
    forward: [sh * cp, sp, ch * cp],
    scale: [(focal * height) / width, focal],
  };
}

export function createScene(canvas) {
  // Keeping a single presentation surface allows photos to work on both paths
  // and lets a lost GPU context fall back without replacing the caller's canvas.
  const ctx = canvas.getContext('2d', { alpha: false });
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  let gpu = null,
    software = null,
    lost = false,
    disposed = false,
    lastSoftware = -Infinity;
  function init() {
    if (gl && !disposed) {
      try {
        gpu = makeGpu(gl);
      } catch {
        gpu = null;
      }
    }
  }
  function onLost(event) {
    event.preventDefault();
    gpu = null;
    lost = true;
    lastSoftware = -Infinity;
  }
  function onRestored() {
    lost = false;
    init();
  }
  surface.addEventListener('webglcontextlost', onLost);
  surface.addEventListener('webglcontextrestored', onRestored);
  init();
  return {
    get mode() {
      return gpu && !lost ? 'WebGL' : 'Canvas 2D';
    },
    render(frame) {
      if (disposed || !ctx) return;
      const cssW = canvas.clientWidth || canvas.width || 640,
        cssH = canvas.clientHeight || canvas.height || 360;
      const factor = Math.min(
        window.devicePixelRatio || 1,
        1.4,
        (gpu ? 1450 : 870) / Math.max(cssW, cssH),
      );
      const w = Math.max(2, Math.round(cssW * factor)),
        h = Math.max(2, Math.round(cssH * factor));
      const resize = canvas.width !== w || canvas.height !== h;
      if (resize) {
        canvas.width = w;
        canvas.height = h;
        surface.width = w;
        surface.height = h;
      } else if (surface.width !== w || surface.height !== h) {
        surface.width = w;
        surface.height = h;
      }
      const c = cameraFor(frame.zone, frame.vehicle, w, h);
      if (gpu && !lost) {
        gpu.draw(frame, c, w, h);
        ctx.drawImage(surface, 0, 0);
      } else {
        const now = performance.now();
        if (!resize && now - lastSoftware < 54) return;
        lastSoftware = now;
        software ??= makeSoftware(ctx);
        software(frame, c, w, h);
      }
    },
    dispose() {
      disposed = true;
      gpu?.dispose();
      gpu = null;
      software = null;
      surface.removeEventListener('webglcontextlost', onLost);
      surface.removeEventListener('webglcontextrestored', onRestored);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      surface.width = 1;
      surface.height = 1;
    },
  };
}
