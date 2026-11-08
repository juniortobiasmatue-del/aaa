// Coreografia do video (v2): tudo e funcao pura do tempo t (render deterministico e paralelizavel).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as Wd from './world.js';
const { W, HALF, R, RD, H, ZF, ZG, EXT, ss, clamp, lerp, ROUTES, PIECES, hprof } = Wd;

const TL = await fetch('/build/timeline.json').then((r) => r.json());
const S = TL.scenes;
const T0 = (i) => S[i].t0, T1 = (i) => S[i].t1, DUR = (i) => S[i].dur;
const sceneAt = (t) => { for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].t0) return i; return 0; };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const wt = (i, word, nth = 0) => { const ws = S[i].words.filter((w) => norm(w.w) === norm(word)); return (ws[nth] || ws[0] || S[i].words[0]).t; };

// ---------------------------------------------------------------- renderer, pos-processamento
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(1080, 1920, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

Wd.initTextures();
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdcecff, 260, 980);
const cam = new THREE.PerspectiveCamera(55, 1080 / 1920, 0.4, 2600);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const SUNDIR = new THREE.Vector3(110, 170, 70);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6a8a4a, 0.55));
const sun = new THREE.DirectionalLight(0xfff0d4, 3.1);
sun.position.copy(SUNDIR); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -135, right: 135, top: 135, bottom: -135, near: 40, far: 520 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.2;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xbcd8ff, 0.55); fill.position.set(-90, 60, -110); scene.add(fill);

const comp = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1080, 1920, { type: THREE.HalfFloatType, samples: 4 }));
comp.setPixelRatio(1); comp.setSize(1080, 1920);
comp.addPass(new RenderPass(scene, cam));
comp.addPass(new UnrealBloomPass(new THREE.Vector2(540, 960), 0.2, 0.7, 0.9));
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uFocus: { value: 0.57 }, uBand: { value: 0.2 }, uBlur: { value: 3.4 }, uVig: { value: 0.3 }, uSat: { value: 1.14 }, uCon: { value: 1.06 }, uRes: { value: new THREE.Vector2(1080, 1920) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uFocus, uBand, uBlur, uVig, uSat, uCon; varying vec2 vUv;
    void main(){
      float m = smoothstep(uBand, uBand + 0.42, abs(vUv.y - uFocus));
      float rad = m * uBlur;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (rad > 0.15) {
        vec3 acc = c; float w = 1.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i) + 0.5, r = sqrt(fi / 12.0) * rad, a = fi * 2.39996;
          vec2 o = vec2(cos(a), sin(a)) * r / uRes;
          acc += texture2D(tDiffuse, vUv + o).rgb; w += 1.0;
        }
        c = acc / w;
      }
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.18) * uCon + 0.18;
      vec2 d = vUv - 0.5; c *= 1.0 - uVig * smoothstep(0.35, 0.95, length(d * vec2(1.0, 0.72)) * 1.35);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};
comp.addPass(new ShaderPass(GRADE));
comp.addPass(new OutputPass());

// ---------------------------------------------------------------- cenario
scene.add(Wd.makeSky(), Wd.makeSun(SUNDIR.clone().normalize()));
const clouds = Wd.makeClouds(); scene.add(clouds);
const veg = Wd.makeVegetation(); const leafVeg = veg.children.slice(-3);   // jardins dentro das folhas do trevo
scene.add(Wd.makeMountains(), Wd.makeTerrain(), Wd.makeFields(), veg, Wd.makeHouses(), Wd.makeLamps());
const windmill = Wd.makeWindmill(); scene.add(windmill);
const gA = Wd.makeGantry('TREVO', 'SAÍDA 800 m ➜'); gA.position.set(-70, 0, 0); scene.add(gA);
const gB = Wd.makeGantry('TREVO', 'SAÍDA 800 m ➜'); gB.position.set(0, 0, -70); gB.rotation.y = -Math.PI / 2; scene.add(gB);

// ---------------------------------------------------------------- estradas
const ASPH = 0xffffff, YEL = 0xffd23a, WHT = 0xf4f4ee, GRAV = 0xb7ae9e;
const dyn = [];     // objetos que dependem do viaduto (lam): { update(lam) }
const flatHide = []; // peças da ponte que somem enquanto o cruzamento e plano
const line = (off, a, b, axis) => { const v = []; for (let c = a; c <= b + 1e-6; c += 2) v.push(axis === 'A' ? { x: c, z: off, m: 0, u: 0 } : { x: off, z: c, m: 1, u: 0 }); return v; };
const ribbon = (verts, hw, color, yOff, extra, isDyn) => { const r = Wd.makeRibbon(verts, hw, color, yOff, extra); scene.add(r.mesh); if (isDyn) dyn.push(r); return r; };
ribbon(line(0, -EXT, EXT, 'A'), HALF, ASPH, 0.03, { map: Wd.TEX.asphalt, layer: 1 });
ribbon(line(0, -EXT, EXT, 'A'), HALF + 1.4, GRAV, 0.014, { layer: 0.5, roughness: 1 });
ribbon(line(0, -EXT, EXT, 'B'), HALF, ASPH, 0.05, { map: Wd.TEX.asphalt, layer: 1 }, true);
for (const [a, b] of [[-EXT, -(ZG + 8)], [ZG + 8, EXT]]) ribbon(line(0, a, b, 'B'), HALF + 1.4, GRAV, 0.014, { layer: 0.5, roughness: 1 }, true);
const midB = [], crossG = Wd.makeCrosswalks(); scene.add(crossG);
const GAP = HALF + 2.2;
const AP = [[-EXT, -GAP], [GAP, EXT]], BP = [[-EXT, -GAP, false], [GAP, EXT, false], [-GAP, GAP, true]];
for (const o of [-0.22, 0.22]) {
  for (const [a, b] of AP) ribbon(line(o, a, b, 'A'), 0.09, YEL, 0.05, { layer: 3 });
  for (const [a, b, mid] of BP) { const r = ribbon(line(o, a, b, 'B'), 0.09, YEL, 0.07, { layer: 3 }, true); if (mid) midB.push(r); }
}
for (const o of [-(HALF - 0.42), HALF - 0.42]) {
  for (const [a, b] of AP) ribbon(line(o, a, b, 'A'), 0.1, WHT, 0.05, { layer: 3 });
  for (const [a, b, mid] of BP) { const r = ribbon(line(o, a, b, 'B'), 0.1, WHT, 0.07, { layer: 3 }, true); if (mid) midB.push(r); }
}

// ponte: viga, encontros, colunas, barreiras; aterros nas aproximacoes
const deckBeam = Wd.makeDeckBeam(-ZF, ZF); scene.add(deckBeam.mesh); dyn.push(deckBeam); flatHide.push(deckBeam.mesh);
const abut = Wd.makeAbutments(); abut.meshes.forEach((m) => { scene.add(m); flatHide.push(m); }); dyn.push(abut);
const piers = Wd.makePiers(); scene.add(piers.group); dyn.push(piers); flatHide.push(piers.group);
const emb = (sign) => { const v = []; for (let z = ZF; z <= ZG + 12; z += 1) v.push({ x: 0, z: sign * z, m: 1, u: 0 }); return v; };
for (const sgn of [-1, 1]) {
  const e = Wd.makeEmbankment(emb(sgn), HALF + 0.7, 1.8, -0.02); scene.add(e.mesh); dyn.push(e);
  for (const off of [-(HALF + 0.35), HALF + 0.35]) {
    const verts = []; for (let z = ZF; z <= ZG + 4; z += 1.5) verts.push({ x: 0, z: sgn * z, m: 1, u: 0 });
    const rl = Wd.makeBarrier(verts, off, 'rail'); scene.add(rl.mesh); dyn.push(rl); flatHide.push(rl.mesh);
    const ps = Wd.makePosts(verts, off, 4); scene.add(ps.mesh); dyn.push(ps); flatHide.push(ps.mesh);
  }
}
for (const off of [-(HALF + 0.05), HALF + 0.05]) {
  const verts = []; for (let z = -ZF; z <= ZF + 1e-6; z += 1.8) verts.push({ x: 0, z, m: 1, u: 0 });
  const b = Wd.makeBarrier(verts, off, 'jersey'); scene.add(b.mesh); dyn.push(b); flatHide.push(b.mesh);
}

// rampas (revelam ao longo da narracao)
const loopParts = PIECES.loops.map((p) => [ribbon(p.verts, Wd.RAMPH, ASPH, 0.06, { map: Wd.TEX.asphalt, layer: 2 }, true), ribbon(p.verts, Wd.RAMPH + 1.0, GRAV, 0.016, { layer: 0.6, roughness: 1 }, true)]);
const diagParts = PIECES.diags.map((p) => {
  const e = Wd.makeEmbankment(p.verts, Wd.RAMPH + 0.9, 1.8, -0.035); scene.add(e.mesh); dyn.push(e);
  return [ribbon(p.verts, Wd.RAMPH, ASPH, 0.062, { map: Wd.TEX.asphalt, layer: 2 }, true), e];
});

// destaques didaticos
const leaves = PIECES.loops.map((p) => {
  const g = new THREE.Group();
  const fillM = new THREE.Mesh(new THREE.CircleGeometry(R - 3.4, 64), new THREE.MeshBasicMaterial({ color: 0xc9f56a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 3.9, R - 3.3, 80), new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  g.add(fillM, ring); g.rotation.x = -Math.PI / 2; g.position.set(p.center.x, 0.12, p.center.z); scene.add(g); g.userData = { fillM, ring }; return g;
});
const WEAVE_X0 = W + RD, WEAVE_X1 = W + R;
const weave = new THREE.Mesh(new THREE.PlaneGeometry(WEAVE_X1 - WEAVE_X0, HALF * 0.95), new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0, depthWrite: false, fog: false }));
weave.rotation.x = -Math.PI / 2; weave.position.set((WEAVE_X0 + WEAVE_X1) / 2, 0.14, HALF / 2 + 0.05); scene.add(weave);

// semaforos
const SIG = [
  { x: -(HALF + 3.2), z: HALF + 3.0, ry: -Math.PI / 2, dir: 'A' }, { x: HALF + 3.2, z: -(HALF + 3.0), ry: Math.PI / 2, dir: 'A' },
  { x: -(HALF + 3.0), z: -(HALF + 3.2), ry: Math.PI, dir: 'B' }, { x: HALF + 3.0, z: HALF + 3.2, ry: 0, dir: 'B' },
].map((s) => { const g = Wd.createSignal(); g.position.set(s.x, 0, s.z); g.rotation.y = s.ry; g.userData.dir = s.dir; g.visible = false; scene.add(g); return g; });

// fumaca/fagulhas da batida
const puffGeo = new THREE.IcosahedronGeometry(1, 1);
const puffs = Array.from({ length: 10 }, (_, i) => { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xeeeeee : 0xa4a4a4, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); return m; });
const sparkGeo = new THREE.SphereGeometry(0.09, 6, 4);
const sparks = Array.from({ length: 22 }, () => { const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffd36a, fog: false })); m.visible = false; scene.add(m); return m; });

// ---------------------------------------------------------------- carros
const PAL = [0xe53935, 0x1f9d63, 0xff8a1f, 0x2f7de1, 0xf5c518, 0xf2f2f2, 0x8e44ad, 0x14b3ad, 0xd81b60, 0x37474f];
const AMB = [['A_E', 4, 14], ['A_W', 4, 14], ['B_S', 4, 14], ['B_N', 4, 14], ['L0', 1, 15], ['L1', 2, 15], ['L2', 2, 15], ['L3', 2, 15], ['D0', 1, 15], ['D1', 2, 15], ['D2', 2, 15], ['D3', 2, 15]];
// onde o trafego de fundo roda (cenas em que um carro "heroi" usa a pista ficam sem trafego ali)
const AMB_ON = { A_E: [0, 3, 6], A_W: [0, 3, 4, 5, 6, 7], B_S: [0, 3, 5, 6, 7], B_N: [0, 3, 4, 6], D0: [0, 6], D1: [0, 6], D2: [0, 6], D3: [0, 6], L0: [0, 6], L1: [0, 6], L2: [0, 6], L3: [0, 6] };
const ambCars = [];
let ci = 0;
for (const [id, n, v] of AMB) for (let j = 0; j < n; j++) {
  const k = ci++, type = Wd.CAR_TYPES[(k * 7 + 2) % 4 + (k % 11 === 5 ? 1 : 0) > 4 ? 4 : (k * 7 + 2) % 4 + (k % 11 === 5 ? 1 : 0)];
  const c = Wd.createCar(PAL[(k * 3) % PAL.length], type); c.visible = false; scene.add(c);
  ambCars.push({ c, id, v, s0: (j / n) * ROUTES[id].L + k * 9.7 });
}
const ambOn = (id, t) => AMB_ON[id].some((i) => t >= T0(i) && t < T1(i));

const heroes = [];
const hero = (color, type, fn, trail) => { const c = Wd.createCar(color, type); c.visible = false; scene.add(c); const tr = trail ? Wd.makeTrail(trail.color) : null; if (tr) scene.add(tr.mesh); heroes.push({ c, fn, tr, trail }); };
const inScene = (i, t) => t >= T0(i) - 0.001 && t <= T1(i) + 0.001;
const lam = { v: 1 };

// cena 1: batida
const tc = S[1].crashT;
const SC_RED = (-(W + 1.0 + 2.25)) + EXT, SC_GRN = W + EXT;
hero(0xe53935, 'sedan', (t) => {
  if (!inScene(1, t)) return null;
  const A = ROUTES.A_E;
  if (t <= tc) return A.pose(Math.max(0, SC_RED - 19 * (tc - t)), 0);
  const dt = t - tc, k = 1 - Math.exp(-dt * 5), p = A.pose(SC_RED, 0);
  p.x += 1.1 * k; p.yaw += 0.07 * k; p.y += 0.25 * Math.exp(-dt * 6) * Math.abs(Math.sin(dt * 20)); return p;
});
hero(0x1f9d63, 'suv', (t) => {
  if (!inScene(1, t)) return null;
  const B = ROUTES.B_S;
  if (t <= tc) return B.pose(Math.max(0, SC_GRN - 17 * (tc - t)), 0);
  const dt = t - tc, k = 1 - Math.exp(-dt * 5), p = B.pose(SC_GRN, 0);
  p.x += 2.8 * k; p.z += 0.7 * k; p.yaw += 0.62 * k; p.y += 0.4 * Math.exp(-dt * 5) * Math.abs(Math.sin(dt * 16)); return p;
});
// cena 2: semaforo e fila
const t2 = T0(2), T_B_YEL = t2 + 1.9, T_B_RED = t2 + 2.5, T_A_GRN = t2 + 2.6;
const slots = [0, 1, 2, 3, 4, 5].map((i) => -(HALF + 5.8 + 2.9 + i * 5.7) + EXT);
[[0xff8a1f, 'hatch'], [0x2f7de1, 'sedan'], [0xf2f2f2, 'suv'], [0x8e44ad, 'hatch'], [0xf5c518, 'sedan'], [0x14b3ad, 'pickup']].forEach(([col, type], i) => hero(col, type, (t) => {
  if (!inScene(2, t)) return null;
  const slot = slots[i]; let s = slot;
  if (i >= 3) { const a0 = t2 + (i - 3) * 0.9 + 0.1, p = clamp((t - a0) / 1.6); s = lerp(slot - 66, slot, 1 - Math.pow(1 - p, 2.2)); }
  const tg = T_A_GRN + i * 0.5;
  if (t > tg) { const tau = t - tg, a = 7, vm = 15; s = slot + (tau < vm / a ? 0.5 * a * tau * tau : 0.5 * vm * vm / a + vm * (tau - vm / a)); }
  return ROUTES.A_E.pose(s, 0);
}));
hero(0xe53935, 'bus', (t) => inScene(2, t) ? ROUTES.B_S.pose(EXT - 52 + 30 * (t - t2), 0) : null);
hero(0xf5c518, 'suv', (t) => inScene(2, t) ? ROUTES.B_N.pose(EXT - 62 + 29 * (t - t2), 0) : null);
// cena 4: saida a direita
const tR0 = wt(4, 'saida') - 0.55, vR = 20;
hero(0xff7a1a, 'hatch', (t) => { if (!inScene(4, t)) return null; const r = ROUTES.D0; return r.pose(r.marks.arc0 + vR * (t - tR0), lam.v); }, { color: 0xffd23a });
// cena 5: alca (esquerda)
const tL0 = T0(5) + 0.7, vL = 28;   // a volta da alca cobre a frase "sai pela direita ... entra na outra pista"
const arcLenL = ROUTES.L0.marks.arc1 - ROUTES.L0.marks.arc0;
hero(0xd81b60, 'sedan', (t) => { if (!inScene(5, t)) return null; const r = ROUTES.L0; return r.pose(r.marks.arc0 + vL * (t - tL0), lam.v); }, { color: 0xff5fa8 });
// cena 7: entrelacamento
const tE = wt(7, 'entrelacamento');
hero(0x2b7de9, 'suv', (t) => { if (!inScene(7, t)) return null; const r = ROUTES.D3; return r.pose(r.marks.arc1 + 17 * (t - (tE + 0.5)), lam.v); }, { color: 0x6fb1ff });
hero(0xffc107, 'hatch', (t) => { if (!inScene(7, t)) return null; const r = ROUTES.L0; return r.pose((WEAVE_X0 + EXT) + 17 * (t - (tE + 1.15)), lam.v); }, { color: 0xffe08a });

// ---------------------------------------------------------------- estado do mundo no tempo
const eio = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const tRise = wt(3, 'passasse');
const lamAt = (t) => (t < T0(1) ? 1 : t < tRise ? 0 : eio((t - tRise) / 2.4));
const diagAt = (t) => (t < T0(1) ? 1 : t < T0(4) + 0.2 ? 0 : eio((t - T0(4) - 0.2) / 1.6));
const loopAt = (t) => (t < T0(1) ? 1 : t < T0(5) + 0.3 ? 0 : eio((t - T0(5) - 0.3) / 2.6));

// ---------------------------------------------------------------- camera
const mix = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
const mixc = (a, b, f) => ({ p: mix(a.p, b.p, f), l: mix(a.l, b.l, f), fov: lerp(a.fov, b.fov, f) });
const K = (p, l, fov = 55) => ({ p, l, fov });
const shot = (a, b) => (f) => mixc(a, b, eio(f));         // dolly suave entre dois enquadramentos
const orbit = (c, r0, r1, h0, h1, a0, a1, fov = 52) => (f) => { f = eio(f); const r = lerp(r0, r1, f), a = lerp(a0, a1, f); return K([c[0] + r * Math.sin(a), lerp(h0, h1, f), c[2] + r * Math.cos(a)], c, fov); };
const chase = (route, sFn, back, up, ahead, fov = 58) => (f, t) => { const p = route.pose(sFn(t), lam.v); return K([p.x - p.dx * back, p.y + up, p.z - p.dz * back], [p.x + p.dx * ahead, p.y + 0.8, p.z + p.dz * ahead], fov); };
const follow = (route, sFn, off, fov = 56) => (f, t) => { const p = route.pose(sFn(t), lam.v); return K([p.x + off[0], p.y + off[1], p.z + off[2]], [p.x, p.y, p.z], fov); };

const sD0 = (t) => ROUTES.D0.marks.arc0 + vR * (t - tR0);
const sL0 = (t) => ROUTES.L0.marks.arc0 + vL * (t - tL0);
const tLArc1 = tL0 + arcLenL / vL;
const SHOTS = [
  // 0 gancho
  [[0, orbit([0, 0, 0], 165, 128, 118, 88, 2.35, 2.85, 54)],
   [2.0, shot(K([-5, 14, 135], [0, 4, -20], 56), K([-4, 8, 62], [0, 4.5, -14], 56))],
   [3.9, shot(K([30, 21, 38], [0, 2.5, 0], 52), K([24, 17, 31], [0, 2.5, 0], 52))]],
  // 1 problema (cruzamento no mesmo nivel)
  [[0, shot(K([32, 25, 36], [0, 0, 0], 52), K([27, 22, 31], [0, 0, 0], 52))],
   [2.4, shot(K([23, 14, 24], [-3, 0.8, 1.5], 54), K([19, 11.5, 20], [-3.4, 0.8, 1.8], 54))],
   [tc - T0(1) - 0.35, shot(K([14, 6.5, 16], [-3.4, 1.1, 2.1], 50), K([12, 5.5, 14], [-3.4, 1.1, 2.1], 50))]],
  // 2 semaforo
  [[0, shot(K([-17, 4.8, 12.5], [-7.4, 5.6, 7.2], 44), K([-14, 4.5, 10.5], [-7.4, 5.4, 7.2], 44))],
   [2.2, shot(K([-60, 10.5, 11], [-14, 1.4, 2.1], 52), K([-53, 9.5, 10], [-14, 1.4, 2.1], 52))],
   [4.4, shot(K([-46, 29, 27], [-20, 0, 2], 54), K([-40, 25, 22], [-20, 0, 2], 54))]],
  // 3 viaduto
  [[0, shot(K([46, 16, 28], [0, 1.8, 0], 54), K([41, 14.5, 25], [0, 1.8, 0], 54))],
   [2.9, shot(K([36, 12, 20], [0, 2.4, 0], 54), K([40, 21, 31], [0, 2.4, 0], 54))],
   [5.4, shot(K([22, 1.7, 3.4], [0, 2.0, 0.6], 60), K([15, 1.9, 2.8], [-2, 2.6, 0.6], 60))],
   [7.1, shot(K([-30, 2.1, 3.0], [8, 3.2, 1.8], 60), K([-24, 2.3, 3.0], [8, 3.4, 1.8], 60))]],
  // 4 direita
  [[0, shot(K([-56, 40, 50], [-14, 0, 12], 54), K([-50, 35, 44], [-14, 0, 12], 54))],
   [tR0 - T0(4) - 1.2, chase(ROUTES.D0, sD0, 13, 6, 12)],
   [tR0 - T0(4) + 2.6, shot(K([-44, 12, 44], [-6, 1.6, 20], 56), K([-38, 14, 50], [-4, 1.6, 26], 56))]],
  // 5 esquerda
  [[0, shot(K([100, 72, 104], [32, 0, 30], 55), K([90, 66, 94], [32, 0, 30], 55))],
   [1.2, chase(ROUTES.L0, sL0, 12, 5.2, 14, 58)],
   [3.4, follow(ROUTES.L0, sL0, [-22, 44, 28], 58)],
   [tLArc1 - T0(5) - 1.0, shot(K([-15, 6.5, 48], [4, 1.5, 33], 56), K([-13, 6, 46], [4, 1.5, 32], 56))],
   [tLArc1 - T0(5) + 0.9, shot(K([40, 64, 90], [4, 1, 18], 56), K([20, 56, 70], [4, 1, 12], 56))]],
  // 6 vista de cima
  [[0, shot(K([-104, 64, 104], [0, 0, 0], 55), K([-70, 74, 92], [0, 0, 0], 55))],
   [2.4, shot(K([-24, 130, 100], [0, 0, 0], 56), K([0, 252, 42], [0, 0, 0], 62))]],
  // 7 final
  [[0, shot(K([47, 23, 41], [29, 0, 6], 52), K([42, 20, 36], [29, 0, 6], 52))],
   [1.9, shot(K([33, 17, 21], [29, 0.4, 2.6], 50), K([36, 15, 17.5], [29, 0.4, 2.6], 50))],
   [5.3, shot(K([2, 100, 116], [0, 0, 0], 55), K([-16, 116, 96], [0, 0, 0], 55))],
   [7.9, shot(K([-10, 190, 90], [0, 0, 0], 58), K([0, 255, 44], [0, 0, 0], 62))]],
];
function camAt(t) {
  const i = sceneAt(t), u = t - T0(i), list = SHOTS[i];
  let k = 0; for (let j = 0; j < list.length; j++) if (u >= list[j][0]) k = j;
  const a = list[k][0], b = k + 1 < list.length ? list[k + 1][0] : DUR(i);
  const c = list[k][1](clamp((u - a) / Math.max(0.01, b - a)), t);
  if (i === 1) { const dt = t - tc; if (dt > 0 && dt < 1.3) { const d = Math.exp(-dt * 4.5) * 0.45; c.p = [c.p[0] + Math.sin(t * 70) * d, c.p[1] + Math.cos(t * 61) * d * 0.7, c.p[2] + Math.sin(t * 53) * d]; } }
  c.p = [c.p[0] + Math.sin(t * 1.3) * 0.08, c.p[1] + Math.sin(t * 1.9) * 0.06, c.p[2] + Math.cos(t * 1.1) * 0.08];
  return c;
}

// ---------------------------------------------------------------- sobreposicao (legendas, selos, X, cartao final)
const $ = (id) => document.getElementById(id);
const capEl = $('cap'), tagEl = $('tag'), xEl = $('xmark'), endEl = $('end');
const allWords = S.flatMap((s) => s.words);
const allTags = S.flatMap((s, i) => s.tags.map((g) => ({ ...g, end: Math.min(g.t + 2.0, T1(i) - 0.05) })));
const backOut = (x) => { x = clamp(x); const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const cap1 = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const END_T = T1(7) - 2.4;
function overlay(t) {
  const endOn = t >= END_T;
  let wi = -1; for (let i = 0; i < allWords.length; i++) { if (allWords[i].t <= t) wi = i; else break; }
  if (wi >= 0 && !endOn && t < allWords[wi].t + allWords[wi].d + 0.4) {
    const w = allWords[wi], k = backOut((t - w.t) / 0.14);
    capEl.textContent = cap1(w.w); capEl.style.opacity = 1;
    capEl.style.transform = `scale(${(0.7 + 0.3 * k).toFixed(3)}) rotate(${((1 - k) * -2).toFixed(2)}deg)`;
  } else capEl.style.opacity = 0;
  let tg = null; for (const g of allTags) if (t >= g.t && t < g.end) tg = g;
  if (tg) {
    const a = t - tg.t, k = backOut(a / 0.22), out = 1 - ss(tg.end - tg.t - 0.25, tg.end - tg.t, a);
    tagEl.textContent = tg.label; tagEl.style.opacity = out;
    tagEl.style.transform = `scale(${(0.5 + 0.5 * k).toFixed(3)}) rotate(${(-3 + (1 - k) * 6).toFixed(2)}deg)`;
  } else tagEl.style.opacity = 0;
  const dx = t - tc;
  if (dx >= 0 && dx < 1.6) { const k = backOut(dx / 0.18); xEl.style.opacity = 1 - ss(1.3, 1.6, dx); xEl.style.transform = `scale(${(0.3 + 0.7 * k).toFixed(3)}) rotate(${(Math.sin(dx * 40) * 4 * Math.exp(-dx * 4)).toFixed(2)}deg)`; } else xEl.style.opacity = 0;
  if (endOn) { const a = t - END_T, k = backOut(a / 0.3); endEl.style.opacity = 1; endEl.style.transform = `scale(${(0.6 + 0.4 * k).toFixed(3)})`; } else endEl.style.opacity = 0;
}

// ---------------------------------------------------------------- quadro
let lastLam = -1;
function renderAt(t) {
  lam.v = lamAt(t);
  if (Math.abs(lam.v - lastLam) > 1e-6) {
    lastLam = lam.v; dyn.forEach((d) => d.update(lam.v));
    midB.forEach((r) => { r.mesh.visible = lam.v > 0.02; });
    crossG.visible = lam.v < 0.02;
    flatHide.forEach((m) => { m.visible = lam.v > 0.03; });
  }
  const df = diagAt(t), lf = loopAt(t);
  leafVeg.forEach((m) => { m.visible = lf > 0.97; });
  diagParts.forEach((ps) => ps.forEach((p) => p.setReveal(df))); loopParts.forEach((ps) => ps.forEach((p) => p.setReveal(lf)));
  // folhas do trevo acendem
  const leafA = ss(wt(6, 'folhas') - 1.6, wt(6, 'folhas') - 0.8, t) * (1 - ss(T1(6) - 0.5, T1(6), t));
  leaves.forEach((g) => { g.userData.fillM.material.opacity = leafA * (0.32 + 0.06 * Math.sin(t * 6)); g.userData.ring.material.opacity = leafA * (0.55 + 0.2 * Math.sin(t * 6)); g.visible = leafA > 0.01; });
  const wa = ss(T0(7) + 0.5, T0(7) + 1.0, t) * (1 - ss(T0(7) + 5.0, T0(7) + 5.4, t)) * (0.4 + 0.18 * Math.sin(t * 8));
  weave.material.opacity = wa; weave.visible = wa > 0.01;
  // semaforos
  const sigOn = t >= T0(2) && t < tRise + 0.5;
  const aS = t < T_A_GRN ? 'r' : 'g', bS = t < T_B_YEL ? 'g' : (t < T_B_RED ? 'y' : 'r');
  SIG.forEach((s) => { s.visible = sigOn; if (sigOn) Wd.setSignal(s, s.userData.dir === 'A' ? aS : bS); });
  // fumaca e fagulhas
  const cx = -(W + 0.2), cz = W + 0.1;
  puffs.forEach((m, i) => {
    const d = t - tc - i * 0.03, p = d / 1.8; m.visible = d > 0 && p < 1;
    if (m.visible) { const a = i * 0.7; m.position.set(cx + Math.cos(a) * 1.6 * p * 2, 1.0 + 3.4 * p + i * 0.05, cz + Math.sin(a) * 1.6 * p * 2); m.scale.setScalar(0.7 + 2.8 * Math.sqrt(p)); m.material.opacity = 0.85 * (1 - p); }
  });
  sparks.forEach((m, i) => {
    const d = t - tc, a = i * 2.4, sp = 3 + (i % 5) * 1.3; m.visible = d > 0 && d < 0.7;
    if (m.visible) m.position.set(cx + Math.cos(a) * sp * d, 0.8 + 6 * d - 14 * d * d, cz + Math.sin(a) * sp * d);
  });
  // carros
  for (const a of ambCars) {
    if (!ambOn(a.id, t)) { a.c.visible = false; continue; }
    const r = ROUTES[a.id], s = (((a.s0 + a.v * t) % r.L) + r.L) % r.L;
    a.c.visible = true; Wd.setCarPose(a.c, r.pose(s, lam.v), 1);
  }
  for (const h of heroes) {
    const p = h.fn(t); h.c.visible = !!p; if (p) Wd.setCarPose(h.c, p, 1);
    if (h.tr) { if (p && h.trail) { /* rastro: segue o carro pela mesma rota */ } }
  }
  // rastros luminosos dos carros da explicacao
  trailFor(t);
  windmill.userData.rotor.rotation.z = t * 0.9;
  clouds.children.forEach((c, i) => c.position.set(c.userData.base.x + t * (2.0 + (i % 3) * 0.6), c.userData.base.y, c.userData.base.z));
  const c = camAt(t);
  cam.position.set(...c.p); cam.fov = c.fov; cam.lookAt(...c.l);
  cam.setViewOffset(1080, 1920, 0, 150, 1080, 1920);   // sobe o assunto: sobra espaco para a legenda embaixo
  cam.updateProjectionMatrix();
  comp.render();
  overlay(t);
}
function trailFor(t) {
  const set = (idx, route, sFn, scene_i, tOn) => { const h = heroes[idx]; if (!h || !h.tr) return; const on = inScene(scene_i, t) && t >= tOn; if (on) h.tr.update(route, sFn(t), lam.v, 36); else h.tr.hide(); };
  // indices: dos herois registrados acima
  for (let i = 0; i < heroes.length; i++) { if (heroes[i].tr) heroes[i].tr.hide(); }
  const find = (color) => heroes.findIndex((h) => h.trail && h.trail.color === color);
  const iR = find(0xffd23a), iL = find(0xff5fa8), iX = find(0x6fb1ff), iY = find(0xffe08a);
  set(iR, ROUTES.D0, sD0, 4, tR0 - 1.5); set(iL, ROUTES.L0, sL0, 5, tL0 - 1.5);
  set(iX, ROUTES.D3, (tt) => ROUTES.D3.marks.arc1 + 17 * (tt - (tE + 0.5)), 7, T0(7) + 0.4);
  set(iY, ROUTES.L0, (tt) => (WEAVE_X0 + EXT) + 17 * (tt - (tE + 1.15)), 7, T0(7) + 0.4);
}
window.renderAt = renderAt; window.TL = TL;
renderAt(0);
window.READY = true;
