#!/usr/bin/env node
// Renderiza quadros do vídeo no Chromium (WebGL por software) a partir de web/index.html.
//   node tools/render.cjs --frames 0:1800 --out build/frames          (intervalo de quadros)
//   node tools/render.cjs --times 1.0,6.5,12 --out build/shots        (instantes soltos, para conferir)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const OUT = path.resolve(ROOT, args.out || 'build/frames');
const QUALITY = parseInt(args.q || '92', 10);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
fs.mkdirSync(OUT, { recursive: true });

function serve() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/web/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);

  let jobs = [];
  if (args.times) jobs = args.times.split(',').map((t) => ({ t: parseFloat(t), name: `t_${parseFloat(t).toFixed(2).padStart(6, '0')}.jpg` }));
  else { const [a, b] = (args.frames || '0:1800').split(':').map(Number); for (let f = a; f < b; f++) jobs.push({ t: f / 30, name: `f_${String(f).padStart(5, '0')}.jpg` }); }

  const t0 = Date.now();
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    await page.evaluate((t) => window.renderAt(t), j.t);
    await page.screenshot({ path: path.join(OUT, j.name), type: 'jpeg', quality: QUALITY });
    if (i % 25 === 0 || i === jobs.length - 1) console.log(`${i + 1}/${jobs.length}  ${((Date.now() - t0) / (i + 1) / 1000).toFixed(2)} s/quadro`);
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
