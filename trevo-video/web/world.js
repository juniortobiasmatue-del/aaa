// Mundo 3D do trevo (v2): geometria parametrica, rotas dos carros, terreno, detalhes de estrada, carros.
// Coordenadas: x = leste, z = sul, y = para cima. Transito pela direita (Brasil).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HALF = 4.2;     // meia-largura da pista principal
export const W = HALF / 2;   // centro da faixa em relacao ao eixo
export const R = 32;         // raio das alcas (esquerda, 270 graus)
export const RD = 22;        // raio das saidas diagonais (direita)
export const H = 4.2;        // altura do tabuleiro do viaduto
export const ZF = 7.2;       // meia-extensao da ponte (encontros)
export const ZG = 30;        // onde o aterro termina (chao)
export const EXT = 125;      // comprimento das pistas para cada lado
export const RAMPH = 1.8;    // meia-largura das rampas

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const hprof = (z) => H * (1 - ss(ZF, ZG, Math.abs(z)));
const HR = hprof(W + RD);

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ================================================================ vertices e rotas
// vertice {x,z,m,u}; m=0 chao, 1 segue o viaduto (pista B), 2 rampa subindo, 3 rampa descendo
export function yOf(v, lam) {
  switch (v.m) {
    case 1: return lam * hprof(v.z);
    case 2: return lam * HR * ss(0.35, 1, v.u);
    case 3: return lam * HR * ss(0.35, 1, 1 - v.u);
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
  const piece = [...inn, ...a, ...out], route = [...approach, ...piece, ...cont], i0 = approach.length;
  return { piece, route, marks: { in0: i0, arc0: i0 + inn.length, arc1: i0 + inn.length + a.length - 1, end: i0 + piece.length - 1 }, arcRange: [inn.length, inn.length + a.length - 1] };
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
  const piece = [...inn, ...a, ...out], route = [...approach, ...piece, ...cont], i0 = approach.length;
  return { piece, route, marks: { in0: i0, arc0: i0 + inn.length, arc1: i0 + inn.length + a.length - 1, end: i0 + piece.length - 1 }, arcRange: [inn.length, inn.length + a.length - 1] };
}

export class Route {
  constructor(id, verts, marks = {}) {
    this.id = id; this.v = verts; this.cum = [0];
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
    const p = this.pos(s, lam), a = this.pos(s - 1.1, lam), b = this.pos(s + 1.1, lam);
    const dx = b.x - a.x, dz = b.z - a.z, h = Math.hypot(dx, dz) || 1;
    return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-dz, dx), pitch: Math.atan2(b.y - a.y, h), dx: dx / h, dz: dz / h };
  }
}
export const ROUTES = {};
export const PIECES = { loops: [], diags: [] };
['A_E', 'B_S', 'A_W', 'B_N'].forEach((id, k) => { ROUTES[id] = new Route(id, straightVerts(k)); });
for (let k = 0; k < 4; k++) {
  const l = loopBase(k), d = diagBase(k), rl = (a) => a.map((v) => rot(v, k));
  ROUTES['L' + k] = new Route('L' + k, rl(l.route), l.marks);
  PIECES.loops.push({ k, verts: rl(l.piece), arcRange: l.arcRange, center: rot({ x: R + W, z: R + W, m: 0, u: 0 }, k) });
  ROUTES['D' + k] = new Route('D' + k, rl(d.route), d.marks);
  PIECES.diags.push({ k, verts: rl(d.piece), arcRange: d.arcRange });
}

// ================================================================ texturas procedurais
export const TEX = {};
function canvasTexture(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function initTextures() {
  TEX.asphalt = canvasTexture(256, (g, s) => {
    g.fillStyle = '#4c525e'; g.fillRect(0, 0, s, s); const r = rng(3);
    for (let i = 0; i < 6500; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.04 + r() * 0.08})` : `rgba(0,0,0,${0.05 + r() * 0.12})`; g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 14; i++) { const x = r() * s, y = r() * s, rr = 20 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(0,0,0,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  });
  TEX.grass = canvasTexture(512, (g, s) => {
    g.fillStyle = '#7ec75a'; g.fillRect(0, 0, s, s); const r = rng(9);
    for (let i = 0; i < 16000; i++) { const x = r() * s, y = r() * s, l = 2 + r() * 6, a = r() * Math.PI * 2; g.strokeStyle = r() < 0.5 ? `rgba(255,255,160,${0.05 + r() * 0.12})` : `rgba(20,80,25,${0.07 + r() * 0.16})`; g.lineWidth = 1 + r() * 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 26; i++) { const x = r() * s, y = r() * s, rr = 30 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, r() < 0.5 ? 'rgba(255,255,140,0.10)' : 'rgba(10,70,20,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  }, 70, 70);
  const stripes = (base, dark, n) => (g, s) => { g.fillStyle = base; g.fillRect(0, 0, s, s); const r = rng(5); for (let i = 0; i < n; i++) { g.fillStyle = dark; g.globalAlpha = 0.5; g.fillRect(0, (i * s) / n, s, s / n / 2); } g.globalAlpha = 1; for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * s, r() * s, 2, 2); } };
  TEX.wheat = canvasTexture(128, stripes('#e2c466', '#c9a346', 16), 6, 6);
  TEX.crop = canvasTexture(128, stripes('#6fb544', '#4d9433', 16), 6, 6);
  TEX.plow = canvasTexture(128, stripes('#9a6a43', '#6f4a2c', 16), 6, 6);
  TEX.blob = canvasTexture(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  TEX.shadow = canvasTexture(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
}

// ================================================================ ceu, nuvens, montanhas
export function makeSky() {
  const g = new THREE.SphereGeometry(1300, 32, 20), c = new THREE.Color(), cols = [], pa = g.attributes.position;
  const hor = new THREE.Color(0xe0f0ff), mid = new THREE.Color(0x8fc4ff), top = new THREE.Color(0x3f86e6);
  for (let i = 0; i < pa.count; i++) {
    const t = clamp(pa.getY(i) / 1300);
    if (t < 0) c.copy(hor); else if (t < 0.35) c.copy(hor).lerp(mid, ss(0, 0.35, t)); else c.copy(mid).lerp(top, ss(0.35, 0.95, t));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}
export function makeSun(dir) {
  const mat = new THREE.SpriteMaterial({ map: TEX.blob, color: 0xfff1c4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.95 });
  const s = new THREE.Sprite(mat); s.scale.set(360, 360, 1); s.position.copy(dir).multiplyScalar(1000); s.renderOrder = -9;
  return s;
}
export function makeClouds() {
  const g = new THREE.Group(), r = rng(12);
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group(), a = r() * Math.PI * 2, d = 360 + r() * 420, y = 95 + r() * 90;
    for (let j = 0; j < 7; j++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.blob, color: j % 3 === 0 ? 0xdbe8f7 : 0xffffff, transparent: true, opacity: 0.93, depthWrite: false, fog: false }));
      const s = 48 + r() * 46; sp.scale.set(s * 1.5, s * 0.8, 1); sp.position.set((j - 3) * 30 + (r() - 0.5) * 16, (r() - 0.5) * 12 - (j % 3 === 0 ? 6 : 0), (r() - 0.5) * 24);
      c.add(sp);
    }
    c.position.set(Math.cos(a) * d, y, Math.sin(a) * d); c.userData.base = c.position.clone(); g.add(c);
  }
  return g;
}
export function makeMountains() {
  const g = new THREE.Group(), r = rng(31);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, envMapIntensity: 0.2 });
  for (let i = 0; i < 20; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 3), p = geo.attributes.position, cols = [];
    const rx = 160 + r() * 160, ry = 55 + r() * 85, rz = 150 + r() * 120, c = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const j = 0.92 + r() * 0.16, y = Math.max(p.getY(k), -0.15);
      p.setXYZ(k, p.getX(k) * j, y * (0.92 + r() * 0.16), p.getZ(k) * j);
    }
    geo.computeVertexNormals();
    for (let k = 0; k < p.count; k++) {
      const h = p.getY(k);
      if (h > 0.84) c.setHex(0xeef3f8); else if (h > 0.6) c.setHex(0x6f8f86).lerp(new THREE.Color(0xeef3f8), ss(0.6, 0.84, h)); else c.setHex(0x3f8a4a).lerp(new THREE.Color(0x6f8f86), ss(0.25, 0.6, h));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, mat), a = (i / 20) * Math.PI * 2 + r() * 0.2, d = 560 + r() * 160;
    m.scale.set(rx, ry, rz); m.position.set(Math.cos(a) * d, -14, Math.sin(a) * d); m.rotation.y = r() * 6;
    g.add(m);
  }
  return g;
}

// ================================================================ terreno, campos, vegetacao, casas
export const FIELDS = [
  { cx: 125, cz: 46, w: 80, d: 50, ang: 0.12, tex: 'wheat' }, { cx: -130, cz: -52, w: 76, d: 48, ang: -0.1, tex: 'crop' },
  { cx: 52, cz: -135, w: 46, d: 82, ang: 0.08, tex: 'plow' }, { cx: -58, cz: 140, w: 50, d: 80, ang: -0.06, tex: 'wheat' },
  { cx: 170, cz: -110, w: 70, d: 60, ang: 0.3, tex: 'crop' }, { cx: -165, cz: 120, w: 70, d: 60, ang: -0.25, tex: 'plow' },
];
function fieldMask(x, z) {
  let m = 0;
  for (const f of FIELDS) {
    const dx = x - f.cx, dz = z - f.cz, c = Math.cos(-f.ang), s = Math.sin(-f.ang), lx = dx * c - dz * s, lz = dx * s + dz * c;
    m = Math.max(m, ss(f.w / 2 + 14, f.w / 2 - 2, Math.abs(lx)) * ss(f.d / 2 + 14, f.d / 2 - 2, Math.abs(lz)));
  }
  return m;
}
export const inField = (x, z, pad = 6) => FIELDS.some((f) => { const dx = x - f.cx, dz = z - f.cz, c = Math.cos(-f.ang), s = Math.sin(-f.ang), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad; });
function noise2(x, z) { return Math.sin(x * 0.04) * Math.cos(z * 0.045) + 0.5 * Math.sin(x * 0.1 + z * 0.065) + 0.35 * Math.sin(z * 0.12 - x * 0.085); }
export function terrainH(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  const f = ss(88, 130, Math.max(ax, az)) * ss(20, 48, Math.min(ax, az));
  return f * Math.max(0, 12 + 10 * noise2(x, z)) * (1 - fieldMask(x, z));
}
export function makeTerrain() {
  const size = 940, seg = 156;
  const g0 = new THREE.PlaneGeometry(size, size, seg, seg); g0.rotateX(-Math.PI / 2);
  const p = g0.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainH(p.getX(i), p.getZ(i)));
  const g = g0.toNonIndexed(); g.computeVertexNormals();
  const r = rng(7), pa = g.attributes.position, colors = new Float32Array(pa.count * 3);
  const lo = new THREE.Color(0xdff5c8), hi = new THREE.Color(0xf6ffd8), dk = new THREE.Color(0xa8d58a), c = new THREE.Color();
  for (let i = 0; i < pa.count; i += 3) {
    const h = (pa.getY(i) + pa.getY(i + 1) + pa.getY(i + 2)) / 3;
    c.copy(lo).lerp(hi, clamp(h / 18)).lerp(dk, r() * 0.5);
    for (let j = 0; j < 3; j++) { colors[(i + j) * 3] = c.r; colors[(i + j) * 3 + 1] = c.g; colors[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: TEX.grass, roughness: 1, envMapIntensity: 0.25 }));
  mesh.receiveShadow = true;
  return mesh;
}
export function makeFields() {
  const g = new THREE.Group();
  for (const f of FIELDS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshStandardMaterial({ map: TEX[f.tex], roughness: 1, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = f.ang; m.position.set(f.cx, 0.07, f.cz); m.receiveShadow = true; g.add(m);
  }
  return g;
}

const paint = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo.index ? geo.toNonIndexed() : geo; };
const vcMat = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, envMapIntensity: 0.3, ...extra });

function instanced(geo, count, place, seed, colorFn) {
  const mesh = new THREE.InstancedMesh(geo, vcMat(), count), r = rng(seed), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  let n = 0, tries = 0;
  while (n < count && tries++ < count * 60) {
    const p = place(r); if (!p) continue;
    const s = p.s ?? 1;
    e.set(0, r() * 6.28, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x, terrainH(p.x, p.z) + (p.dy ?? -0.2), p.z), q, new THREE.Vector3(s, s * (p.sy ?? (0.9 + r() * 0.35)), s));
    mesh.setMatrixAt(n, m); colorFn(col, r); mesh.setColorAt(n, col); n++;
  }
  mesh.count = n; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
const outsideInterchange = (x, z, minLat = 10) => { const ax = Math.abs(x), az = Math.abs(z); return Math.max(ax, az) > 80 && Math.min(ax, az) > minLat && !inField(x, z, 4); };

export function makeVegetation() {
  const g = new THREE.Group();
  const trunk = (r1, r2, h) => { const t = new THREE.CylinderGeometry(r1, r2, h, 6); t.translate(0, h / 2, 0); return t; };
  const cone = (r, h, y) => { const t = new THREE.ConeGeometry(r, h, 7); t.translate(0, y, 0); return t; };
  const pine = mergeGeometries([paint(trunk(0.35, 0.55, 2.4), 0x6e4b2e), paint(cone(2.9, 4.2, 4.0), 0x2d7d44), paint(cone(2.35, 3.8, 6.0), 0x34904d), paint(cone(1.6, 3.4, 8.0), 0x3da457)]);
  const blob = (r, x, y, z) => { const t = new THREE.IcosahedronGeometry(r, 1); t.translate(x, y, z); return t; };
  const round = mergeGeometries([paint(trunk(0.4, 0.6, 3.0), 0x7a5232), paint(blob(2.6, 0, 4.6, 0), 0x57b04a), paint(blob(2.0, 1.5, 5.4, 0.6), 0x6cc257), paint(blob(1.9, -1.3, 5.2, -0.6), 0x4fa645)]);
  const poplar = mergeGeometries([paint(trunk(0.3, 0.45, 2.0), 0x6e4b2e), paint(cone(1.5, 9.5, 6.4), 0x3b8c3f)]);
  const bush = mergeGeometries([paint(blob(1.2, 0, 0.8, 0), 0x4c9e46), paint(blob(0.9, 0.9, 0.7, 0.3), 0x5db251)]);
  const rock = paint(new THREE.DodecahedronGeometry(1, 0), 0x9aa0a8);
  const tint = (base) => (c, r) => c.setHSL(base + (r() - 0.5) * 0.05, 0.5, 0.85 + r() * 0.3);
  const rangeXY = (r, span) => ({ x: (r() - 0.5) * span, z: (r() - 0.5) * span });
  g.add(instanced(pine, 420, (r) => { const p = rangeXY(r, 520); return outsideInterchange(p.x, p.z) ? { ...p, s: 0.8 + r() * 0.9 } : null; }, 21, tint(0.34)));
  g.add(instanced(round, 260, (r) => { const p = rangeXY(r, 480); return outsideInterchange(p.x, p.z) ? { ...p, s: 0.8 + r() * 0.7 } : null; }, 22, tint(0.30)));
  g.add(instanced(poplar, 70, (r) => { const p = rangeXY(r, 420); return outsideInterchange(p.x, p.z, 9) ? { ...p, s: 0.8 + r() * 0.5 } : null; }, 23, tint(0.33)));
  g.add(instanced(bush, 420, (r) => { const p = rangeXY(r, 440); return outsideInterchange(p.x, p.z, 8) ? { ...p, s: 0.7 + r() * 1.0, sy: 0.8 } : null; }, 24, tint(0.31)));
  g.add(instanced(rock, 90, (r) => { const p = rangeXY(r, 460); return outsideInterchange(p.x, p.z, 12) ? { ...p, s: 0.6 + r() * 1.6, sy: 0.7, dy: -0.1 } : null; }, 25, (c, r) => c.setHSL(0.6, 0.05, 0.85 + r() * 0.3)));
  // arvores e arbustos dentro das folhas do trevo (jardins)
  const cs = PIECES.loops.map((p) => p.center);
  const inLeaf = (r) => { const c = cs[Math.floor(r() * 4)], a = r() * 6.28, d = Math.sqrt(r()) * (R - 9); return { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d }; };
  g.add(instanced(round, 18, (r) => ({ ...inLeaf(r), s: 0.7 + r() * 0.4 }), 26, tint(0.3)));
  g.add(instanced(pine, 14, (r) => ({ ...inLeaf(r), s: 0.7 + r() * 0.4 }), 27, tint(0.34)));
  g.add(instanced(bush, 40, (r) => ({ ...inLeaf(r), s: 0.6 + r() * 0.6, sy: 0.8 }), 28, tint(0.31)));
  return g;
}

export function makeHouses() {
  const parts = [], r = rng(44);
  const box = (w, h, d, x, y, z, hex) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return paint(b, hex); };
  const roof = (w, d, h, x, y, z, hex) => { const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.5, 0); s.lineTo(w / 2 + 0.5, 0); s.lineTo(0, h); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: d + 1, bevelEnabled: false }); g.translate(x, y, z - d / 2 - 0.5); return paint(g, hex); };
  const walls = [0xf3e9d2, 0xf0d9b5, 0xe8efe9, 0xf6e3e3, 0xdfe8f5], roofs = [0xb8442e, 0x7a4a36, 0xa83a3a, 0x4d6a8a];
  const spots = [[96, 78], [108, 84], [92, 92], [-92, -80], [-104, -86], [-96, -96], [78, -96], [86, -108], [-80, 104], [-92, 112], [70, 112], [-120, 82], [118, -90]];
  for (const [x, z] of spots) {
    const w = 8 + r() * 4, d = 6 + r() * 3, h = 4 + r() * 1.5, y = terrainH(x, z), wall = walls[Math.floor(r() * walls.length)], rf = roofs[Math.floor(r() * roofs.length)], a = Math.floor(r() * 4) * Math.PI / 2;
    const hp = [box(w, h, d, 0, h / 2, 0, wall), roof(w, d, 2.8, 0, h, 0, rf), box(1.6, 2.4, 0.2, w * 0.2, 1.2, d / 2 + 0.05, 0x6b4a32), box(1.6, 1.4, 0.2, -w * 0.25, h * 0.55, d / 2 + 0.05, 0x9ccbe8), box(1.2, 2.2, 1.2, w * 0.28, h + 2.2, -d * 0.2, 0x8a6a5a)];
    const m = new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z);
    for (const gg of hp) { gg.applyMatrix4(m); parts.push(gg); }
  }
  for (const [x, z] of [[132, 70], [-140, -70]]) { // celeiro vermelho + silo
    const y = terrainH(x, z), hp = [box(14, 7, 10, 0, 3.5, 0, 0xb23a30), roof(14, 10, 4, 0, 7, 0, 0x8a2c26), box(3, 4.2, 0.2, 0, 2.1, 5.05, 0xf3e9d2)];
    const sil = new THREE.CylinderGeometry(2.4, 2.4, 11, 12); sil.translate(11, 5.5, 0); hp.push(paint(sil, 0xcfd6dc)); const cap = new THREE.SphereGeometry(2.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(11, 11, 0); hp.push(paint(cap, 0xaab3bb));
    const m = new THREE.Matrix4().setPosition(x, y, z); for (const gg of hp) { gg.applyMatrix4(m); parts.push(gg); }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), vcMat({ flatShading: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
export function makeWindmill() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8, flatShading: true });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 17, 8), mat); tower.position.y = 8.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 8), new THREE.MeshStandardMaterial({ color: 0xb8442e, roughness: 0.8, flatShading: true })); cap.position.y = 18.5;
  const rotor = new THREE.Group(); rotor.position.set(0, 17, 2.2);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 12, 0.2), mat); b.position.y = 6.2; const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 2; arm.add(b); rotor.add(arm); }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshStandardMaterial({ color: 0x555b63 })); rotor.add(hub);
  g.add(tower, cap, rotor); g.userData.rotor = rotor; g.position.set(-150, terrainH(-150, 46), 46); g.rotation.y = 0.6;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ================================================================ malhas dinamicas (estradas, aterros, ponte)
export function makeRibbon(verts, halfW, color, yOff = 0.05, extra = {}) {
  const n = verts.length, pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[Math.max(0, i - 1)], b = verts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    if (i > 0) acc += Math.hypot(verts[i].x - verts[i - 1].x, verts[i].z - verts[i - 1].z);
    pos[i * 6] = verts[i].x + nx * halfW; pos[i * 6 + 2] = verts[i].z + nz * halfW;
    pos[i * 6 + 3] = verts[i].x - nx * halfW; pos[i * 6 + 5] = verts[i].z - nz * halfW;
    nor[i * 6 + 1] = 1; nor[i * 6 + 4] = 1;
    const us = (extra.uvScale ?? 8); uv[i * 4] = 0; uv[i * 4 + 1] = acc / us; uv[i * 4 + 2] = (halfW * 2) / us; uv[i * 4 + 3] = acc / us;
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const L = extra.layer || 1;
  const mat = new THREE.MeshStandardMaterial({ color, map: extra.map || null, roughness: extra.roughness ?? 0.92, metalness: 0, envMapIntensity: extra.env ?? 0.3, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -L, polygonOffsetUnits: -L, transparent: !!extra.transparent, opacity: extra.opacity ?? 1, emissive: extra.emissive || 0x000000, emissiveIntensity: extra.emissiveIntensity ?? 1 });
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.frustumCulled = false;
  const api = {
    mesh, verts, n,
    update(lam) { for (let i = 0; i < n; i++) { const y = yOf(verts[i], lam) + yOff; pos[i * 6 + 1] = y; pos[i * 6 + 4] = y; } g.attributes.position.needsUpdate = true; },
    setReveal(f) { g.setDrawRange(0, Math.floor(clamp(f) * (n - 1)) * 6); mesh.visible = f > 0.001; },
  };
  api.update(1);
  return api;
}

// faixa de quadrilateros nao indexada, DoubleSide, normais explicitas (nao depende do sentido das faces)
class Strip {
  constructor(n, faceColors, matOpts = {}) {
    this.n = n; this.F = faceColors.length;
    this.pts = Array.from({ length: n }, () => Array.from({ length: this.F * 2 }, () => [0, 0, 0]));
    const tv = (n - 1) * this.F * 6;
    this.pos = new Float32Array(tv * 3); const col = new Float32Array(tv * 3);
    let o = 0;
    for (let i = 0; i < n - 1; i++) for (let f = 0; f < this.F; f++) { const c = faceColors[f]; for (let k = 0; k < 6; k++) { col[o++] = c.r; col[o++] = c.g; col[o++] = c.b; } }
    this.geo = new THREE.BufferGeometry();
    this.uv = new Float32Array(tv * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.3, ...matOpts }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
  }
  write() {
    let o = 0; const P = this.pos, put = (a) => { P[o++] = a[0]; P[o++] = a[1]; P[o++] = a[2]; };
    for (let i = 0; i < this.n - 1; i++) for (let f = 0; f < this.F; f++) {
      const a = this.pts[i][2 * f], b = this.pts[i][2 * f + 1], c = this.pts[i + 1][2 * f], d = this.pts[i + 1][2 * f + 1];
      put(a); put(b); put(c); put(b); put(d); put(c);
    }
    for (let i = 0, j = 0; i < P.length; i += 3, j += 2) { this.uv[j] = P[i] / 940 + 0.5; this.uv[j + 1] = P[i + 2] / 940 + 0.5; }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true; this.geo.computeVertexNormals();
  }
  setReveal(f) { this.geo.setDrawRange(0, Math.floor(clamp(f) * (this.n - 1)) * this.F * 6); this.mesh.visible = f > 0.001; }
}
const set3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; };
function normals(verts) {
  return verts.map((v, i) => { const a = verts[Math.max(0, i - 1)], b = verts[Math.min(verts.length - 1, i + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; return [-tz / l, tx / l]; });
}
const C = (hex) => new THREE.Color(hex);
export const COL = { grass: 0xe3f4cf, gravel: 0xcfc6b2, concrete: 0xe9e6df, concreteD: 0xb5b1a8, steel: 0xc3c8cf };

// aterro de terra com taludes (topo = acostamento de cascalho)
export function makeEmbankment(verts, halfTop, slope = 1.8, topOff = 0.0) {
  const n = verts.length, nr = normals(verts), s = new Strip(n, [C(COL.grass), C(COL.gravel), C(COL.grass)], { map: TEX.grass, roughness: 1 });
  return {
    mesh: s.mesh, setReveal: (f) => s.setReveal(f),
    update(lam) {
      for (let i = 0; i < n; i++) {
        const v = verts[i], y = yOf(v, lam), [nx, nz] = nr[i], run = halfTop + slope * Math.max(0, y), ty = Math.max(y, 0) + topOff;
        set3(s.pts[i][0], v.x + nx * run, -0.15, v.z + nz * run); set3(s.pts[i][1], v.x + nx * halfTop, ty, v.z + nz * halfTop);
        set3(s.pts[i][2], v.x + nx * halfTop, ty, v.z + nz * halfTop); set3(s.pts[i][3], v.x - nx * halfTop, ty, v.z - nz * halfTop);
        set3(s.pts[i][4], v.x - nx * halfTop, ty, v.z - nz * halfTop); set3(s.pts[i][5], v.x - nx * run, -0.15, v.z - nz * run);
      }
      s.write();
    },
  };
}
// viga do tabuleiro da ponte (concreto), so no vao sobre a pista A
export function makeDeckBeam(z0, z1) {
  const zs = []; for (let z = z0; z <= z1 + 1e-6; z += (z1 - z0) / 8) zs.push(z);
  const n = zs.length, hw = HALF + 0.55, th = 1.15, s = new Strip(n, [C(COL.concrete), C(COL.concrete), C(COL.concreteD), C(COL.concrete)]);
  return {
    mesh: s.mesh,
    update(lam) {
      for (let i = 0; i < n; i++) {
        const y = lam * hprof(zs[i]) - 0.02, z = zs[i], P = s.pts[i];
        set3(P[0], -hw, y, z); set3(P[1], -hw, y - th, z); // parede esquerda
        set3(P[2], hw, y, z); set3(P[3], hw, y - th, z);   // parede direita
        set3(P[4], -hw, y - th, z); set3(P[5], hw, y - th, z); // fundo
        set3(P[6], -hw, y, z); set3(P[7], hw, y, z);        // topo
      }
      s.write();
    },
  };
}
// quadrado de concreto (face do encontro da ponte)
function makeCap(color) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.3 })); mesh.castShadow = true; mesh.frustumCulled = false;
  return { mesh, set(p) { const a = geo.attributes.position.array; [p[0], p[1], p[2], p[0], p[2], p[3]].forEach((q, i) => { a[i * 3] = q[0]; a[i * 3 + 1] = q[1]; a[i * 3 + 2] = q[2]; }); geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); } };
}
export function makeAbutments() {
  const caps = [-1, 1].map(() => makeCap(COL.concrete)); const hw = HALF + 0.7, sl = 1.8;
  return { meshes: caps.map((c) => c.mesh), update(lam) { caps.forEach((c, i) => { const z = (i ? 1 : -1) * ZF, y = lam * hprof(z); const run = hw + sl * y; c.set([[-run, -0.15, z], [-hw, y, z], [hw, y, z], [run, -0.15, z]]); }); } };
}
// colunas da ponte (duas fileiras junto aos encontros) + travessa
export function makePiers() {
  const mat = new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.9, envMapIntensity: 0.3 }), g = new THREE.Group(), items = [];
  const col = new THREE.BoxGeometry(1, 1, 1); col.translate(0, 0.5, 0);
  for (const z of [-5.9, 5.9]) {
    const cap = new THREE.Mesh(col, mat); cap.castShadow = cap.receiveShadow = true; g.add(cap);
    const cols = [-2.9, 0, 2.9].map((x) => { const m = new THREE.Mesh(col, mat); m.castShadow = m.receiveShadow = true; g.add(m); return { m, x }; });
    items.push({ cap, cols, z });
  }
  return {
    group: g,
    update(lam) {
      for (const it of items) {
        const bottom = lam * H - 1.15 - 0.02;
        it.cap.visible = bottom > 0.3; it.cap.position.set(0, bottom - 0.45, it.z); it.cap.scale.set(HALF * 2 + 0.9, 0.45, 1.5);
        for (const c of it.cols) { c.m.visible = bottom > 0.3; c.m.position.set(c.x, 0, it.z); c.m.scale.set(1.0, Math.max(0.01, bottom - 0.45), 1.0); }
      }
    },
  };
}
// barreira de concreto (new jersey) ou guard-rail ao longo de um caminho
export function makeBarrier(verts, offset, kind = 'jersey') {
  const n = verts.length, nr = normals(verts);
  const faces = kind === 'jersey' ? [C(COL.concrete), C(COL.concrete), C(COL.concrete)] : [C(COL.steel)];
  const s = new Strip(n, faces, kind === 'rail' ? { metalness: 0.5, roughness: 0.45, envMapIntensity: 0.9 } : {});
  const hgt = kind === 'jersey' ? 0.85 : 0.4;
  return {
    mesh: s.mesh, setReveal: (f) => s.setReveal(f),
    update(lam, fn) {
      for (let i = 0; i < n; i++) {
        const v = verts[i], y = yOf(v, lam) + 0.05, [nx, nz] = nr[i], P = s.pts[i];
        if (kind === 'jersey') {
          const o1 = offset + 0.22, o2 = offset - 0.22;
          set3(P[0], v.x + nx * o1, y, v.z + nz * o1); set3(P[1], v.x + nx * o1, y + hgt, v.z + nz * o1);
          set3(P[2], v.x + nx * o1, y + hgt, v.z + nz * o1); set3(P[3], v.x + nx * o2, y + hgt, v.z + nz * o2);
          set3(P[4], v.x + nx * o2, y + hgt, v.z + nz * o2); set3(P[5], v.x + nx * o2, y, v.z + nz * o2);
        } else { set3(P[0], v.x + nx * offset, y + 0.5, v.z + nz * offset); set3(P[1], v.x + nx * offset, y + 0.5 + hgt, v.z + nz * offset); }
      }
      s.write();
    },
  };
}
// postes de guard-rail (instanciados)
export function makePosts(verts, offset, every = 4) {
  const nr = normals(verts), idxs = []; let acc = 0, next = 0;
  for (let i = 0; i < verts.length; i++) { if (i > 0) acc += Math.hypot(verts[i].x - verts[i - 1].x, verts[i].z - verts[i - 1].z); if (acc >= next) { idxs.push(i); next += every; } }
  const geo = new THREE.BoxGeometry(0.14, 0.9, 0.14); geo.translate(0, 0.45, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8c929b, metalness: 0.4, roughness: 0.6 }), idxs.length); mesh.castShadow = true; mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  return { mesh, setReveal: (f) => { mesh.count = Math.floor(clamp(f) * idxs.length); mesh.visible = mesh.count > 0; },
    update(lam) { idxs.forEach((i, k) => { const v = verts[i], [nx, nz] = nr[i]; m.makeTranslation(v.x + nx * offset, yOf(v, lam), v.z + nz * offset); mesh.setMatrixAt(k, m); }); mesh.instanceMatrix.needsUpdate = true; } };
}

// faixas de pedestre e linhas de retencao (so no cruzamento no mesmo nivel)
export function makeCrosswalks() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xf4f4ef, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const bar = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), mat); m.position.set(x, 0.07, z); m.receiveShadow = true; g.add(m); };
  for (const sgn of [-1, 1]) {
    for (let i = -4; i <= 4; i++) { const o = i * 0.95; bar(2.4, 0.5, sgn * (HALF + 3.4), o); bar(0.5, 2.4, o, sgn * (HALF + 3.4)); }
    bar(0.45, HALF - 0.5, sgn * (HALF + 5.8), -sgn * (HALF / 2 + 0.1)); // retencao A
    bar(HALF - 0.5, 0.45, sgn * (HALF / 2 + 0.1), sgn * (HALF + 5.8));  // retencao B
  }
  return g;
}

// ================================================================ postes, portico de sinalizacao
export function makeLamps() {
  const parts = [], dark = 0x555c66;
  const pole = new THREE.CylinderGeometry(0.1, 0.16, 8, 6); pole.translate(0, 4, 0); parts.push(paint(pole, dark));
  const arm = new THREE.BoxGeometry(2.4, 0.12, 0.12); arm.translate(-1.1, 8, 0); parts.push(paint(arm, dark));
  const head = new THREE.BoxGeometry(0.9, 0.18, 0.4); head.translate(-2.2, 7.9, 0); parts.push(paint(head, 0xfff1c8));
  const geo = mergeGeometries(parts), spots = [];
  for (const d of [66, 96, 126, 156]) for (const s of [-1, 1]) { spots.push([d * s, 7.2 * s, Math.PI * (s > 0 ? 0 : 1)]); spots.push([7.2 * s, -d * s, Math.PI * 0.5 * (s > 0 ? 1 : 3)]); }
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, emissive: 0x332b10 }), spots.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, z, ry], i) => { e.set(0, ry, 0); q.setFromEuler(e); m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m); });
  mesh.castShadow = true;
  return mesh;
}
export function makeGantry(label, sub) {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0x8e949d, metalness: 0.5, roughness: 0.5 });
  const post = (z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 8, 8), steel); m.position.set(0, 4, z); m.castShadow = true; g.add(m); };
  post(-HALF - 2.2); post(HALF + 2.2);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, HALF * 2 + 5), steel); beam.position.set(0, 7.6, 0); beam.castShadow = true; g.add(beam);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320; const x = c.getContext('2d');
  x.fillStyle = '#0b7a43'; x.fillRect(0, 0, 1024, 320); x.strokeStyle = '#ffffff'; x.lineWidth = 12; x.strokeRect(14, 14, 996, 292);
  x.fillStyle = '#ffffff'; x.font = '900 118px Inter, sans-serif'; x.textAlign = 'center'; x.fillText(label, 512, 150); x.font = '800 70px Inter, sans-serif'; x.fillText(sub, 512, 262);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 2.4, (HALF * 2 + 2.4) * 0.3125), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0x0a2a18, emissiveMap: t, emissiveIntensity: 0.25 }));
  board.position.set(-0.3, 9.4, 0); board.rotation.y = -Math.PI / 2; board.castShadow = true; g.add(board);
  const back = board.clone(); back.material = new THREE.MeshStandardMaterial({ color: 0x4d555f }); back.position.x = -0.25 + 0.5; back.rotation.y = Math.PI / 2; g.add(back);
  return g;
}

// ================================================================ carros
const CAR = {};
export const CAR_TYPES = ['sedan', 'hatch', 'suv', 'pickup', 'bus'];
function extruded(pts, depth, bevel = 0.07) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => sh.lineTo(p[0], p[1])); sh.closePath();
  const d = Math.max(0.05, depth - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -d / 2); return g;
}
function rbox(w, h, d, x, y, z, rad = 0.08) { const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1); g.translate(x, y, z); return g.toNonIndexed(); }
function buildType(t) {
  const P = { body: [], glass: [], dark: [], rim: [], head: [], tail: [], trim: [] };
  const wheels = (xf, xr, tz, r) => { for (const x of [xf, xr]) for (const z of [-tz, tz]) { const w = new THREE.CylinderGeometry(r, r, 0.34, 14); w.rotateX(Math.PI / 2); w.translate(x, r, z); P.dark.push(w.toNonIndexed()); const rm = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.36, 10); rm.rotateX(Math.PI / 2); rm.translate(x, r, z * 1.02); P.rim.push(rm.toNonIndexed()); } };
  const lights = (xf, xr, y, wz) => { for (const z of [-wz, wz]) { P.head.push(rbox(0.1, 0.2, 0.42, xf, y, z)); P.tail.push(rbox(0.1, 0.2, 0.4, xr, y, z)); } };
  if (t === 'sedan') {
    P.body.push(extruded([[-2.15, 0.34], [2.15, 0.34], [2.22, 0.62], [1.95, 0.88], [0.95, 0.98], [-1.5, 0.98], [-2.1, 0.9], [-2.22, 0.62]], 1.86));
    P.glass.push(extruded([[-1.25, 0.96], [0.95, 0.96], [0.4, 1.58], [-0.8, 1.58]], 1.62, 0.05)); P.body.push(extruded([[-0.85, 1.56], [0.42, 1.56], [0.42, 1.66], [-0.85, 1.66]], 1.6, 0.05));
    P.dark.push(rbox(0.12, 0.3, 1.2, 2.2, 0.5, 0), rbox(0.1, 0.18, 1.7, -2.22, 0.42, 0)); lights(2.2, -2.2, 0.68, 0.7); wheels(1.35, -1.35, 0.86, 0.42);
  } else if (t === 'hatch') {
    P.body.push(extruded([[-1.85, 0.34], [1.85, 0.34], [1.92, 0.6], [1.6, 0.86], [0.9, 0.96], [-1.8, 0.96], [-1.9, 0.6]], 1.78));
    P.glass.push(extruded([[-1.7, 0.94], [0.9, 0.94], [0.35, 1.62], [-1.62, 1.62]], 1.56, 0.05)); P.body.push(extruded([[-1.65, 1.6], [0.38, 1.6], [0.38, 1.7], [-1.65, 1.7]], 1.54, 0.05));
    P.dark.push(rbox(0.12, 0.28, 1.1, 1.92, 0.5, 0)); lights(1.9, -1.9, 0.68, 0.66); wheels(1.15, -1.15, 0.84, 0.4);
  } else if (t === 'suv') {
    P.body.push(extruded([[-2.2, 0.4], [2.2, 0.4], [2.28, 0.8], [2.0, 1.12], [0.9, 1.2], [-2.0, 1.2], [-2.25, 1.0]], 1.96));
    P.glass.push(extruded([[-2.0, 1.18], [0.95, 1.18], [0.5, 1.9], [-1.95, 1.9]], 1.72, 0.05)); P.body.push(extruded([[-1.98, 1.88], [0.52, 1.88], [0.52, 1.99], [-1.98, 1.99]], 1.7, 0.05));
    P.dark.push(rbox(0.14, 0.34, 1.3, 2.28, 0.62, 0), rbox(2.8, 0.1, 0.08, -0.5, 2.05, 0.7), rbox(2.8, 0.1, 0.08, -0.5, 2.05, -0.7)); lights(2.26, -2.26, 0.9, 0.74); wheels(1.5, -1.45, 0.92, 0.5);
  } else if (t === 'pickup') {
    P.body.push(extruded([[-2.4, 0.4], [2.35, 0.4], [2.42, 0.78], [2.1, 1.05], [0.45, 1.12], [0.45, 0.95], [-2.35, 0.95], [-2.42, 0.7]], 1.94));
    P.body.push(extruded([[-0.05, 1.1], [1.55, 1.1], [1.55, 1.3], [-0.05, 1.3]], 1.9, 0.05));
    P.glass.push(extruded([[0.0, 1.28], [1.5, 1.28], [1.05, 1.86], [0.05, 1.86]], 1.68, 0.05)); P.body.push(extruded([[0.02, 1.84], [1.08, 1.84], [1.08, 1.94], [0.02, 1.94]], 1.66, 0.05));
    P.dark.push(rbox(0.14, 0.34, 1.3, 2.4, 0.6, 0), rbox(2.1, 0.06, 1.6, -1.35, 0.97, 0)); lights(2.38, -2.4, 0.84, 0.74); wheels(1.55, -1.5, 0.92, 0.5);
  } else { // onibus
    P.body.push(extruded([[-4.4, 0.55], [4.4, 0.55], [4.55, 0.9], [4.55, 2.9], [-4.5, 2.9], [-4.55, 0.9]], 2.5, 0.12));
    P.glass.push(rbox(8.6, 0.95, 2.54, 0, 1.95, 0), rbox(0.1, 1.2, 2.2, 4.62, 2.0, 0)); P.body.push(rbox(8.9, 0.14, 2.3, 0, 3.0, 0)); P.dark.push(rbox(0.1, 0.34, 1.6, 4.58, 0.8, 0));
    P.trim.push(rbox(9.0, 0.2, 2.52, 0, 1.28, 0)); lights(4.56, -4.56, 0.9, 0.95); wheels(3.0, -2.8, 1.12, 0.5);
  }
  return P;
}
const mergeList = (list) => (list.length ? mergeGeometries(list) : null);
const MAT = {};
function sharedMats() {
  if (MAT.glass) return;
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.08, metalness: 0.7, envMapIntensity: 1.4 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.85, envMapIntensity: 0.3 });
  MAT.rim = new THREE.MeshStandardMaterial({ color: 0xd5dae0, roughness: 0.25, metalness: 0.9, envMapIntensity: 1.2 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 1.6 });
  MAT.tail = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff1010, emissiveIntensity: 1.2 });
  MAT.trim = new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.4, metalness: 0.2 });
  MAT.shadow = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}
const bodyMats = {};
const bodyMat = (c) => (bodyMats[c] ??= new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.46, metalness: 0.2, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.55 }));
export function createCar(color, type = 'sedan') {
  sharedMats();
  if (!CAR[type]) { const P = buildType(type); CAR[type] = {}; for (const k of Object.keys(P)) CAR[type][k] = mergeList(P[k]); CAR[type].len = type === 'bus' ? 9.2 : 4.5; CAR[type].wid = type === 'bus' ? 2.6 : 2.0; }
  const T = CAR[type], outer = new THREE.Group(), inner = new THREE.Group();
  for (const k of Object.keys(T)) { if (!T[k] || !T[k].isBufferGeometry) continue; const m = new THREE.Mesh(T[k], k === 'body' ? bodyMat(color) : MAT[k]); m.castShadow = true; inner.add(m); }
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(T.len * 1.12, T.wid * 1.3), MAT.shadow); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.045; sh.renderOrder = 2; outer.add(sh);
  outer.add(inner); outer.userData.inner = inner; outer.userData.type = type;
  return outer;
}
export function setCarPose(car, p, scale = 1) {
  car.position.set(p.x, p.y, p.z); car.rotation.y = p.yaw; car.userData.inner.rotation.z = p.pitch || 0; car.scale.setScalar(scale);
}

// ================================================================ semaforos e rastro luminoso
export function createSignal() {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 5.2, 8), dark); pole.position.y = 2.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.0, 0.9), dark); head.position.y = 5.3;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.6), dark); arm.position.set(0, 4.6, 0.7);
  g.add(pole, head, arm); g.userData.lamps = [];
  [0xff2d2d, 0xffc400, 0x25e05a].forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.4 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), m); s.position.set(0, 6.2 - i * 0.95, 0.5);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12, 1, true, 0, Math.PI), dark); visor.rotation.x = Math.PI / 2; visor.rotation.z = Math.PI / 2; visor.position.set(0, 6.3 - i * 0.95, 0.62);
    g.add(s, visor); g.userData.lamps.push({ m, c });
  });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function setSignal(sig, state) {
  const on = { r: 0, y: 1, g: 2 }[state];
  sig.userData.lamps.forEach((l, i) => { l.m.emissiveIntensity = i === on ? 3.0 : 0.02; l.m.color.setHex(i === on ? l.c : 0x1a1a1a); });
}
export function makeTrail(color, n = 70) {
  const pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  const c = new THREE.Color(color);
  return {
    mesh,
    update(route, s, lam, len = 34, halfW = 0.55) {
      mesh.visible = true;
      for (let i = 0; i < n; i++) {
        const si = Math.max(0, s - (len * i) / (n - 1)), p = route.pos(si, lam), q = route.pos(si + 0.8, lam);
        let tx = q.x - p.x, tz = q.z - p.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const y = p.y + 0.16, k = Math.pow(1 - i / (n - 1), 1.3) * 1.3;
        pos[i * 6] = p.x - tz * halfW; pos[i * 6 + 1] = y; pos[i * 6 + 2] = p.z + tx * halfW; pos[i * 6 + 3] = p.x + tz * halfW; pos[i * 6 + 4] = y; pos[i * 6 + 5] = p.z - tx * halfW;
        for (let j = 0; j < 2; j++) { col[i * 6 + j * 3] = c.r * k; col[i * 6 + j * 3 + 1] = c.g * k; col[i * 6 + j * 3 + 2] = c.b * k; }
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    },
    hide() { mesh.visible = false; },
  };
}
export function createSignalPlaceholder() { return null; }
