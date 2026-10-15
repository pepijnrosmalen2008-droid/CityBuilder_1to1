# Stadbouwer – webversie

Een stadsbouwspel in de stijl van Cities: Skylines, in de browser (TypeScript + three.js), zonder
externe assets: alle modellen en texturen worden procedureel gemaakt.

## Starten

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

- `?demo` – bouwt een voorbeeldstad en laat die groeien.
- `?kwaliteit=laag` – lagere schaduwresolutie, geen ambient occlusion (voor zwakkere laptops).
- `?cam=x,z,afstand,draai,kanteling` – camerastand.
- `?shot` – fotomodus: bouwt alles op en rendert één frame (voor geautomatiseerde screenshots).

`npm run build` maakt `dist/`. Bij een push naar `main` publiceert `.github/workflows/web-pages.yml`
de site op GitHub Pages: https://pepijnrosmalen2008-droid.github.io/CityBuilder_1to1/ (slagio.nl/stad verwijst
hierheen).

## Verkeer

`src/core/verkeer/` (engine-onafhankelijk):

- `rijstroken.ts`: rijstrookgraaf uit de dwarsprofielen; verbindingen op kruispunten met afslagregels (rechts rechtsaf, links linksaf, rechtdoor over alle stroken), conflicten (kruisen of samenvoegen), verkeersafhankelijke verkeerslichten waar een laan of grotere weg een straat kruist.
- `verkeer.ts`: ritten (woon-werk, winkelen, bestelbussen, vrachtwagens van en naar de buitenaansluitingen), routes met A* (voorkeur voor hogere wegen), volggedrag met het Intelligent Driver Model, voorsorteren door van strook te wisselen, voorrang (hogere weg, rechts gaat voor, rechtdoor voor linksaf), het kruispunt niet blokkeren, doorstroming als meter in de HUD.
- `geom/autos.ts`: procedurele voertuigen (hatchback, sedan, stationwagen, SUV, bestelbus, vrachtwagen, bus) met lak per voertuig, glas, wielkasten, lampen, kentekens en remlichten; een eenvoudige versie voor op afstand.

## Nutsvoorzieningen

`src/core/voorzieningen.ts`: stroom, drinkwater, riolering en afval zoals in Cities: Skylines 2 (leidingen en kabels lopen langs de wegen). Voorzieningen (windturbine, zonnepark, gascentrale, pompstation, rioolwaterzuivering, stortplaats, afvalenergiecentrale) leveren aan alle gebouwen die via het wegennet verbonden zijn. Per netwerk productie tegen verbruik (Nederlandse kengetallen); met een buitenaansluiting wordt een tekort duur ingekocht. Zonder voorziening lopen gebouwen leeg, daalt de vraag en de tevredenheid en verschijnen er meldingen boven de gebouwen. Een nieuwe kaart begint met een snelweg vanaf de rand (de buitenaansluiting).

## Besturing

| Toets / muis | Functie |
|---|---|
| X / Z / G / N / U / B / Esc | Wegen / Zones / Economie (gebieden: eerst naast een weg klikken voor het hoofdgebouw, dan de hoekpunten) / Voorzieningen (stroom, water, afval, hulpdiensten) / Opwaarderen / Slopen / Kijken |
| 1–9 | Wegtype of zonetype |
| C | Tekenstijl wisselen: recht, bocht, vrij (vrij = altijd vloeiend doorlopend) |
| PgUp / PgDn | Hoogte van de weg in stappen van 4 m: viaduct (omhoog) of tunnel (omlaag); wegen op verschillende hoogte kruisen zonder kruispunt |
| H | Hulplijnen en snappen aan/uit (verlengden, haakse lijnen, evenwijdig op blokafstand van 2×25 of 2×50 m) |
| Linkerklik | Beginpunt, (bochtpunt), eindpunt; zones: slepen met het penseel |
| Rechterklik | Stoppen met tekenen |
| + / − | Penseelgrootte |
| WASD, middelste knop | Schuiven |
| Q/E, rechts slepen | Draaien |
| R/F | Kantelen |
| Scrollen | Zoomen (tot op straatniveau) |
| Spatie | Pauze |
| Tikken / slepen / knijpen | Op een aanraakscherm: klikken / schuiven, de grond volgt je vinger (in Zones: schilderen) / zoomen (of de knoppen + en −); twee vingers draaien, of samen omhoog/omlaag om te kantelen |

## Opbouw: klaar om naar een andere engine te verhuizen

Het spel is strikt in lagen verdeeld. Alleen de onderste twee lagen weten iets van three.js of de
browser; `npm run check` bewaakt dat (`scripts/check-core.mjs`).

```
src/core/      Engine-onafhankelijk (puur TypeScript, geen three.js, geen DOM)
  math, rng, noise         Vectoren, deterministische random, ruis
  terrain.ts               Hoogteveld, grondverzet, stralen, bodemmix
  wegen/                   Wegtypen (dwarsprofielen) en het wegennet (Bézier-segmenten,
                           splitsen op kruisingen, hoogteprofiel, bruggen)
  wereld.ts                Kavels, zones, gebouwen, simulatie (groei, bevolking, vraag), opslaan
  zones.ts                 Zones, gebouwvormen, kengetallen (m² per woning/baan, huishoudens)
  percelen.ts              Gevelstroken en percelen (zonering zonder gaten)
  begroting.ts             Gemeentebegroting (woonlasten, OZB, Gemeentefonds, voorzieningen, wegen)
  economie.ts              Grondstofgebieden, winningsbedrijven en productieketens
  bomen.ts                 Natuurbomen per vak
  gereedschap.ts           Wegen tekenen, zoneren, slopen, opwaarderen (abstracte invoer)
  demo.ts                  Voorbeeldstad
  geom/                    Meshes als pure data (MeshData: posities, normalen, uv's, indices per
                           materiaal) voor wegen, kruispunten, gebouwen, bomen, terrein
  tex/                     Procedurele texturen als RGBA-buffers (albedo, normaal, orm)
  materialen.ts            Materiaaltabel (kleur, ruwheid, metaal, textuur, meters per herhaling)
src/render/    three.js: zet MeshData/TexData/MatDef om naar beeld, camera, licht, nabewerking
src/ui/        HUD en werkbalk (HTML/CSS)
```

**Naar Unity, Godot of Unreal:** de kern is pure logica en data. Twee routes:

1. *Kern omzetten* (aanbevolen) – de kern gebruikt geen browser- of three.js-API's en geen async,
   dus omzetten naar C# (Unity, Godot) of C++ (Unreal) gaat bestand voor bestand. Daarna alleen een
   nieuwe render- en ui-laag die `MeshData`, `TexData` en `materiaal()` omzet naar engine-objecten.
   `Wereld.haalEvents()` vertelt welke wegen, kavels en gebouwen opnieuw getekend moeten worden.
2. *Kern hergebruiken* – de kern als JavaScript laten draaien (in een engine met een JS-runtime of
   als aparte simulatie die via een socket met de engine praat) en alleen de weergave vervangen.

Het opslagformaat (`Wereld.naarJson()`) is gewone JSON en dus ook engine-onafhankelijk.
Assen: X = oost, Y = omhoog, Z = zuid, eenheden in meters. Vlakken zijn tegen de klok in gewonden
(zoals glTF en three.js); Unity is linkshandig, dus daar Z spiegelen en de wikkeling omdraaien.

## Testen zonder GPU

`scripts/shot.mjs` en `scripts/speeltest.mjs` draaien het spel in headless Chromium met
software-WebGL (SwiftShader): screenshots maken en met de muis wegen tekenen en zoneren.
