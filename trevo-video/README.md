# Trevo de estrada: vídeo vertical de 60 s

Animação 3D low-poly (Three.js) + voz pt-BR (edge-tts) + legendas palavra por palavra, tudo gerado por código.

**Resultado:** `trevo-estrada.mp4` (1080x1920, 30 fps).

## Refazer o vídeo
```bash
npm install                      # three@0.160 (o Playwright/Chromium já vem no ambiente)
pip install edge-tts numpy       # voz neural (precisa liberar speech.platform.bing.com na rede)
python3 tools/tts.py             # voz + tempo das palavras -> build/timeline.json, voice.wav, mouth.json
# render em 4 processos (cada um pega um intervalo de quadros)
for r in 0:450 450:900 900:1350 1350:1800; do node tools/render.cjs --frames $r --out build/frames & done; wait
python3 tools/mux.py             # mixa SFX, codifica e gera trevo-estrada.mp4
```
Conferir instantes soltos: `node tools/render.cjs --times 10.5,22,47.5 --out build/shots`.

## Mexer no conteúdo
- **Roteiro, voz, velocidade:** `script.json` (cada cena tem `text` e `tags`, os selos amarelos).
- **Mundo e rotas:** `web/world.js` (raios das alças, altura do viaduto, carros, árvores).
- **Coreografia, câmeras, legendas, mascote:** `web/app.js` (tudo é função do tempo `t`).
