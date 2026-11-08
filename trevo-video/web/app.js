// Coreografia do vídeo: tudo é função pura do tempo t (renderização determinística).
import * as THREE from 'three';
import * as Wd from './world.js';
const { W, HALF, R, RD, H, EXT, ss, clamp, lerp, ROUTES, PIECES, hprof } = Wd;

const [TL, MOUTH] = await Promise.all([
  fetch('/build/timeline.json').then((r) => r.json()),
  fetch('/build/mouth.json').then((r) => r.json()),
]);
const S = TL.scenes, FPS = TL.fps;
const T0 = (i) => S[i].t0, T1 = (i) => S[i].t1;
const sceneAt = (t) => { for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].t0) return i; return 0; };

// ---------------------------------------------------------------- renderer / cena
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(1080, 1920, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd2ff);
scene.fog = new THREE.Fog(0xd2eaff, 260, 640);
const cam = new THREE.PerspectiveCamera(55, 1080 / 1920, 0.5, 1500);

scene.add(new THREE.HemisphereLight(0xe3f3ff, 0x6c9150, 1.05));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
sun.position.set(70, 140, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -115, right: 115, top: 115, bottom: -115, near: 20, far: 420 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

scene.add(Wd.makeTerrain(), Wd.makeTrees());
const clouds = Wd.makeClouds(); scene.add(clouds);

// ---------------------------------------------------------------- estradas
const ASPH = 0x4b515e, YEL = 0xffd23a, WHT = 0xf3f3ee;
const dyn = [];            // ribbons que dependem do viaduto (lam)
const line = (z0, x0, x1, axis) => { // axis 'A': ao longo de x, 'B': ao longo de z
  const a = [];
  for (let c = x0; c <= x1; c += 2) a.push(axis === 'A' ? { x: c, z: z0, m: 0, u: 0 } : { x: z0, z: c, m: 1, u: 0 });
  return a;
};
const roadA = Wd.makeRibbon(line(0, -EXT, EXT, 'A'), HALF, ASPH, 0.03, { layer: 1 });
scene.add(roadA.mesh); roadA.mesh.receiveShadow = true;
const deck = Wd.makeDeck(); scene.add(deck.mesh);
const midB = [];
const addLine = (off, w, color, axis, pieces) => pieces.forEach(([a, b, mid]) => {
  const r = Wd.makeRibbon(line(off, a, b, axis), w, color, axis === 'A' ? 0.05 : 0.07, { layer: 3 });
  scene.add(r.mesh); if (axis === 'B') { dyn.push(r); if (mid) midB.push(r); }
});
const AP = [[-EXT, -6.5], [6.5, EXT]], BP = [[-EXT, -6.5, false], [6.5, EXT, false], [-6.5, 6.5, true]];
for (const o of [-0.25, 0.25]) { addLine(o, 0.1, YEL, 'A', AP); addLine(o, 0.1, YEL, 'B', BP); }
for (const o of [-(HALF - 0.45), HALF - 0.45]) { addLine(o, 0.11, WHT, 'A', AP); addLine(o, 0.11, WHT, 'B', BP); }

const loopRibbons = PIECES.loops.map((p) => { const r = Wd.makeRibbon(p.verts, 2.4, ASPH, 0.06, { layer: 2 }); scene.add(r.mesh); dyn.push(r); return r; });
const diagRibbons = PIECES.diags.map((p) => { const r = Wd.makeRibbon(p.verts, 2.4, ASPH, 0.06, { layer: 2 }); scene.add(r.mesh); dyn.push(r); return r; });

// pilares
const CONC = new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.9, flatShading: true });
const pierGeo = new THREE.BoxGeometry(1, 1, 1); pierGeo.translate(0, 0.5, 0);
const mkPier = (w) => { const m = new THREE.Mesh(pierGeo, CONC); m.castShadow = true; m.receiveShadow = true; m.userData.w = w; scene.add(m); return m; };
const deckPiers = [];
for (const z of [7.5, 12, 15.5, 18.5, -7.5, -12, -15.5, -18.5]) for (const x of [-3.6, 3.6]) { const m = mkPier(1.3); m.position.set(x, 0, z); m.userData.z = z; deckPiers.push(m); }
const rampPiers = [];
PIECES.diags.forEach((p, k) => p.verts.forEach((v, i) => { if ((v.m === 2 || v.m === 3) && i % 3 === 0 && (v.m === 2 ? v.u > 0.45 : v.u < 0.55)) { const m = mkPier(1.0); m.position.set(v.x, 0, v.z); rampPiers.push({ m, v, k, i, n: p.verts.length }); } }));
const parGeo = new THREE.BoxGeometry(0.5, 1, 2 * 11 + 2); parGeo.translate(0, 0.5, 0);
const parapets = [-1, 1].map((s) => { const m = new THREE.Mesh(parGeo, CONC); m.castShadow = true; m.position.set(s * 5.0, 0, 0); scene.add(m); return m; });

// destaques didáticos
const leaves = PIECES.loops.map((p) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(R - 3.4, 56), new THREE.MeshBasicMaterial({ color: 0xc9f56a, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(p.center.x, 0.09, p.center.z); scene.add(m); return m;
});
const weave = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.7), new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0, depthWrite: false }));
weave.rotation.x = -Math.PI / 2; weave.position.set(21, 0.13, 2.5); scene.add(weave);

// semáforos
const SIG = [
  { x: -7.4, z: 7.2, ry: -Math.PI / 2, dir: 'A' }, { x: 7.4, z: -7.2, ry: Math.PI / 2, dir: 'A' },
  { x: -7.2, z: -7.4, ry: Math.PI, dir: 'B' }, { x: 7.2, z: 7.4, ry: 0, dir: 'B' },
].map((s) => { const g = Wd.createSignal(); g.position.set(s.x, 0, s.z); g.rotation.y = s.ry; g.userData.dir = s.dir; g.visible = false; scene.add(g); return g; });

// fumaça da batida
const smokeGeo = new THREE.IcosahedronGeometry(1, 0);
const puffs = Array.from({ length: 9 }, (_, i) => { const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xe4e4e4 : 0x9a9a9a, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); return m; });

// ---------------------------------------------------------------- carros
const PAL = [0xe53935, 0x2e9e5b, 0xff8a1f, 0x3b82f6, 0xf5c518, 0xf4f4f4, 0x8e44ad, 0x15b5b0];
const AMB = [['A_E', 5, 14], ['A_W', 5, 14], ['B_S', 5, 14], ['B_N', 5, 14], ['L0', 1, 15], ['L1', 2, 15], ['L2', 2, 15], ['L3', 2, 15], ['D0', 1, 15], ['D1', 2, 15], ['D2', 2, 15], ['D3', 2, 15]];
// Em cenas com carro "herói" o tráfego de fundo só roda em pistas que ele não usa (evita carros sobrepostos).
const AMB_ON = { A_E: [0, 3, 6], A_W: [0, 3, 4, 5, 6, 7], B_S: [0, 3, 5, 6, 7], B_N: [0, 3, 4, 6], D0: [0, 6], D1: [0, 6], D2: [0, 6], D3: [0, 6], L0: [0, 6], L1: [0, 6], L2: [0, 6], L3: [0, 6] };
const ambCars = [];
let ci = 0;
for (const [id, n, v] of AMB) for (let j = 0; j < n; j++) {
  const c = Wd.createCar(PAL[(ci++ * 3) % PAL.length]); c.visible = false; scene.add(c);
  ambCars.push({ c, id, v, s0: (j / n) * ROUTES[id].L + ci * 7.3 });
}
function ambScale(id, t) {
  for (const k of AMB_ON[id]) {
    let a, b, fade = false;
    if (k === '4b') { a = T0(4) + 2.6; b = T1(4); fade = true; } else if (k === '5b') { a = T0(5) + 2.8; b = T1(5); fade = true; } else { a = T0(k); b = T1(k); }
    if (t >= a && t < b) return fade ? ss(a, a + 0.5, t) : 1;
  }
  return 0;
}

const heroes = [];
const hero = (color, fn) => { const c = Wd.createCar(color); c.visible = false; scene.add(c); heroes.push({ c, fn }); };
const inScene = (i, t) => t >= T0(i) - 0.001 && t <= T1(i) + 0.001;

// cena 1: batida no cruzamento
const tc = S[1].crashT;
hero(0xe53935, (t) => {
  if (!inScene(1, t)) return null;
  const A = ROUTES.A_E, sc = 106.4;
  if (t <= tc) return A.pose(Math.max(0, sc - 19 * (tc - t)), 0);
  const dt = t - tc, k = 1 - Math.exp(-dt * 5), p = A.pose(sc, 0);
  p.x += 1.1 * k; p.yaw += 0.07 * k; p.y += 0.25 * Math.exp(-dt * 6) * Math.abs(Math.sin(dt * 20)); return p;
});
hero(0x2e9e5b, (t) => {
  if (!inScene(1, t)) return null;
  const B = ROUTES.B_S, sc = 114.5;
  if (t <= tc) return B.pose(Math.max(0, sc - 17 * (tc - t)), 0);
  const dt = t - tc, k = 1 - Math.exp(-dt * 5), p = B.pose(sc, 0);
  p.x += 2.8 * k; p.z += 0.7 * k; p.yaw += 0.62 * k; p.y += 0.4 * Math.exp(-dt * 5) * Math.abs(Math.sin(dt * 16)); return p;
});

// cena 2: semáforo e fila
const t2 = T0(2), goT = t2 + 2.6;
const slots = [-8.6, -14.0, -19.4, -24.8, -30.2, -35.6].map((x) => x + 112);
[0xff8a1f, 0x3b82f6, 0xf4f4f4, 0x8e44ad, 0xf5c518, 0x15b5b0].forEach((col, i) => hero(col, (t) => {
  if (!inScene(2, t)) return null;
  const slot = slots[i]; let s = slot;
  if (i >= 3) { const a0 = t2 + (i - 3) * 1.0 + 0.1, p = clamp((t - a0) / 1.6); s = lerp(slot - 62, slot, 1 - Math.pow(1 - p, 2.2)); }
  const tg = goT + i * 0.5;
  if (t > tg) { const tau = t - tg, a = 7, vm = 15; s = slot + (tau < vm / a ? 0.5 * a * tau * tau : 0.5 * vm * vm / a + vm * (tau - vm / a)); }
  return ROUTES.A_E.pose(s, 0);
}));
hero(0xe53935, (t) => inScene(2, t) ? ROUTES.B_S.pose(112 - 40 + 31 * (t - t2), 0) : null);
hero(0xf5c518, (t) => inScene(2, t) ? ROUTES.B_N.pose(112 - 55 + 30 * (t - t2), 0) : null);

// cena 4: virar à direita (saída diagonal)
hero(0xff7a1a, (t) => { if (!inScene(4, t)) return null; const r = ROUTES.D0; return r.pose(r.marks.arc0 + 22 * (t - T0(4) - 3.0), lamAt(t)); });
// cena 5: virar à esquerda (alça)
hero(0xd81b60, (t) => { if (!inScene(5, t)) return null; const r = ROUTES.L0; return r.pose(r.marks.arc0 + 23 * (t - T0(5) - 3.0), lamAt(t)); });
// cena 7: entrelaçamento
hero(0x2b7de9, (t) => { if (!inScene(7, t)) return null; const r = ROUTES.D3; return r.pose(r.marks.arc1 + 17 * (t - T0(7) - 2.8), lamAt(t)); });
hero(0xffc107, (t) => { if (!inScene(7, t)) return null; const r = ROUTES.L0; return r.pose(125.5 + 17 * (t - T0(7) - 3.35), lamAt(t)); });

// ---------------------------------------------------------------- estado do mundo no tempo
const eio = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
function lamAt(t) {                       // 0 = cruzamento no mesmo nível, 1 = viaduto pronto
  if (t < T0(1)) return 1;
  if (t < T0(3) + 0.6) return 0;
  return eio((t - T0(3) - 0.6) / 2.6);
}
function diagAt(t) { if (t < T0(1)) return 1; if (t < T0(4) + 0.3) return 0; return eio((t - T0(4) - 0.3) / 1.7); }
function loopAt(t) { if (t < T0(1)) return 1; if (t < T0(5) + 0.2) return 0; return eio((t - T0(5) - 0.2) / 2.4); }

// ---------------------------------------------------------------- câmeras
const v3 = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
function camAt(t) {
  const i = sceneAt(t), u = t - T0(i);
  let p, l, fov = 55;
  switch (i) {
    case 0: { const th = 2.35 + 0.2 * u, rho = 125 - 9 * u, h = 80 - 6 * u; p = [rho * Math.sin(th), h, rho * Math.cos(th)]; l = [0, 0, 0]; fov = 52; break; }
    case 1: { p = [30 - 1.4 * u, 13, 36 - 1.0 * u]; l = [-3.5, 0.5, 2.5]; fov = 54; break; }
    case 2: { p = [-64 + 2.4 * u, 7.4, 9]; l = [-10, 1.6, 2.5]; fov = 52; break; }
    case 3: {
      if (u < 5.0) { p = [50 - 4 * u, 6.5, 26]; l = [0, 3.2, 0]; fov = 56; }
      else { const q = u - 5.0; p = [11 - 0.6 * q, 2.4, 23 - 0.6 * q]; l = [-1, 3.0, 6]; fov = 60; }
      break;
    }
    case 4: {
      const r = ROUTES.D0, ps = r.pose(r.marks.arc0 + 22 * (t - T0(4) - 3.0), lamAt(t));
      const chaseP = [ps.x - ps.dx * 12, ps.y + 6.5, ps.z - ps.dz * 12], chaseL = [ps.x + ps.dx * 10, ps.y + 0.8, ps.z + ps.dz * 10];
      const w = ss(4.6, 5.9, u);
      p = v3(chaseP, [-52, 36, 52], w); l = v3(chaseL, [-8, 2, 12], w); fov = lerp(60, 55, w); break;
    }
    case 5: {
      const r = ROUTES.L0, ps = r.pose(r.marks.arc0 + 23 * (t - T0(5) - 3.0), lamAt(t));
      const wide = [88, 66, 94], wl = [22, 0, 20];
      const fol = [ps.x - 22, ps.y + 40, ps.z + 30], fl = [ps.x, ps.y, ps.z];
      const end = [60, 72, 78], el = [8, 2, 12];
      let w1 = ss(2.2, 3.4, u), w2 = ss(8.0, 9.3, u);
      p = v3(v3(wide, fol, w1), end, w2); l = v3(v3(wl, fl, w1), el, w2); fov = 55; break;
    }
    case 6: { const w = ss(0, 4.2, u); p = v3([46, 42, 78], [0, 205, 46], w); l = v3([10, 0, 10], [0, 0, 0], w); fov = lerp(50, 60, w); break; }
    case 7: {
      if (u < 5.7) { p = [10 + 0.5 * u, 48 - 0.5 * u, 70 - 0.4 * u]; l = [18, 0, 14]; fov = 58; }
      else { const w = ss(5.7, S[7].dur, u); p = v3([12.9, 45.2, 67.7], [0, 190, 62], w); l = v3([18, 0, 14], [0, 0, 0], w); fov = lerp(58, 60, w); }
      break;
    }
  }
  const dt = t - tc;
  if (i === 1 && dt > 0 && dt < 1.3) { const d = Math.exp(-dt * 4.5) * 0.5; p = [p[0] + Math.sin(t * 70) * d, p[1] + Math.cos(t * 61) * d * 0.7, p[2] + Math.sin(t * 53) * d]; }
  return { p, l, fov };
}

// ---------------------------------------------------------------- sobreposição (legendas, selos, mascote)
const $ = (id) => document.getElementById(id);
const capEl = $('cap'), tagEl = $('tag'), xEl = $('xmark'), endEl = $('end');
const allWords = S.flatMap((s) => s.words), allTags = S.flatMap((s) => s.tags);
const backOut = (x) => { x = clamp(x); const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const cap1 = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function overlay(t) {
  const endOn = t >= T1(7) - 2.35;
  // legenda palavra por palavra
  let wi = -1; for (let i = 0; i < allWords.length; i++) { if (allWords[i].t <= t) wi = i; else break; }
  if (wi >= 0 && !endOn && t < allWords[wi].t + allWords[wi].d + 0.4) {
    const w = allWords[wi], k = backOut((t - w.t) / 0.14);
    capEl.textContent = cap1(w.w); capEl.style.opacity = 1;
    capEl.style.transform = `scale(${(0.7 + 0.3 * k).toFixed(3)}) rotate(${((1 - k) * -2).toFixed(2)}deg)`;
  } else capEl.style.opacity = 0;
  // selo amarelo com o termo-chave
  let tg = null; for (const g of allTags) if (t >= g.t && t < g.t + 2.0) tg = g;
  if (tg) {
    const a = t - tg.t, k = backOut(a / 0.22), out = 1 - ss(1.75, 2.0, a);
    tagEl.textContent = tg.label; tagEl.style.opacity = out;
    tagEl.style.transform = `scale(${(0.5 + 0.5 * k).toFixed(3)}) rotate(${(-3 + (1 - k) * 6).toFixed(2)}deg)`;
  } else tagEl.style.opacity = 0;
  // X vermelho na batida
  const dx = t - tc;
  if (dx >= 0 && dx < 1.6) { const k = backOut(dx / 0.18); xEl.style.opacity = 1 - ss(1.3, 1.6, dx); xEl.style.transform = `scale(${(0.3 + 0.7 * k).toFixed(3)}) rotate(${(Math.sin(dx * 40) * 4 * Math.exp(-dx * 4)).toFixed(2)}deg)`; } else xEl.style.opacity = 0;
  // cartão final
  if (endOn) { const a = t - (T1(7) - 2.35), k = backOut(a / 0.3); endEl.style.opacity = 1; endEl.style.transform = `scale(${(0.6 + 0.4 * k).toFixed(3)})`; } else endEl.style.opacity = 0;
  // mascote
  const f = Math.min(MOUTH.length - 1, Math.max(0, Math.round(t * FPS))), amp = MOUTH[f] || 0;
  const bob = Math.sin(t * 7.5) * 4, tilt = Math.sin(t * 3.7) * 3.2;
  $('bob').setAttribute('transform', `translate(150 320) rotate(${tilt.toFixed(2)}) scale(${(1 + 0.025 * amp).toFixed(3)} ${(1 - 0.02 * amp + Math.sin(t * 7.5) * 0.012).toFixed(3)}) translate(-150 ${(-320 + bob).toFixed(2)})`);
  $('mouth').setAttribute('ry', (5 + 20 * amp).toFixed(2)); $('mouth').setAttribute('rx', (19 - 3 * amp).toFixed(2));
  const blink = ((t * 1000) % 3100) < 130 ? 0.12 : 1;
  $('eyeL').setAttribute('transform', `translate(121 160) scale(1 ${blink}) translate(-121 -160)`);
  $('eyeR').setAttribute('transform', `translate(179 160) scale(1 ${blink}) translate(-179 -160)`);
  const brow = -amp * 6 + Math.sin(t * 5) * 1.2;
  $('browL').setAttribute('transform', `translate(0 ${brow.toFixed(2)}) rotate(${(-6 + amp * 8).toFixed(1)} 120 132)`);
  $('browR').setAttribute('transform', `translate(0 ${brow.toFixed(2)}) rotate(${(6 - amp * 8).toFixed(1)} 180 132)`);
  const wave = Math.sin(t * 9) * 12 * (0.35 + amp);
  $('armL').setAttribute('transform', `rotate(${(-18 + wave).toFixed(1)} 84 200)`);
  $('armR').setAttribute('transform', `rotate(${(18 - wave).toFixed(1)} 216 200)`);
  const px = Math.sin(t * 1.3) * 2.4; $('pupL').setAttribute('cx', 123 + px); $('pupR').setAttribute('cx', 181 + px);
}

// ---------------------------------------------------------------- quadro
let lastLam = -1;
function renderAt(t) {
  const lam = lamAt(t);
  if (Math.abs(lam - lastLam) > 1e-6) {
    lastLam = lam;
    deck.update(lam); dyn.forEach((r) => r.update(lam));
    for (const p of deckPiers) { const bottom = lam * hprof(p.userData.z) - 1.3 + 0.045; p.visible = bottom > 0.35; p.scale.set(p.userData.w, Math.max(0.01, bottom), p.userData.w); }
    parapets.forEach((m) => { m.visible = lam > 0.05; m.position.y = lam * H + 0.045; m.scale.y = lam; });
    midB.forEach((r) => { r.mesh.visible = lam > 0.02; });
  }
  const df = diagAt(t), lf = loopAt(t);
  diagRibbons.forEach((r) => r.setReveal(df)); loopRibbons.forEach((r) => r.setReveal(lf));
  for (const rp of rampPiers) { const y = Wd.yOf(rp.v, lam) - 0.3; rp.m.visible = df * (rp.n - 1) >= rp.i && y > 0.5; rp.m.scale.set(1.0, Math.max(0.01, y), 1.0); }
  // folhas do trevo
  const leafA = ss(T0(6) + 2.2, T0(6) + 3.3, t) * (1 - ss(T1(6) - 0.5, T1(6), t)) * (0.62 + 0.12 * Math.sin(t * 6));
  leaves.forEach((m) => { m.material.opacity = leafA; m.visible = leafA > 0.01; });
  const wa = ss(T0(7) + 0.8, T0(7) + 1.3, t) * (1 - ss(T0(7) + 5.3, T0(7) + 5.7, t)) * (0.42 + 0.18 * Math.sin(t * 8));
  weave.material.opacity = wa; weave.visible = wa > 0.01;
  // semáforos
  const sigOn = t >= T0(2) && t < T0(3) + 0.8;
  const aS = t - t2 < 2.6 ? 'r' : 'g', bS = t - t2 < 1.7 ? 'g' : (t - t2 < 2.4 ? 'y' : 'r');
  SIG.forEach((s) => { s.visible = sigOn; if (sigOn) Wd.setSignal(s, s.userData.dir === 'A' ? aS : bS); });
  // fumaça
  puffs.forEach((m, i) => {
    const d = t - tc - i * 0.03, p = d / 1.7;
    m.visible = d > 0 && p < 1;
    if (m.visible) { const a = i * 0.7; m.position.set(-2.5 + Math.cos(a) * 1.4 * p * 2, 1.2 + 3.2 * p + i * 0.05, 2.5 + Math.sin(a) * 1.4 * p * 2); m.scale.setScalar(0.7 + 2.6 * Math.sqrt(p)); m.material.opacity = 0.85 * (1 - p); }
  });
  // carros
  for (const a of ambCars) {
    const sc = ambScale(a.id, t);
    if (sc <= 0) { a.c.visible = false; continue; }
    const r = ROUTES[a.id], s = (((a.s0 + a.v * t) % r.L) + r.L) % r.L;
    a.c.visible = true; Wd.setCarPose(a.c, r.pose(s, lam), 1);
  }
  for (const h of heroes) { const p = h.fn(t); h.c.visible = !!p; if (p) Wd.setCarPose(h.c, p, 1); }
  // nuvens
  clouds.children.forEach((c, i) => c.position.set(c.userData.base.x + t * (1.5 + (i % 3) * 0.4), c.userData.base.y, c.userData.base.z));
  // câmera
  const c = camAt(t);
  cam.position.set(...c.p); cam.fov = c.fov; cam.updateProjectionMatrix(); cam.lookAt(...c.l);
  renderer.render(scene, cam);
  overlay(t);
}
window.renderAt = renderAt;
window.TL = TL;
renderAt(0);
window.READY = true;
