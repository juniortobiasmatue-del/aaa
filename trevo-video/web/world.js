// Mundo 3D low-poly do trevo: geometria, rotas dos carros, terreno, árvores.
// Coordenadas: x = leste, z = sul, y = para cima. Tráfego pela direita (Brasil).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const W = 2.5;      // centro da faixa em relação ao eixo da pista
export const HALF = 5;     // meia-largura da pista principal
export const R = 26;       // raio das alças (esquerda, 270 graus)
export const RD = 11;      // raio das saídas diagonais (direita)
export const H = 4.0;      // altura do tabuleiro do viaduto
export const ZF = 11;      // trecho plano do viaduto
export const ZG = 27;      // onde a rampa do viaduto chega ao chão
export const EXT = 112;    // comprimento das pistas para cada lado

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const hprof = (z) => H * (1 - ss(ZF, ZG, Math.abs(z)));
const HR = hprof(W + RD);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- vértices e rotas
// vértice: {x,z,m,u}; m=0 chão, 1 segue o viaduto (pista B), 2 rampa subindo, 3 rampa descendo
export function yOf(v, lam) {
  switch (v.m) {
    case 1: return lam * hprof(v.z);
    case 2: return lam * HR * ss(0.5, 1, v.u);
    case 3: return lam * HR * ss(0.5, 1, 1 - v.u);
    default: return 0;
  }
}
const rot = (v, k) => { let { x, z } = v; for (let i = 0; i < k; i++) { const nx = -z; z = x; x = nx; } return { ...v, x, z }; };

function arc(P, psi, r, delta, step, m) {
  const C = { x: P.x - psi[1] * r, z: P.z + psi[0] * r };
  const phi0 = Math.atan2(P.z - C.z, P.x - C.x);
  const N = Math.max(4, Math.ceil((r * delta) / step));
  const out = [];
  for (let j = 0; j <= N; j++) {
    const phi = phi0 + (delta * j) / N;
    out.push({ x: C.x + r * Math.cos(phi), z: C.z + r * Math.sin(phi), m, u: j / N });
  }
  return out;
}

function straightVerts(k) {
  const a = [];
  for (let x = -EXT; x <= EXT; x += 2) a.push({ x, z: W, m: 0, u: 0 });
  return a.map((v) => ({ ...rot(v, k), m: k % 2 ? 1 : 0 }));
}

function loopBase(k) {
  const ent = k % 2 ? 1 : 0, ext = k % 2 ? 0 : 1;
  const P0 = { x: R + W, z: W };
  const approach = [];
  for (let x = -EXT; x <= P0.x - 8; x += 2) approach.push({ x, z: W, m: ent, u: 0 });
  const inn = [-6, -4, -2].map((dx) => ({ x: P0.x + dx, z: W, m: ent, u: 0 }));
  const a = arc(P0, [1, 0], R, 1.5 * Math.PI, 1.6, 0);
  const out = [2, 4].map((dz) => ({ x: W, z: W + R - dz, m: ext, u: 0 }));
  const cont = [];
  for (let z = W + R - 6; z >= -EXT; z -= 2) cont.push({ x: W, z, m: ext, u: 0 });
  const piece = [...inn, ...a, ...out];
  const route = [...approach, ...piece, ...cont];
  const i0 = approach.length;
  return { piece, route, marks: { in0: i0, arc0: i0 + inn.length, arc1: i0 + inn.length + a.length - 1, end: i0 + piece.length - 1 } };
}

function diagBase(k) {
  const ent = k % 2 ? 1 : 0, ext = k % 2 ? 0 : 1, mode = k % 2 ? 3 : 2;
  const P = { x: -W - RD, z: W };
  const approach = [];
  for (let x = -EXT; x <= P.x - 8; x += 2) approach.push({ x, z: W, m: ent, u: 0 });
  const inn = [-6, -4, -2].map((dx) => ({ x: P.x + dx, z: W, m: ent, u: 0 }));
  const a = arc(P, [1, 0], RD, Math.PI / 2, 1.2, mode);
  const out = [2, 4, 6, 8].map((dz) => ({ x: -W, z: W + RD + dz, m: ext, u: 0 }));
  const cont = [];
  for (let z = W + RD + 10; z <= EXT; z += 2) cont.push({ x: -W, z, m: ext, u: 0 });
  const piece = [...inn, ...a, ...out];
  const route = [...approach, ...piece, ...cont];
  const i0 = approach.length;
  return { piece, route, marks: { in0: i0, arc0: i0 + inn.length, arc1: i0 + inn.length + a.length - 1, end: i0 + piece.length - 1 } };
}

export class Route {
  constructor(id, verts, marks = {}) {
    this.id = id; this.v = verts;
    this.cum = [0];
    for (let i = 1; i < verts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(verts[i].x - verts[i - 1].x, verts[i].z - verts[i - 1].z));
    this.L = this.cum[this.cum.length - 1];
    this.marks = {};
    for (const [k, i] of Object.entries(marks)) this.marks[k] = this.cum[i];
  }
  pos(s, lam) {
    const v = this.v, cum = this.cum;
    s = clamp(s, 0, this.L);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const f = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return { x: lerp(v[lo].x, v[hi].x, f), z: lerp(v[lo].z, v[hi].z, f), y: lerp(yOf(v[lo], lam), yOf(v[hi], lam), f) };
  }
  pose(s, lam) {
    const p = this.pos(s, lam), a = this.pos(s - 0.9, lam), b = this.pos(s + 0.9, lam);
    const dx = b.x - a.x, dz = b.z - a.z, h = Math.hypot(dx, dz) || 1;
    return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-dz, dx), pitch: Math.atan2(b.y - a.y, h), dx: dx / h, dz: dz / h };
  }
}

export const ROUTES = {};
export const PIECES = { loops: [], diags: [] };
['A_E', 'B_S', 'A_W', 'B_N'].forEach((id, k) => { ROUTES[id] = new Route(id, straightVerts(k)); });
for (let k = 0; k < 4; k++) {
  const l = loopBase(k);
  const rl = (a) => a.map((v) => rot(v, k));
  ROUTES['L' + k] = new Route('L' + k, rl(l.route), l.marks);
  PIECES.loops.push({ k, verts: rl(l.piece), center: rot({ x: R + W, z: R + W, m: 0, u: 0 }, k) });
  const d = diagBase(k);
  ROUTES['D' + k] = new Route('D' + k, d.route.map((v) => rot(v, k)), d.marks);
  PIECES.diags.push({ k, verts: d.piece.map((v) => rot(v, k)) });
}

// ---------------------------------------------------------------- malhas
export function makeRibbon(verts, halfW, color, yOff = 0.05, extra = {}) {
  const n = verts.length, pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const a = verts[Math.max(0, i - 1)], b = verts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    pos[i * 6] = verts[i].x + nx * halfW; pos[i * 6 + 2] = verts[i].z + nz * halfW;
    pos[i * 6 + 3] = verts[i].x - nx * halfW; pos[i * 6 + 5] = verts[i].z - nz * halfW;
    nor[i * 6 + 1] = 1; nor[i * 6 + 4] = 1;
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // face voltada para cima
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -(extra.layer || 1), polygonOffsetUnits: -(extra.layer || 1), transparent: !!extra.transparent, opacity: extra.opacity ?? 1 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  const api = {
    mesh, verts, n,
    update(lam) {
      for (let i = 0; i < n; i++) { const y = yOf(verts[i], lam) + yOff; pos[i * 6 + 1] = y; pos[i * 6 + 4] = y; }
      g.attributes.position.needsUpdate = true;
    },
    setReveal(f) { g.setDrawRange(0, Math.floor(clamp(f) * (n - 1)) * 6); mesh.visible = f > 0.001; },
  };
  api.update(1);
  return api;
}

export function makeDeck() {
  const zs = []; for (let z = -EXT; z <= EXT; z += 2) zs.push(z);
  const n = zs.length, hw = HALF + 0.25, th = 1.3, V = 8;
  const pos = new Float32Array(n * V * 3), col = new Float32Array(n * V * 3), idx = [];
  const asphalt = new THREE.Color(0x3a3f4b), conc = new THREE.Color(0xeeebe4), concD = new THREE.Color(0xb7b3aa);
  const cset = [asphalt, asphalt, conc, conc, conc, conc, concD, concD];
  for (let i = 0; i < n; i++) for (let j = 0; j < V; j++) { const c = cset[j]; const o = (i * V + j) * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
  const flip = [true, false, true, false]; // topo, parede esq., parede dir., fundo: todas com a face para fora
  for (let i = 0; i < n - 1; i++) for (let p = 0; p < 4; p++) {
    const a = i * V + p * 2, b = a + 1, c = (i + 1) * V + p * 2, d = c + 1;
    if (flip[p]) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const set = (i, j, x, y, z) => { const o = (i * V + j) * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; };
  return {
    mesh,
    update(lam) {
      for (let i = 0; i < n; i++) {
        const z = zs[i], y = lam * hprof(z) + 0.045;
        set(i, 0, -hw, y, z); set(i, 1, hw, y, z);
        set(i, 2, -hw, y, z); set(i, 3, -hw, y - th, z);
        set(i, 4, hw, y, z); set(i, 5, hw, y - th, z);
        set(i, 6, -hw, y - th, z); set(i, 7, hw, y - th, z);
      }
      g.attributes.position.needsUpdate = true;
      g.computeBoundingSphere();
    },
  };
}

// ---------------------------------------------------------------- terreno e árvores
function noise2(x, z) { return Math.sin(x * 0.045) * Math.cos(z * 0.05) + 0.5 * Math.sin(x * 0.11 + z * 0.07) + 0.35 * Math.sin(z * 0.13 - x * 0.09); }
export function terrainH(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  const f = ss(72, 108, Math.max(ax, az)) * ss(16, 40, Math.min(ax, az));
  return f * Math.max(0, 11 + 9 * noise2(x, z));
}

export function makeTerrain() {
  const size = 760, seg = 126;
  const g0 = new THREE.PlaneGeometry(size, size, seg, seg);
  g0.rotateX(-Math.PI / 2);
  const p = g0.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i)));
  const g = g0.toNonIndexed();
  g.computeVertexNormals();
  const r = rng(7), pa = g.attributes.position, colors = new Float32Array(pa.count * 3);
  const lo = new THREE.Color(0x67bb48), hi = new THREE.Color(0x93d65c), dk = new THREE.Color(0x58a83f), c = new THREE.Color();
  for (let i = 0; i < pa.count; i += 3) {
    const h = (pa.getY(i) + pa.getY(i + 1) + pa.getY(i + 2)) / 3;
    c.copy(lo).lerp(hi, clamp(h / 16)).lerp(dk, r() * 0.55);
    for (let j = 0; j < 3; j++) { colors[(i + j) * 3] = c.r; colors[(i + j) * 3 + 1] = c.g; colors[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

export function makeTrees(count = 520) {
  const trunk = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 5); trunk.translate(0, 1.1, 0);
  const f1 = new THREE.ConeGeometry(2.5, 4.4, 6); f1.translate(0, 4.2, 0);
  const f2 = new THREE.ConeGeometry(1.9, 3.5, 6); f2.translate(0, 6.4, 0);
  const paint = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
  const geo = mergeGeometries([paint(trunk, 0x7a5232), paint(f1, 0x2f8f46), paint(f2, 0x3aa653)].map((x) => x.toNonIndexed()));
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), count);
  const r = rng(21), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < count && tries++ < 20000) {
    const x = (r() - 0.5) * 320, z = (r() - 0.5) * 320;
    const ax = Math.abs(x), az = Math.abs(z);
    if (Math.max(ax, az) < 64 || Math.min(ax, az) < 14) continue;
    const s = 0.8 + r() * 0.8;
    e.set(0, r() * 6.28, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, terrainH(x, z) - 0.3, z), q, new THREE.Vector3(s, s * (0.9 + r() * 0.4), s));
    mesh.setMatrixAt(placed, m);
    col.setHSL(0.33 + (r() - 0.5) * 0.05, 0.55, 0.85 + r() * 0.3);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export function makeClouds() {
  const g = new THREE.Group(), r = rng(5);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.85 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(geo, mat); const s = 7 + r() * 7; m.scale.set(s * 1.4, s * 0.8, s); m.position.set(j * 9 - 14, r() * 3, (r() - 0.5) * 6); c.add(m); }
    const a = r() * Math.PI * 2, d = 140 + r() * 120;
    c.position.set(Math.cos(a) * d, 70 + r() * 30, Math.sin(a) * d);
    c.userData.base = c.position.clone();
    g.add(c);
  }
  return g;
}

// ---------------------------------------------------------------- carros e semáforos
const CG = {
  body: new THREE.BoxGeometry(4.2, 0.7, 2.0), cab: new THREE.BoxGeometry(2.3, 0.65, 1.75),
  wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.4, 8), lamp: new THREE.BoxGeometry(0.1, 0.22, 0.45),
};
const CM = {
  glass: new THREE.MeshStandardMaterial({ color: 0xa9d6f5, roughness: 0.3, metalness: 0.1, flatShading: true }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 1, flatShading: true }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe680, emissiveIntensity: 0.9 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 0.7 }),
};
export function createCar(color) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  const body = new THREE.Mesh(CG.body, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: true }));
  body.position.y = 0.75;
  const cab = new THREE.Mesh(CG.cab, CM.glass); cab.position.set(-0.2, 1.42, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 1.6), body.material); roof.position.set(-0.2, 1.8, 0);
  inner.add(body, cab, roof);
  for (const sx of [-1.35, 1.35]) for (const sz of [-1.0, 1.0]) { const w = new THREE.Mesh(CG.wheel, CM.wheel); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.42, sz); inner.add(w); }
  for (const sz of [-0.65, 0.65]) { const h = new THREE.Mesh(CG.lamp, CM.head); h.position.set(2.1, 0.8, sz); const t = new THREE.Mesh(CG.lamp, CM.tail); t.position.set(-2.1, 0.8, sz); inner.add(h, t); }
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  outer.add(inner); outer.userData.inner = inner;
  return outer;
}
export function setCarPose(car, p, scale = 1) {
  car.position.set(p.x, p.y, p.z);
  car.rotation.y = p.yaw;
  car.userData.inner.rotation.z = p.pitch || 0;
  car.scale.setScalar(scale);
}

export function createSignal() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.8, flatShading: true });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 5.2, 6), dark); pole.position.y = 2.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.0, 1.0), dark); head.position.y = 5.3;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.3), dark);
  g.add(pole, head); g.userData.lamps = [];
  const cols = [0xff2d2d, 0xffc400, 0x25e05a];
  cols.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0.0, roughness: 0.4 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), m); s.position.set(0, 6.2 - i * 0.95, 0.52);
    g.add(s); g.userData.lamps.push({ m, c });
  });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function setSignal(sig, state) { // 'r' | 'y' | 'g'
  const on = { r: 0, y: 1, g: 2 }[state];
  sig.userData.lamps.forEach((l, i) => { l.m.emissiveIntensity = i === on ? 2.2 : 0.04; l.m.color.setHex(i === on ? l.c : 0x1a1a1a); });
}
