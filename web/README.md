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
- Vloeiend rijden: een auto wordt getekend tussen een voor- en achterpunt die over de overgangen heen kijken (vorige strook, verbinding op het kruispunt, volgende strook); bij een strookwissel schuift hij precies de echte zijwaartse afstand. `scripts/test/vloeiend.ts` meet sprongen en draaiing per stap.
- `geom/autos.ts`: procedurele voertuigen (hatchback, sedan, stationwagen, SUV, bestelbus, vrachtwagen, bus) met lak per voertuig, glas, wielkasten, lampen, kentekens en remlichten; een eenvoudige versie voor op afstand.

## Wegen bouwen en zoneren zoals Cities: Skylines

- **Wegen** (`core/gereedschap.ts`): recht, bocht, vrij en **raster** (klik 1 = hoek, klik 2 = richting en lengte, klik 3 = diepte; bouwblokken van 2×30 bij 2×45 m). **Parallel** (P) legt een tweede weg evenwijdig rechts ervan op bouwblokafstand. De spookweg toont lengte, kosten, hoek en helling.
- **Opwaarderen** en **slopen** werken ook slepend: alles waar je overheen sleept, gaat mee. Rechts klikken bij opwaarderen draait de rijrichting om (eenrichtingsstraat).
- **Kruispunten** (`core/geom/wegmesh.ts`): fietspaden en bermen lopen in rood asfalt om de hoek, rode fietsoversteken met blokmarkering, zebrapaden, stopstrepen bij verkeerslichten, haaientanden voor de weg die voorrang moet geven, voorsorteerpijlen bij twee of meer stroken, pijlen op eenrichtingsstraten.
- **Zoneren**: vullen (een heel bouwblok in één klik), selectie (een rechthoek die met de weg meedraait) en penseel klein/groot. Rechts klikken haalt de zone weg met hetzelfde gereedschap. De kavels die veranderen, lichten op in de kleur van de zone.

## Verkeersgereedschap (ingebouwde TM:PE)

`core/verkeer/regels.ts` (data), `core/verkeer/tmpe.ts` (hulpfuncties), `render/verkeerslaag.ts` (klikbare iconen). Toets **T**.

- **Voorrangsborden** per wegeinde: geen → voorrangsweg → voorrang verlenen → stop (rechts klikken = weg). Voertuigen houden zich eraan; bij een stopbord staat iedereen eerst stil. Haaientanden en stopstrepen op het wegdek volgen de borden.
- **Voorrangsweg**: klik op een weg en de hele doorgaande weg krijgt voorrang, zijwegen voorrang verlenen of stop; lichten op die kruispunten gaan uit.
- **Verkeerslichten** per kruispunt aan of uit (rechts klikken = automatisch), groentijd met − en +.
- **Rijstrookpijlen** per strook (links, rechtdoor, rechts, keren), ↺ = standaard. De rijstrookgraaf en de pijlen op het wegdek passen zich aan, en de routeplanner rijdt alleen nog toegestane bewegingen.
- **Kruispuntregels** per wegeinde: keren, van strook wisselen op het kruispunt, het kruispunt op rijden als het vol staat, oversteekplaats voor voetgangers (zonder: geen zebrapad), rechtsaf door rood.
- **Maximumsnelheid** en **verboden** (auto's, vrachtverkeer, bussen) per weg, klikken of slepen. Routes houden rekening met beide.
- **Verkeer wissen** en **Vastgelopen verdwijnen** aan/uit.
- Regels worden opgeslagen met de stad en gaan mee als een weg wordt gesplitst. Test: `scripts/test/tmpe.ts`.

## Verplaatsen (ingebouwde Move It)

`core/verplaats.ts`, toets **M**. Werkt op knopen, wegen, gebouwen, voorzieningen en bomen (filters in de werkbalk).

- Kiezen: klikken, Shift = erbij/eraf (of de knop *Meerdere*), slepen over de grond = rechthoek. Rechts klikken of Esc = selectie leeg.
- Slepen = verplaatsen (met spooklijnen en afstand), pijltjes = 1 m (Shift 8 m) ten opzichte van de camera, Q/E = draaien 15° (Shift 1°), PgUp/PgDn = 1 m hoger/lager (Shift 4 m).
- Eén weg gekozen: sleep de gele greep halverwege om hem te buigen. *Rechttrekken*, *Hoogte gelijk* (alle knopen op dezelfde hoogte).
- Ctrl+C / Ctrl+V: kopiëren en plakken (het klembord hangt aan de muis, Q/E draait het), Delete = verwijderen.
- Ctrl+Z / Ctrl+Y: ongedaan maken en opnieuw (60 stappen). Ook gebouwen die verdwenen omdat je een weg verlegde, komen terug.
- Op een aanraakscherm: tik om te kiezen, sleep een gekozen ding om het te verplaatsen; elders schuift de kaart.
- Test: `scripts/test/verplaats.ts`.

## Leven op straat

`core/straatleven.ts` + `render/straatleven.ts`: voetgangers op de stoepen en fietsers op de fietspaden, alleen ingezoomd en rond het kijkpunt (110/200/320 per kwaliteitsniveau, 's nachts minder). Ze lopen om de hoek naar de volgende straat zonder te verspringen. Puur beeld, vier draw calls, ongeveer 0,1 ms per beeld.

## Nutsvoorzieningen

`src/core/voorzieningen.ts`: stroom, drinkwater, riolering en afval zoals in Cities: Skylines 2 (leidingen en kabels lopen langs de wegen). Voorzieningen (windturbine, zonnepark, gascentrale, pompstation, rioolwaterzuivering, stortplaats, afvalenergiecentrale) leveren aan alle gebouwen die via het wegennet verbonden zijn. Per netwerk productie tegen verbruik (Nederlandse kengetallen); met een buitenaansluiting wordt een tekort duur ingekocht. Zonder voorziening lopen gebouwen leeg, daalt de vraag en de tevredenheid en verschijnen er meldingen boven de gebouwen. Een nieuwe kaart begint met een snelweg vanaf de rand (de buitenaansluiting).

## Hulpdiensten

`src/core/hulpdiensten.ts`: brandweer, politie, ziekenhuis en gezondheidscentrum. Dekking wordt berekend over de weg (Dijkstra vanaf de kazerne of het bureau, niet hemelsbreed). Zonder dekking ontstaan vaker incidenten: branden groeien tot er een brandweerwagen ter plaatse is, misdaad verdwijnt als de politie niet op tijd komt, zieken gaan met de ambulance naar het ziekenhuis. Voertuigen rijden met sirene door het gewone verkeer en mogen door rood.

## Grondwaarde en gebouwniveaus

`src/core/waarde.ts`: grondwaarde per gebouw uit dekking, nutsvoorzieningen, winkels op loopafstand, water in de buurt, vervuiling en verkeerslawaai. Volle gebouwen met genoeg grondwaarde (voor niveau 3-4 ook brandweer, zorg en politie) knappen op tot niveau 5: meer OZB, zonnepanelen en groene daken. Zonder voorzieningen verloederen ze weer.

## Bouwstijlen, districten en opwaarderen

- `src/core/stijlen.ts`: vijf bouwstijlen (jaren dertig, grachtengordel, naoorlogs, jaren zeventig, nieuwbouw) met per zone en niveau een eigen gebouwtype, hoogte en gevel: rijtjes met erkers, grachtenpanden met trap-, hals- en klokgevels, pakhuizen, naoorlogse rijtjes met luifels, portiek- en galerijflats, wederopbouwwinkels, sheddaken, bloemkoolwoningen met steile kappen, terrasflats, nieuwbouw met hout en glazen balkons, vrijstaande villa's en woontorens op niveau 5, kantoortorens met sokkel en kroon. Zonder voorschrift kiest de ontwikkelaar; hogere niveaus worden vaker nieuwbouw.
- `src/core/districten.ts`: districten schilderen (K), met een naam, een optionele bouwstijl en regels: hoogtegrens (max 6 of 3 lagen), eigen belasting voor wonen en bedrijven (-20% tot +20%: lager = snellere groei, hoger = meer inkomsten en lagere grondwaarde), beschermd stadsgezicht, groene daken en verplichte zonnepanelen (kosten subsidie, panelen geven een derde minder stroomverbruik). Panden die niet bij de stijl van het district passen, worden geleidelijk verbouwd.
- Hoogte: per buurpand hooguit 2 lagen hoger plus 1 laag per 12 m afstand, zodat de skyline geleidelijk oploopt.
- Opwaarderen zoals in CS2: een pand dat een niveau stijgt gaat in de steigers (bewoners blijven) en komt terug als ontwerp van het nieuwe niveau, vaak hoger en in een nieuwere stijl.
- Meshes van de nieuwe types: `src/core/geom/stijlmesh.ts`.

## Dag en nacht en prestaties

- `src/render/dagnacht.ts`: zon van oost naar west (etmaal = 12 minuten), warm licht bij opkomst en ondergang, maanlicht; 's nachts verlichte ramen (per raamvak aan/uit), etalages, lantaarns met lichtvlekken (`render/licht.ts`) en koplampbundels. Aan/uit in het instellingenmenu.
- Detailniveaus: vakken van 256 m dichtbij, blokken van 512 m veraf met vereenvoudigde gebouwen en één textuurreeks (`core/geom/lod.ts`); samenvoegen in een Web Worker (`render/tegelworker.ts`); per vak één schaduwvervanger; grondwaarde verdeeld over de beelden.

## Info en opslaan

- Kijken (Esc) en klik op een gebouw of voorziening: infopaneel met adres, bewoners/banen, grondwaarde met factoren, wat er nodig is voor het volgende niveau, voorzieningen en dekking.
- Infoknoppen linksboven: kleurlagen voor verkeer, stroom, water, afval, brandweer, politie, zorg, grondwaarde en niveau.
- De stad wordt elke 2 minuten en bij het wegklikken van het tabblad in de browser opgeslagen (IndexedDB met gzip; `src/opslag.ts`, data uit `Wereld.naarJson()`). Bij het openen kies je Doorgaan, Nieuwe stad of Voorbeeldstad; via het Stad-menu kun je ook meteen opslaan.

## Besturing

| Toets / muis | Functie |
|---|---|
| T / M | Verkeersgereedschap (TM:PE) / Verplaatsen (Move It) |
| X / Z / K / G / N / U / B / Esc | Wegen / Zones / Districten / Economie (gebieden: eerst naast een weg klikken voor het hoofdgebouw, dan de hoekpunten) / Voorzieningen (stroom, water, afval, hulpdiensten) / Opwaarderen / Slopen / Kijken |
| 1–9 | Wegtype of zonetype |
| C | Tekenstijl wisselen: recht, bocht, vrij (vrij = altijd vloeiend doorlopend), raster |
| P | Parallel bouwen: uit, 2×30 m, 2×50 m |
| PgUp / PgDn | Hoogte van de weg in stappen van 4 m: viaduct (omhoog) of tunnel (omlaag); wegen op verschillende hoogte kruisen zonder kruispunt |
| H | Hulplijnen en snappen aan/uit (verlengden, haakse lijnen, evenwijdig op blokafstand van 2×25 of 2×50 m) |
| Linkerklik | Beginpunt, (bochtpunt), eindpunt; zones: vullen, rechthoek slepen of penseel; slopen/opwaarderen: klikken of slepen |
| Rechterklik | Stoppen met tekenen; zones: weghalen; opwaarderen: rijrichting omdraaien |
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
