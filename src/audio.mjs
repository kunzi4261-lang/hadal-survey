export function createAudio() {
  let ctx,
    master,
    drone,
    active = false,
    audible = true;
  function ready() {
    if (!audible) return false;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return false;
      if (!ctx) {
        ctx = new Audio();
        master = ctx.createGain();
        master.gain.value = 0.42;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  function tone(freq, end, ms, volume, delay = 0, wave = 'sine') {
    const start = ctx.currentTime + delay,
      stop = start + ms;
    const osc = ctx.createOscillator(),
      env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(end, stop);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(stop + 0.02);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
  function sound(name) {
    if (!ready()) return;
    if (name === 'ping') {
      tone(880, 690, 0.78, 0.25);
      tone(880, 670, 0.6, 0.07, 0.24);
    } else if (name === 'scan') {
      tone(220, 660, 0.5, 0.1, 0, 'triangle');
    } else if (name === 'sample' || name === 'dock') {
      [330, 440, 554, 660].forEach((f, i) => tone(f, f, 0.34, 0.12, i * 0.09));
    } else if (name === 'shutter') {
      tone(1050, 210, 0.08, 0.13, 0, 'triangle');
    } else {
      tone(360, 310, 0.09, 0.1);
    }
  }
  function ambient(on) {
    active = on;
    if (drone) {
      drone.forEach(([o, g]) => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.045);
        o.stop(ctx.currentTime + 0.25);
      });
      drone = null;
    }
    if (!on || !ready()) return;
    drone = [41.2, 61.9].map((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.setTargetAtTime(i ? 0.033 : 0.065, ctx.currentTime, 0.35);
      o.connect(g).connect(master);
      o.start();
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      return [o, g];
    });
  }
  return {
    sound,
    ambient,
    enable(v) {
      audible = v;
      if (master) master.gain.setTargetAtTime(v ? 0.42 : 0, ctx.currentTime, 0.03);
      ambient(active);
    },
  };
}
