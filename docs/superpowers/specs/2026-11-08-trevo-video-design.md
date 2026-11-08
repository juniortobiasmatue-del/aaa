# Vídeo: como funciona um trevo de estrada (design)

**Pedido:** vídeo vertical estilo reel (animação 3D low-poly, legenda palavra por palavra, voz feminina
pt-BR) explicando como se faz um trevo rodoviário (curvas, viaduto, alças). Duração: 60 s.

## Entendimento (confirmado com o usuário)
- Referência: reel de ~9 s, 1080x2340, cenário 3D low-poly (colinas, pinheiros, carros de cor sólida,
  viaduto branco), cortes de ~1 s, legenda grande branca com contorno escuro no centro-baixo,
  selo amarelo com o termo-chave no alto, "X" vermelho nos erros, apresentadora num recorte no canto.
- Não copiar a apresentadora nem a voz: mascote original (cone de trânsito) e voz sintética pt-BR.
- Roteiro próprio, tom bem-humorado, 8 cenas (gancho, problema, semáforo, viaduto, direita, esquerda,
  vista de cima, defeito + final).

## Arquitetura
```
script.json ──► tools/tts.py ──► build/{timeline.json, voice.wav, mouth.json}
                                        │
web/index.html + app.js + world.js ◄────┘   (Three.js; tudo é função pura do tempo t)
        │  window.renderAt(t)
tools/render.cjs (Playwright/Chromium, 4 processos) ──► build/frames/f_*.jpg
        │
tools/mux.py (voz + SFX + ffmpeg) ──► trevo-estrada.mp4
```
- **Voz:** `edge-tts` (`pt-BR-FranciscaNeural`), uma chamada por cena; os `WordBoundary` dão o tempo de
  cada palavra (legendas) e os SFX/eventos (batida, selos) são ancorados nessas palavras.
- **Mundo 3D:** trevo paramétrico (alças de 270° com R=26, saídas diagonais R=11, viaduto com
  perfil suave), simetria por rotação de 90°; carros seguem rotas (polilinhas) por arco-comprimento.
  Um parâmetro `lam` sobe o viaduto e `diagAt/loopAt` revelam as rampas, então o mesmo mundo
  "se constrói" ao longo das cenas.
- **Determinismo:** nenhuma animação CSS/estado entre quadros; o render pode ser paralelizado por intervalo.

## Riscos conhecidos
- Rede do ambiente bloqueia hosts por padrão: a voz exige liberar `speech.platform.bing.com`.
- Vozes neurais online não são reproduzíveis offline; sem acesso, a alternativa seria Piper/espeak (pior qualidade).
- WebGL por software: ~0,2 s/quadro com 4 processos (≈ 6 min para 1800 quadros).
