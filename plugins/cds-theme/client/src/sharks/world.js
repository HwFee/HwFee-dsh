// Vendored from stackedlol/ascii-sharks (upstream ships no license; provenance
// note in client/src/ocean.js). Transpiled from TypeScript with esbuild; the
// only behaviour changes are marked PATCHED in the file.
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math.js";
import { pickSpecies, SPECIES } from "./species.js";
const SHARK_NODES = 20;
/**
 * PATCHED: a whale swims a closed elliptical LANE of its own.
 *
 * WHY LANES. The previous model steered a head through a field of obstacles and
 * then searched candidate poses until the whole spine was legal. Every failure
 * the user reported came from that search: a rejected step froze an animal for
 * minutes, a "recovery" step translated the whole body, an edge escape let one
 * leave the canvas, and steering terms fought in corners. Lanes remove the
 * search instead of tuning it: the body is DERIVED from the head's position on a
 * fixed curve, so containment, spacing and progress are properties of the
 * geometry rather than of a per-frame solver.
 *
 * WHY HOMOTHETIC ELLIPSES. Each lane is the same ellipse scaled about the same
 * centre, so the normal distance between two neighbouring lanes has a provable
 * floor. Take a point `p` on the outer lane; the tangent line there is at
 * distance `h = 1 / sqrt(cos^2 t / a^2 + sin^2 t / b^2) >= min(a, b)` from the
 * centre, and the inner lane lies entirely in the half-plane `n . x <= k h`.
 * `p` sits on `n . x = h`, so its distance to the inner lane is at least
 * `(1 - k) h >= (1 - k) min(a, b)`. With lanes at scales `s_i`, neighbours are
 * therefore at least `(s_i - s_{i+1}) * min(a, b)` apart — the number this file
 * and its tests assert. Shrinking both radii by a fixed `gap` per lane has no
 * such bound when the aspect ratio is extreme (the flat sides move by less than
 * the ends), which is why the shrink is a single scale factor.
 *
 * WHY THE BODY IS SAMPLED BEHIND THE HEAD. A whale is a chain on the route its
 * nose has just swum. Twenty nodes at fixed ARC-LENGTH offsets behind the head
 * satisfy that by construction: there is no joint solver, nothing is rotated
 * about a centroid, and the tail cannot cut a corner the head did not take.
 * Chords between samples are a fraction of a percent shorter than their arc
 * (an ellipse with `b = 105` and a 5px segment: 0.2%), which is geometry, not a
 * tolerance to hide a constraint.
 */
/** Required spine-to-spine gap, as a fraction of the two lengths added. */
const SHARK_CLEARANCE = 0.125;
/**
 * Extra room between two lanes beyond the required spine clearance.
 *
 * Body width and the chord sagitta (a chord of the outer lane bows toward the
 * inner one) live here. It is a FRACTION of the two lengths added, not a few
 * extra pixels, so the lane spacing stays proportional to the animals: a big
 * resize maps every length and every gap together, and the ratio the tests
 * measure is the same at 320x240 and at 1600x400.
 */
const LANE_GAP_BODY = 0.1;
/**
 * Room between the outermost lane and the window edge: glyph reach plus a rest.
 *
 * The body centre line lies ON the lane, so the drawn silhouette extends a
 * little beyond it. This is the allowance the user specified (0.15 body + 12px).
 */
const LANE_PAD_BODY = 0.15;
const LANE_PAD_PX = 12;
/** Arc-length table resolution. ~0.006 rad per segment: chord error under 1e-3 px. */
const LANE_SEGMENTS = 1024;
/**
 * The innermost lane never shrinks below this fraction of the outer ellipse.
 *
 * Only reachable with a roster of many large bodies; the normal three-whale
 * layout stops well above it. Below this an ellipse would be too small to hold
 * a body, so the planner shrinks the BODIES instead (`buildLanes` retries).
 */
const MIN_LANE_SCALE = 0.3;
/** The innermost ellipse must hold its (shortest) body plus this much follow room. */
const LANE_BODY_FIT = 1.25;
/**
 * A resize under this relative change is layout noise and moves nothing.
 *
 * A composer reflowing by one line changes `min(w/sw, h/sh)` by a few pixels;
 * reconstructing the lanes for that made the school jump. Same size must be
 * bit-identical, one pixel must move nothing, and a real change is mapped once.
 */
const RESIZE_HYSTERESIS = 0.04;
/** Cruise speeds: base plus a slow, smooth wobble so no two animals match. */
const SPEED_WOBBLE = 0.08;
const SPEED_WOBBLE_RATE = 0.23;
const FIELD_EDGE = 6;
const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6;
/**
 * Click records: how long one is kept, and how many can exist.
 *
 * They carry no steering (`lure()` is a disturbance only), but capping them
 * still matters — a click-spam burst must not grow an array without bound, and
 * the renderer never needs more than the last few.
 */
const LURE_LIFE = 2.5;
const MAX_LURES = 4;
const DEFAULT_SHARKS = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 }
];
/**
 * Build one lane: a homothetic ellipse with its own arc-length table.
 *
 * `cum[k]` is the distance along the curve from parameter 0 to `k * stepT`, so
 * an arc position can be found by binary search and the exact ellipse evaluated
 * at the interpolated parameter (the point stays ON the curve; only the
 * parameter-to-distance mapping is interpolated, to O(stepT^2)).
 */
function makeLane(cx, cy, a, b, scale) {
  const ra = a * scale;
  const rb = b * scale;
  const stepT = TAU / LANE_SEGMENTS;
  const cum = new Float64Array(LANE_SEGMENTS + 1);
  let x0 = ra;
  let y0 = 0;
  for (let k = 1; k <= LANE_SEGMENTS; k += 1) {
    const t = k * stepT;
    const x = ra * Math.cos(t);
    const y = rb * Math.sin(t);
    cum[k] = cum[k - 1] + Math.hypot(x - x0, y - y0);
    x0 = x;
    y0 = y;
  }
  return {
    cx,
    cy,
    a: ra,
    b: rb,
    scale,
    cum,
    stepT,
    segments: LANE_SEGMENTS,
    perimeter: cum[LANE_SEGMENTS]
  };
}
/**
 * Plan the nested lanes for a field and a sorted list of body lengths.
 *
 * `lengths` arrives ascending and the SHORTEST body takes the innermost lane, so
 * the longest animal has the most curve to swim. The gap is chosen from the
 * clearance the two longest neighbours need, and the loop shrinks every body
 * together if the innermost ellipse would be too small to hold one (a roster of
 * many whales); for the shipped three this never triggers.
 */
function buildLanes(width, height, lengths) {
  const count = lengths.length;
  let bodyScale = 1;
  let plan = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const lens = lengths.map((length) => length * bodyScale);
    const longest = lens[count - 1] || 0;
    const shortest = lens[0] || 0;
    const pad = Math.min(
      FIELD_EDGE + longest * LANE_PAD_BODY + LANE_PAD_PX,
      Math.min(width, height) * 0.35
    );
    const a = Math.max(1, width / 2 - pad);
    const b = Math.max(1, height / 2 - pad);
    const minRadius = Math.min(a, b);
    let gap = 0;
    if (count > 1) {
      // The outermost pair is the widest; every inner pair is strictly shorter,
      // and the same fraction leaves each of them the required clearance plus
      // the body margin. One number therefore covers the whole lattice.
      gap = (longest + lens[count - 2]) * (SHARK_CLEARANCE + LANE_GAP_BODY);
    }
    // Upper bound on the scale step: the innermost lane must stay usable.
    const fitStep = count > 1 ? (1 - MIN_LANE_SCALE) / (count - 1) : 1;
    const step = Math.min(fitStep, gap > 0 ? gap / minRadius : 1);
    const lanes = [];
    for (let i = 0; i < count; i += 1) {
      lanes.push(makeLane(width / 2, height / 2, a, b, 1 - i * step));
    }
    plan = { lanes, lengths: lens };
    const inner = lanes[count - 1];
    if (count < 2 || inner.perimeter >= shortest * LANE_BODY_FIT) break;
    bodyScale *= 0.9;
  }
  return plan;
}
/** Write the lane point at `arc` into `out` (`{x, y}`); arc wraps. */
function sampleLane(lane, arc, out) {
  const perimeter = lane.perimeter;
  let d = arc % perimeter;
  if (d < 0) d += perimeter;
  const cum = lane.cum;
  let lo = 0;
  let hi = lane.segments;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[lo + 1] - cum[lo];
  const frac = span > 1e-9 ? (d - cum[lo]) / span : 0;
  const t = (lo + frac) * lane.stepT;
  out.x = lane.cx + lane.a * Math.cos(t);
  out.y = lane.cy + lane.b * Math.sin(t);
  return out;
}
/**
 * Re-seat a whale's whole body on its own lane from its arc position.
 *
 * Every node is an arc-length offset behind the head, so the spine IS the route
 * the nose has just swum. `heading` is the nose chord (head to second node): it
 * is where the animal visibly points, and it differs from the instantaneous
 * tangent by half a segment of curvature (`kappa * seg / 2`), which is the only
 * honest reading of "the head faces along the route".
 *
 * `u` is monotone (it is the distance SWUM, never wrapped) and only the sample
 * parameter wraps, so the tail's history is "the head's position `k * seg` of
 * travel ago" without any modular arithmetic on the clock.
 */
function placeBody(world, sh) {
  const lane = sh.lane;
  const perimeter = lane.perimeter;
  const dir = sh.dir;
  const seg = sh.segment;
  const out = world.samplePoint;
  const nodes = sh.nodes;
  for (let k = 0; k < SHARK_NODES; k += 1) {
    sampleLane(lane, dir * sh.u - dir * seg * k, out);
    nodes[k * 2] = out.x;
    nodes[k * 2 + 1] = out.y;
  }
  const hx = nodes[0] - nodes[2];
  const hy = nodes[1] - nodes[3];
  if (hx !== 0 || hy !== 0) sh.heading = Math.atan2(hy, hx);
}
class World {
  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(sharkSpecs = DEFAULT_SHARKS, fishCount) {
    this.sharkSpecs = sharkSpecs;
    this.fishCount = fishCount;
  }
  width = 0;
  height = 0;
  time = 0;
  fish = [];
  sharks = [];
  events = [];
  pointer = { x: 0, y: 0, active: false };
  /** Recent direction hints; only the newest influences swimming. */
  lures = [];
  lureSeq = 0;
  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  perception = 60;
  /** Per-species personal space in px (x, y). */
  sepX = [];
  sepY = [];
  foreignSep = 40;
  bucketCols = 0;
  bucketRows = 0;
  bucketHead = new Int32Array(0);
  bucketCount = new Uint16Array(0);
  bucketNext = new Int32Array(0);
  lastSpawn = 0;
  tmp = { x: 0, y: 0 };
  /** Scratch for lane sampling; one allocation per world, never per node. */
  samplePoint = { x: 0, y: 0 };
  /** The field size the lanes were planned for (resize hysteresis). */
  fieldWidth = 0;
  fieldHeight = 0;
  waterBounds() {
    const pad = FIELD_EDGE;
    return {left: pad, right: this.width - pad, top: pad, bottom: this.height - pad};
  }
  resize(width, height, cellW, cellH) {
    if (!(width > 0 && height > 0)) return;
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Fish metrics follow the cell grid; they are cheap and idempotent.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;
    if (first) {
      this.fieldWidth = width;
      this.fieldHeight = height;
      this.seed();
      return;
    }
    // REFIT ONLY WHEN THE FIELD REALLY CHANGED. A composer reflowing by one line
    // must move nothing; same size is bit-identical. A change of SHAPE counts
    // even when the min scale does not (1600x400 from 1200x800 keeps the width
    // while the water gets much shorter).
    const scale = Math.min(width / this.fieldWidth, height / this.fieldHeight);
    const aspect = (width / height) / (this.fieldWidth / this.fieldHeight);
    if (Math.abs(scale - 1) > RESIZE_HYSTERESIS
      || Math.abs(aspect - 1) > RESIZE_HYSTERESIS) {
      this.relayout(width, height);
      this.fieldWidth = width;
      this.fieldHeight = height;
    }
    this.lures.length = 0;
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }
  /**
   * Re-plan the lanes for a new field, keeping each whale's progress.
   *
   * The mapping is proportional: each animal keeps its fraction along its
   * direction of travel (`u / perimeter`) and its direction, and its length is
   * re-derived from the new short side (so a smaller window has smaller whales
   * and the same turning room). Nothing accumulates: returning to a size
   * reproduces the previous bodies exactly.
   */
  relayout(width, height) {
    const count = this.sharks.length;
    if (count === 0) return;
    const baseLength = Math.min(Math.min(width, height) * 0.28, 300);
    const plan = buildLanes(width, height, this.sharks.map((sh) => baseLength * sh.size));
    this.sharks.forEach((sh, i) => {
      // `u` is monotone, so the fraction has to be taken modulo the OLD
      // perimeter; that keeps the animal where it was along the loop.
      const frac = sh.lane
        ? (sh.u % sh.lane.perimeter) / sh.lane.perimeter
        : (i + 0.5) / count;
      sh.lane = plan.lanes[count - 1 - i];
      sh.length = plan.lengths[i];
      sh.segment = sh.length / (SHARK_NODES - 1);
      sh.baseSpeed = 30 + sh.length * 0.04;
      sh.speed = sh.baseSpeed;
      sh.u = frac * sh.lane.perimeter;
      placeBody(this, sh);
    });
  }
  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    // A fixed 170px minimum made whales oversized in a narrow view; match the
    // available water so a cold start has the same room as a resized scene.
    const baseLength = Math.min(minSide * 0.28, 300);
    const entries = this.sharkSpecs
      .map((spec, index) => ({
        kind: spec.kind,
        size: spec.size,
        length: baseLength * spec.size,
        index
      }))
      .sort((a, b) => a.length - b.length);
    const count = entries.length;
    const plan = buildLanes(W, H, entries.map((entry) => entry.length));
    // PHASE AND DIRECTION ARE PER ANIMAL, so the group never swims in step.
    // The lanes are nested and never cross, which is what keeps the bodies
    // apart; no separation steering is involved.
    this.sharks = entries.map((entry, i) => {
      const lane = plan.lanes[count - 1 - i];
      const dir = i % 2 === 0 ? 1 : -1;
      const phase = rand(0, TAU);
      const frac = ((i + 0.5) / count + phase / TAU * 0.18) % 1;
      const length = plan.lengths[i];
      const sh = {
        id: entry.index + 1,
        kind: entry.kind,
        size: entry.size,
        length,
        nodes: new Float32Array(SHARK_NODES * 2),
        heading: 0,
        baseSpeed: 30 + length * 0.04,
        speed: 30 + length * 0.04,
        /** Spine segment length; equal ARC spacing between the sampled nodes. */
        segment: length / (SHARK_NODES - 1),
        phase,
        turn: 0,
        depth: entry.size,
        lane,
        dir,
        u: frac * lane.perimeter
      };
      placeBody(this, sh);
      return sh;
    });
    const total = this.fishCount ?? clamp(Math.round(W * H / 4400), 85, 340);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }
  splash(x, y) {
    this.events.push({ kind: "splash", x, y });
    const r = 240;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      const k = (1 - d / r) * 260;
      f.vx += dx / d * k;
      f.vy += dy / d * k;
      f.alarm = 1;
    }
  }
  step(dt) {
    this.time += dt;
    // Click records expire on their own. They exist only so a burst of clicks
    // cannot accumulate state; they steer nothing.
    if (this.lures.length > 0) {
      for (let i = this.lures.length - 1; i >= 0; i -= 1) {
        if (this.time - this.lures[i].born > LURE_LIFE) this.lures.splice(i, 1);
      }
    }
    this.rebuildHash();
    this.stepFish(dt);
    this.stepSharks(dt);
    this.respawn();
  }

  /**
   * Register a click: a disturbance in the water, nothing more.
   *
   * PATCHED. This used to freeze a bearing from the group centre and hand every
   * whale that direction for 2.5 s, which is the "whales follow the pointer"
   * behaviour that was asked to go. The only effect now is `splash()`: the
   * school around the point scatters, and the renderer stamps the blue pulse
   * (`energy`/`heat`) that the user asked to keep. No heading, speed or position
   * of a whale is touched.
   */
  lure(x, y) {
    this.lureSeq += 1;
    const click = { x, y, born: this.time, seq: this.lureSeq };
    this.lures.push(click);
    if (this.lures.length > MAX_LURES) this.lures.shift();
    this.splash(x, y);
    return click;
  }

  /** The newest click, or null. Kept for the host's probes. */
  liveLure() {
    return this.lures.length > 0 ? this.lures[this.lures.length - 1] : null;
  }
  rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }
  bucketOf(x, y) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }
  stepFish(dt) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;
      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;
      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;
      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    const k = (1 - d / foreignSep) / d * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }
      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + cx / n * cohesionK;
        ay += (avy / n - f.vy) * alignK + cy / n * cohesionK;
        if (sp.mill > 0) {
          const cl = Math.hypot(cx, cy) || 1;
          ax += -cy / cl * f.millDir * sp.mill * (1 - f.alarm);
          ay += cx / cl * f.millDir * sp.mill * (1 - f.alarm);
        }
      }
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }
      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += dx / d * FISH_FLEE_K * w;
          ay += dy / d * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;
      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }

  /**
   * Advance every whale along its own lane.
   *
   * `u` is the ARC LENGTH travelled and only ever grows; the head is the lane
   * point at `dir * u`, and each of the twenty nodes is a fixed arc offset
   * behind it (`placeBody`). Nothing here searches, steers, or repositions: the
   * per-frame cost is twenty table lookups per animal.
   *
   * The speed wobble is smooth (a sine of the simulation clock) and phase-shifted
   * per animal, so two whales never share a pace. The distance is never
   * negative, which is the "head always moves forward" invariant, and the
   * lattice of lanes is what guarantees the bodies never meet.
   */
  stepSharks(dt) {
    const { sharks, time } = this;
    for (const sh of sharks) {
      const wobble = 1 + SPEED_WOBBLE * Math.sin(time * SPEED_WOBBLE_RATE + sh.phase * 1.3);
      sh.speed = sh.baseSpeed * wobble;
      sh.phase += dt * (2 + sh.speed / 24);
      // MONOTONE: `u` is the distance travelled and is never wrapped or reduced.
      // Only `sampleLane` wraps the parameter, so the body's arc offsets stay
      // valid across a lap and the head's progress is monotone by construction.
      sh.u += sh.speed * dt;
      const previous = sh.heading;
      placeBody(this, sh);
      const rate = angleDiff(previous, sh.heading) / Math.max(1e-6, dt);
      sh.turn += (rate - sh.turn) * Math.min(1, dt * 6);
      const mouthR = sh.length * 0.05 + 8;
      const mx = sh.nodes[0];
      const my = sh.nodes[1];
      for (const f of this.fish) {
        if (!f.alive) continue;
        if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
          f.alive = false;
          f.respawnAt = time + rand(3, 8);
          this.events.push({ kind: "eat", x: f.x, y: f.y });
        }
      }
    }
  }
  respawn() {
    const { time, width: W, height: H } = this;
    const due = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
export {
  SHARK_NODES,
  World
};
