# Spike 1 — Rendering benchmarkresultaten

Vul dit in na een **Development Build** (nooit Editor-play-mode) op de doelhardware:
**Ryzen 5 7520U / Radeon 610M iGPU / 16GB RAM**, 1080p, URP Medium-preset.

## Gemeten waarden

| Metric | Budget | Gemeten | ✅/⚠️/❌ |
|---|---|---|---|
| Framerate (constant) | ≥30 fps, target 45 | | |
| Frame time (hard max) | ≤33 ms | | |
| Frame time (target) | ≤22 ms | | |
| Draw calls (na batching) | <1500 | | |
| SetPass calls | <300 | | |
| Triangles zichtbaar/frame | <3.000.000 | | |
| VRAM (gedeeld iGPU-geheugen) | expliciet meten | | |
| RAM | <6GB | | |

Bron voor draw calls / SetPass calls / triangles / VRAM: Window → Analysis → Profiler,
tab **Rendering**, tijdens het draaien van de build (Development Build + Profiler
kan hieraan gekoppeld worden via "Development Build" + "Autoconnect Profiler" in
Build Settings). Framerate/frame time: on-screen `FpsHud` linksboven, of dezelfde
Profiler-tab.

## Testcondities

- [ ] Camera op vaste testpositie/-hoek (zie `Spike1_Rendering.unity`, Main Camera)
- [ ] Volledig ingezoomd (dichtbij, weinig gebouwen zichtbaar)
- [ ] Volledig uitgezoomd (max zoom, hele wijk zichtbaar) — dit is waar CS2 het zwaarst had
- [ ] Camera roterend door de scene (test frustum culling niet alleen vanuit 1 hoek)

## Grootste kostenpost (bij ⚠️/❌)

Gebruik de Profiler Rendering-tab om te zien waar de tijd naartoe gaat (batching,
shadows, transparency, post-processing, etc.) en noteer hier wat het grootste
aandeel neemt:

-

## Screenshots

<!-- Voeg hier 1-2 screenshots van de gebouwde scene toe -->

## Go/no-go

- [ ] ✅ Go — budget gehaald
- [ ] ⚠️ Aanpassen — net niet gehaald, gericht bijstellen (zie sectie 6 van het spike-document:
      camera-zoom begrenzen → agressievere LOD-afstanden → max aantal high-detail gebouwen
      tegelijk zichtbaar → pas als laatste: detailniveau zelf heroverwegen)
- [ ] ❌ No-go — heroverweeg artstyle-ambitie
