/**
 * Interactive "geosocial map" for the home hero.
 *
 * A perspective grid plane with drifting nodes (people / places). The
 * pointer is "you": nearby nodes light up and a route is plotted from you
 * through the closest nodes. When the pointer leaves, an autopilot marker
 * wanders the map so the scene stays alive on touch devices.
 *
 * Plain canvas 2D, no dependencies. Respects prefers-reduced-motion by
 * rendering a single static frame.
 */

type Node = { u: number; v: number; du: number; dv: number; r: number; seed: number };
type Ping = { node: Node; t0: number };

const SIGNAL = '198, 234, 61';
const SKY = '134, 198, 255';
const LINE = '255, 255, 255';

export function initGeomap(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = canvas.parentElement ?? canvas;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let horizon = 0;
  let nodes: Node[] = [];
  let pings: Ping[] = [];
  let raf = 0;
  let last = performance.now();
  let gridScroll = 0;
  let dash = 0;

  // Pointer ("you") in screen space, eased.
  const target = { x: 0, y: 0, active: false };
  const you = { x: 0, y: 0 };

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  function resize() {
    const rect = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    horizon = H * 0.22;

    const count = Math.round(Math.min(120, Math.max(36, W / 13)));
    if (nodes.length !== count) {
      nodes = Array.from({ length: count }, () => ({
        u: rand(-1, 1),
        v: rand(0.06, 1),
        du: rand(-0.012, 0.012),
        dv: rand(-0.006, 0.006),
        r: rand(1.2, 2.4),
        seed: Math.random() * Math.PI * 2,
      }));
    }
    if (!target.active) {
      you.x = W * 0.68;
      you.y = H * 0.62;
    }
  }

  /** Project plane coords (u: -1..1 across, v: 0 far .. 1 near) to screen. */
  function project(u: number, v: number) {
    const depth = Math.pow(v, 1.6);
    const spread = 0.28 + depth * 0.9; // wider as it comes toward the viewer
    return {
      x: W / 2 + u * (W / 2) * spread,
      y: horizon + depth * (H - horizon),
      s: 0.35 + depth * 1.1, // scale for sizes/alpha
    };
  }

  function drawGrid(now: number) {
    ctx!.lineWidth = 1;
    // Converging longitude lines
    for (let i = -8; i <= 8; i++) {
      const u = i / 8;
      const a = project(u, 0.02);
      const b = project(u, 1);
      const grad = ctx!.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, `rgba(${LINE},0)`);
      grad.addColorStop(0.5, `rgba(${LINE},0.09)`);
      grad.addColorStop(1, `rgba(${LINE},0.03)`);
      ctx!.strokeStyle = grad;
      ctx!.beginPath();
      ctx!.moveTo(a.x, a.y);
      ctx!.lineTo(b.x, b.y);
      ctx!.stroke();
    }
    // Latitude lines drifting toward the viewer
    const rows = 14;
    for (let i = 0; i < rows; i++) {
      const v = ((i + gridScroll) % rows) / rows;
      const p = project(0, v);
      const alpha = 0.02 + Math.pow(v, 1.6) * 0.08;
      ctx!.strokeStyle = `rgba(${LINE},${alpha})`;
      const l = project(-1, v);
      const r = project(1, v);
      ctx!.beginPath();
      ctx!.moveTo(l.x, p.y);
      ctx!.lineTo(r.x, p.y);
      ctx!.stroke();
    }
    // Horizon glow
    const hg = ctx!.createLinearGradient(0, horizon - 40, 0, horizon + 120);
    hg.addColorStop(0, `rgba(${SKY},0)`);
    hg.addColorStop(0.4, `rgba(${SKY},0.05)`);
    hg.addColorStop(1, `rgba(${SKY},0)`);
    ctx!.fillStyle = hg;
    ctx!.fillRect(0, horizon - 40, W, 160);
    void now;
  }

  function step(dt: number) {
    gridScroll = (gridScroll + dt * 0.35) % 14;
    dash = (dash + dt * 40) % 1000;
    for (const n of nodes) {
      n.u += n.du * dt;
      n.v += n.dv * dt;
      if (n.u < -1 || n.u > 1) n.du *= -1;
      if (n.v < 0.05 || n.v > 1) n.dv *= -1;
      n.u = Math.max(-1, Math.min(1, n.u));
      n.v = Math.max(0.05, Math.min(1, n.v));
    }
    // Ease "you" toward the pointer or the autopilot path.
    if (!target.active) {
      const t = performance.now() / 1000;
      target.x = W * (0.6 + 0.22 * Math.sin(t * 0.21) + 0.08 * Math.sin(t * 0.53));
      target.y = H * (0.6 + 0.16 * Math.sin(t * 0.17 + 1.3) + 0.06 * Math.cos(t * 0.41));
    }
    const k = 1 - Math.pow(0.001, dt);
    you.x += (target.x - you.x) * k * 0.6;
    you.y += (target.y - you.y) * k * 0.6;
  }

  function render(now: number) {
    ctx!.clearRect(0, 0, W, H);
    drawGrid(now);

    const pts = nodes.map((n) => ({ n, ...project(n.u, n.v) }));

    // Node-to-node links
    const linkR = Math.min(140, W * 0.11);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        const reach = linkR * ((a.s + b.s) / 2);
        if (d < reach) {
          const alpha = (1 - d / reach) * 0.22;
          ctx!.strokeStyle = `rgba(${SKY},${alpha})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }
    }

    // Links from "you" to nearby nodes + route through closest hops
    const youR = Math.min(220, W * 0.18);
    const near = pts
      .map((p) => ({ p, d: Math.hypot(p.x - you.x, p.y - you.y) }))
      .filter((o) => o.d < youR)
      .sort((a, b) => a.d - b.d);

    for (const { p, d } of near) {
      const alpha = (1 - d / youR) * 0.55;
      ctx!.strokeStyle = `rgba(${SIGNAL},${alpha})`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(you.x, you.y);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
    }

    // Route: you -> nearest -> its nearest unvisited ... (4 hops)
    if (near.length) {
      const visited = new Set<number>();
      let cur = { x: you.x, y: you.y };
      const route: { x: number; y: number }[] = [cur];
      for (let hop = 0; hop < 4; hop++) {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < pts.length; i++) {
          if (visited.has(i)) continue;
          const d = Math.hypot(pts[i].x - cur.x, pts[i].y - cur.y);
          if (d < bestD && d < youR * 1.4) {
            bestD = d;
            best = i;
          }
        }
        if (best < 0) break;
        visited.add(best);
        cur = pts[best];
        route.push(cur);
      }
      if (route.length > 1) {
        ctx!.save();
        ctx!.setLineDash([6, 8]);
        ctx!.lineDashOffset = -dash;
        ctx!.strokeStyle = `rgba(${SIGNAL},0.9)`;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.moveTo(route[0].x, route[0].y);
        for (let i = 1; i < route.length; i++) ctx!.lineTo(route[i].x, route[i].y);
        ctx!.stroke();
        ctx!.restore();
        // Route waypoint markers
        for (let i = 1; i < route.length; i++) {
          ctx!.fillStyle = `rgba(${SIGNAL},0.95)`;
          ctx!.beginPath();
          ctx!.arc(route[i].x, route[i].y, 3.2, 0, Math.PI * 2);
          ctx!.fill();
        }
      }
    }

    // Nodes
    for (const p of pts) {
      const d = Math.hypot(p.x - you.x, p.y - you.y);
      const lit = Math.max(0, 1 - d / youR);
      const tw = 0.6 + 0.4 * Math.sin(now / 900 + p.n.seed);
      const r = p.n.r * p.s * (1 + lit * 0.8);
      const a = 0.25 + 0.5 * p.s * tw + lit * 0.4;
      ctx!.fillStyle = lit > 0.05 ? `rgba(${SIGNAL},${Math.min(1, a)})` : `rgba(${SKY},${Math.min(0.9, a)})`;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    // Pings
    pings = pings.filter((pg) => now - pg.t0 < 1600);
    for (const pg of pings) {
      const t = (now - pg.t0) / 1600;
      const p = project(pg.node.u, pg.node.v);
      ctx!.strokeStyle = `rgba(${SIGNAL},${(1 - t) * 0.7})`;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, 4 + t * 34 * p.s, 0, Math.PI * 2);
      ctx!.stroke();
    }

    // "You" marker: reticle
    const pulse = 0.5 + 0.5 * Math.sin(now / 500);
    ctx!.strokeStyle = `rgba(${SIGNAL},${0.5 + pulse * 0.4})`;
    ctx!.lineWidth = 1.2;
    ctx!.beginPath();
    ctx!.arc(you.x, you.y, 10 + pulse * 2, 0, Math.PI * 2);
    ctx!.stroke();
    ctx!.beginPath();
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      ctx!.moveTo(you.x + dx * 14, you.y + dy * 14);
      ctx!.lineTo(you.x + dx * 22, you.y + dy * 22);
    }
    ctx!.stroke();
    ctx!.fillStyle = '#e9edf2';
    ctx!.beginPath();
    ctx!.arc(you.x, you.y, 2.6, 0, Math.PI * 2);
    ctx!.fill();
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    if (Math.random() < dt * 0.9 && nodes.length) {
      pings.push({ node: nodes[Math.floor(Math.random() * nodes.length)], t0: now });
    }
    render(now);
    raf = requestAnimationFrame(frame);
  }

  function onMove(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    target.x = e.clientX - rect.left;
    target.y = e.clientY - rect.top;
    target.active = true;
  }
  function onLeave() {
    target.active = false;
  }

  // Pause when off-screen to save battery.
  let visible = true;
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!visible && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    { threshold: 0.02 },
  );

  const ro = new ResizeObserver(() => {
    resize();
    if (reduce) render(performance.now());
  });

  resize();
  ro.observe(host);
  io.observe(canvas);
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave);

  if (reduce) {
    render(performance.now());
  } else {
    raf = requestAnimationFrame(frame);
  }

  return () => {
    cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    io.disconnect();
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerleave', onLeave);
  };
}
