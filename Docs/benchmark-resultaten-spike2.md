# Spike 2 — Simulatie/CPU-belasting benchmarkresultaten

Vul dit in na een **Development Build** (nooit Editor-play-mode) van `Spike2_Simulation.unity`
op de doelhardware: **Ryzen 5 7520U / Radeon 610M iGPU / 16GB RAM**.

Laat de build een tijd doorlopen (minstens 10-15 minuten realtime = 10-15 in-game dagen bij de
huidige 60 sec/dag-instelling in `Spike2Config.SecondenPerDag`) zodat elk tick-interval
meerdere keren triggert, en bekijk per-System-tijd via Window → Analysis → Profiler
(CPU-module, klap "PlayerLoop" open → "SimulationSystemGroup" → per systeem).

## Gemeten waarden per System

| Systeem | Tick-interval | Budget | Gemeten (Profiler) | ✅/⚠️/❌ |
|---|---|---|---|---|
| TrafficFlowSystem (verkeersflow) | ~1.5s | <5ms | | |
| VraagAanbodSystem (per in-game dag) | 1x/dag | <10ms | | |
| WaterBalanceSystem | event-driven | <2ms/herberekening | | |
| BiedingsrondeSystem | event-driven, max 20/tick | <5ms/kavel-ronde | | |

## Algemeen

- Aantal kavels gegenereerd: 750 (zie `Spike2Config.KavelCount`)
- Aantal wegnodes: ~40 (grid), aantal ontwikkelaars: 15, aantal waterlichamen: 8
- On-screen `Spike2Hud` linksboven: dag-teller, aantal kavels, wachtende biedingen, water dirty count
- [ ] Dag-teller loopt zichtbaar op tijdens de testrun (bevestigt dat tick-intervallen daadwerkelijk meerdere keren triggeren)

## Zwaarste System (bij ⚠️/❌)

-

## Go/no-go

- [ ] ✅ Go — alle tick-budgets gehaald bij 750 kavels
- [ ] ⚠️ Aanpassen — één System overschrijdt het budget (waarschijnlijkste kandidaat volgens
      sectie 5: biedingsronde-generatie) → dat specifieke System optimaliseren
      (strengere batch-limiet, of alsnog naar Burst verplaatsen)
- [ ] ❌ No-go — meerdere Systems overschrijden budgets fors → schaal-aannames heroverwegen
      vóór het volledige design document

## Samen met Spike 1

Zie ook `benchmark-resultaten.md` (GPU/rendering). Twee onafhankelijke datapunten,
precies de twee assen die bij CS2 apart faalden op verschillende momenten.
