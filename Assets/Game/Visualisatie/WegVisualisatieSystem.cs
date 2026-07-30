using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Visualisatie
{
    /// Bridges the pure-ECS Wegennetwerk data to something you can actually see. Deliberately a
    /// plain GameObject+MeshFilter/MeshRenderer bridge (same technique as Spike 1's roads/
    /// buildings), not native Entities Graphics rendering -- that's a meaningfully larger, less
    /// certain API surface, and Spike 1/2 already proved there's a lot of GPU/CPU headroom left
    /// before instancing-at-scale becomes necessary.
    ///
    /// Create-once, not live-synced: once a segment has a visual, this system never revisits it.
    /// Fine for this pass (nothing currently edits a WegSegment's spline after creation), but a
    /// future "player redraws a road" feature would need a dirty-tag to re-trigger this. Upgraden
    /// (WegBouwTool) uses exactly that trick: remove WegVisueelGemaakt + destroy the old
    /// GameObject, and this system picks the segment back up next frame.
    ///
    /// Stap 3 van CS1/2-parallel: naast de vlakke asfaltstrook krijgt elk segment nu ook
    /// belijning, fietspad/trottoir-kleurcontrast, tramrails+bovenleiding en een busbaan-overlay
    /// -- allemaal als kind-GameObjects onder hetzelfde WegVisueel_X-object, zodat
    /// WegBouwTool.SplitsSegmentOpPunt (dat het hele object destroyt bij een splitsing) ze
    /// automatisch meeneemt zonder zelf te hoeven weten dat ze bestaan.
    ///
    /// Stap 4: elke mesh-opbouwfunctie houdt rekening met HoogteProfielData (brug/tunnel), met een
    /// lineaire op-/afrit binnen OvergangsLengte aan beide uiteinden. Bruggen krijgen pijlers,
    /// tunnels een entree-portaal aan beide kanten. Een tunnel is hier een verzonken trace (het
    /// terrein zelf wordt niet doorboord -- dat vereist het terrein-heightmap zelf aanpassen, een
    /// aparte, grotere vervolgstap) maar functioneert al wel als ongelijkvloerse kruising.
    ///
    /// Stap 6 (bugfixes na speler-feedback):
    /// - Alle overlay-stroken (belijning/fietspad/trottoir/tramrail/busbaan) lagen ondieper
    ///   (0.015-0.02) dan de asfaltlaag zelf (0.05) en waren dus onzichtbaar -- verscholen ONDER
    ///   het ondoorzichtige wegdek. Nu allemaal boven de asfaltlaag.
    /// - Een bocht werd als losse quads per Bézier-subsegment getekend, elk met zijn eigen lokale
    ///   richting -- op de knik tussen twee subsegmenten (elke ~1/12e van de bocht) sloten de
    ///   randen niet aan, zichtbaar als stukjes terrein tussen "losse rechthoeken". Elke
    ///   strook-opbouwfunctie gebruikt nu een gedeelde rand-richting per spline-punt (gemiddelde
    ///   van de invallende en uitgaande richting), zodat de hele strook één doorlopende band is.
    public struct WegVisueelGemaakt : IComponentData { }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct WegVisualisatieSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;
            var terrain = Terrain.activeTerrain;
            var materiaal = WegVisualisatieUtility.GetOfMaakAsfaltMateriaal();

            var toTag = new NativeList<Entity>(Allocator.Temp);

            foreach (var (segment, entity) in SystemAPI.Query<RefRO<WegSegmentData>>().WithNone<WegVisueelGemaakt>().WithEntityAccess())
            {
                var spline = em.GetBuffer<WegSegmentSplinePunt>(entity);
                var lanes = em.GetBuffer<LaneBufferElement>(entity);
                float breedte = WegVisualisatieUtility.TotaalBreedte(lanes);
                var profiel = segment.ValueRO.HoogteProfiel;

                if (spline.Length >= 2 && breedte > 0f)
                {
                    Mesh mesh = WegVisualisatieUtility.BouwWegMesh(spline, breedte, terrain, profiel);
                    var go = new GameObject($"WegVisueel_{entity.Index}");
                    go.AddComponent<MeshFilter>().sharedMesh = mesh;
                    go.AddComponent<MeshRenderer>().sharedMaterial = materiaal;

                    WegVisualisatieUtility.VoegBelijningEnOverlaysToe(go.transform, spline, lanes, terrain, segment.ValueRO.HeeftBusoverlay, profiel);
                }

                toTag.Add(entity);
            }

            foreach (var e in toTag)
                em.AddComponent<WegVisueelGemaakt>(e);

            toTag.Dispose();
        }
    }

    public static class WegVisualisatieUtility
    {
        static Material _asfaltMateriaal;
        static Material _markeringMateriaal;
        static Material _fietspadMateriaal;
        static Material _trottoirMateriaal;
        static Material _tramrailMateriaal;
        static Material _busbaanMateriaal;
        static Material _bovenleidingMateriaal;
        static Material _pijlerMateriaal;
        static Material _tunnelOverzichtMateriaal;

        const float BovenleidingHoogte = 5.5f;
        const float MastTussenafstand = 30f;
        const float PijlerTussenafstand = 15f;
        const float PijlerDikte = 0.6f;
        const float MinimumPijlerHoogte = 0.5f; // te dicht bij de op-/afrit -> pijler zou zinloos kort zijn
        const float TunnelPortaalWandDikte = 0.8f;
        const float TunnelPortaalWandHoogte = 3f; // hoogte van het portaal boven maaiveld
        const float TunnelPortaalMargeBreedte = 0.6f;
        const float TunnelOverzichtHoogte = 1.5f;

        // Alle overlay-stroken liggen boven de asfaltlaag (0.05) -- anders verdwijnen ze
        // (z-fighting/occlusie) onder het ondoorzichtige wegdek. Volgorde van laag naar hoog komt
        // overeen met "wat je in het echt bovenop zou zien liggen": kleur-oppervlaktes eerst,
        // rails erbovenop, verf/belijning bovenaan.
        const float AsfaltOphoging = 0.05f;
        const float OppervlakOphoging = 0.06f;   // fietspad/trottoir/busbaan
        const float RailOphoging = 0.07f;        // tramrails
        const float BelijningOphoging = 0.08f;

        public static Material GetOfMaakAsfaltMateriaal()
        {
            if (_asfaltMateriaal != null)
                return _asfaltMateriaal;

            var shader = Shader.Find("Universal Render Pipeline/Lit");
            _asfaltMateriaal = new Material(shader) { name = "Asfalt_Placeholder" };
            _asfaltMateriaal.SetColor("_BaseColor", new Color(0.22f, 0.22f, 0.23f));
            _asfaltMateriaal.SetFloat("_Smoothness", 0.25f);
            return _asfaltMateriaal;
        }

        static Material MaakPlaceholderMateriaal(Color kleur, float smoothness, string naam)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            var mat = new Material(shader) { name = naam };
            mat.SetColor("_BaseColor", kleur);
            mat.SetFloat("_Smoothness", smoothness);
            return mat;
        }

        public static Material GetOfMaakMarkeringMateriaal() =>
            _markeringMateriaal ??= MaakPlaceholderMateriaal(new Color(0.90f, 0.90f, 0.88f), 0.3f, "Markering_Placeholder");

        public static Material GetOfMaakFietspadMateriaal() =>
            _fietspadMateriaal ??= MaakPlaceholderMateriaal(new Color(0.55f, 0.17f, 0.13f), 0.2f, "Fietspad_Placeholder");

        public static Material GetOfMaakTrottoirMateriaal() =>
            _trottoirMateriaal ??= MaakPlaceholderMateriaal(new Color(0.62f, 0.60f, 0.57f), 0.2f, "Trottoir_Placeholder");

        public static Material GetOfMaakTramrailMateriaal() =>
            _tramrailMateriaal ??= MaakPlaceholderMateriaal(new Color(0.12f, 0.12f, 0.13f), 0.6f, "Tramrail_Placeholder");

        public static Material GetOfMaakBusbaanMateriaal() =>
            _busbaanMateriaal ??= MaakPlaceholderMateriaal(new Color(0.55f, 0.16f, 0.12f), 0.2f, "Busbaan_Placeholder");

        public static Material GetOfMaakBovenleidingMateriaal() =>
            _bovenleidingMateriaal ??= MaakPlaceholderMateriaal(new Color(0.25f, 0.25f, 0.26f), 0.7f, "Bovenleiding_Placeholder");

        public static Material GetOfMaakPijlerMateriaal() =>
            _pijlerMateriaal ??= MaakPlaceholderMateriaal(new Color(0.55f, 0.54f, 0.52f), 0.15f, "Brugpijler_Placeholder");

        /// Fel/opvallend en bewust NIET fotorealistisch -- dit is een UI-achtig hulpmiddel (net
        /// als CS1/2's ondergronds-overzicht), geen onderdeel van de "echte" wereld.
        public static Material GetOfMaakTunnelOverzichtMateriaal() =>
            _tunnelOverzichtMateriaal ??= MaakPlaceholderMateriaal(new Color(0.15f, 0.75f, 1f), 0.1f, "TunnelOverzicht_Placeholder");

        public static float TotaalBreedte(DynamicBuffer<LaneBufferElement> lanes)
        {
            float totaal = 0f;
            for (int i = 0; i < lanes.Length; i++)
                totaal += lanes[i].BreedteMeter;
            return totaal;
        }

        static Vector3 ToVector3(float3 p) => new Vector3(p.x, p.y, p.z);

        static float BerekenTotaleLengte(DynamicBuffer<WegSegmentSplinePunt> spline)
        {
            float totaal = 0f;
            for (int i = 0; i < spline.Length - 1; i++)
                totaal += Vector3.Distance(ToVector3(spline[i].Punt), ToVector3(spline[i + 1].Punt));
            return totaal;
        }

        /// Hoeveel van HoogteOffset op deze afstand vanaf het begin van het segment geldt: 0 aan
        /// beide uiteinden, lineair oplopend/aflopend naar 1 binnen OvergangsLengte, daartussen
        /// constant vol. Bij een segment korter dan 2x OvergangsLengte krimpt de overgang mee zodat
        /// de twee hellingen elkaar niet voorbij schieten.
        static float BerekenHoogteFactor(float afstandVanaf, float totaleLengte, float overgangsLengte)
        {
            if (totaleLengte < 0.01f) return 1f;
            float overgang = Mathf.Clamp(overgangsLengte, 0.01f, totaleLengte * 0.5f);
            float vanafStart = Mathf.Clamp01(afstandVanaf / overgang);
            float totEind = Mathf.Clamp01((totaleLengte - afstandVanaf) / overgang);
            return Mathf.Min(vanafStart, totEind);
        }

        static float BerekenProfielOffset(in HoogteProfielData profiel, float afstandVanaf, float totaleLengte)
        {
            if (profiel.Modus == HoogteProfielModus.OpMaaiveld) return 0f;
            float factor = BerekenHoogteFactor(afstandVanaf, totaleLengte, profiel.OvergangsLengte);
            float teken = profiel.Modus == HoogteProfielModus.Verhoogd ? 1f : -1f;
            return teken * profiel.HoogteOffset * factor;
        }

        static Vector3 HoogteGecorrigeerd(float3 punt, Terrain terrain, float ophoging)
        {
            var wereldPositieVoorSample = new Vector3(punt.x, 0f, punt.z);
            float hoogte = terrain != null
                ? terrain.SampleHeight(wereldPositieVoorSample) + terrain.transform.position.y
                : punt.y;
            return new Vector3(punt.x, hoogte + ophoging, punt.z);
        }

        /// Alle spline-punten omgezet naar wereldposities: terrainhoogte + vaste ophoging (tegen
        /// z-fighting tussen lagen) + het brug/tunnel-hoogteprofiel op dat punt. Eén keer per
        /// mesh-opbouw berekend en daarna hergebruikt, zodat elke laag (asfalt, belijning,
        /// tramrail, ...) exact dezelfde onderliggende punten deelt.
        static Vector3[] BerekenGecorrigeerdePunten(DynamicBuffer<WegSegmentSplinePunt> spline, Terrain terrain, float ophoging, HoogteProfielData profiel)
        {
            int n = spline.Length;
            var ruw = new Vector3[n];
            for (int i = 0; i < n; i++)
                ruw[i] = HoogteGecorrigeerd(spline[i].Punt, terrain, ophoging);

            var afstanden = new float[n];
            for (int i = 1; i < n; i++)
                afstanden[i] = afstanden[i - 1] + Vector3.Distance(ruw[i - 1], ruw[i]);
            float totaleLengte = afstanden[n - 1];

            var punten = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                float profielOffset = BerekenProfielOffset(profiel, afstanden[i], totaleLengte);
                punten[i] = ruw[i] + Vector3.up * profielOffset;
            }
            return punten;
        }

        /// Rand-richting (ongenormaliseerd, Cross(up, gemiddelde-richting) * 1) per spline-punt --
        /// op een tussenpunt het gemiddelde van de invallende en uitgaande richting, zodat twee
        /// opeenvolgende quads exact dezelfde rand delen i.p.v. elk hun eigen lokale richting te
        /// gebruiken (dat laatste gaf op elke bocht-knik een gat/overlap: de "losse rechthoeken"
        /// met stukjes terrein ertussen die zonder deze aanpak zichtbaar waren).
        static Vector3[] BerekenZijkantRichtingen(Vector3[] punten)
        {
            int n = punten.Length;
            var richtingen = new Vector3[n];
            for (int i = 0; i < n; i++)
            {
                Vector3 richting;
                if (i == 0)
                {
                    richting = (punten[1] - punten[0]).normalized;
                }
                else if (i == n - 1)
                {
                    richting = (punten[i] - punten[i - 1]).normalized;
                }
                else
                {
                    Vector3 inRichting = (punten[i] - punten[i - 1]).normalized;
                    Vector3 uitRichting = (punten[i + 1] - punten[i]).normalized;
                    Vector3 gemiddeld = inRichting + uitRichting;
                    richting = gemiddeld.sqrMagnitude > 0.0001f ? gemiddeld.normalized : inRichting;
                }
                richtingen[i] = Vector3.Cross(Vector3.up, richting);
            }
            return richtingen;
        }

        /// Doorlopende quad-strip langs een reeks punten -- gedeelde vertices op elk spline-punt
        /// (2 per punt: links/rechts), dus geen enkele naad tussen opeenvolgende subsegmenten, ook
        /// niet op een bocht. Zelfde winding als de losse-quad-versie hiervoor (front face +Y).
        static Mesh BouwStripMeshVanPunten(Vector3[] punten, float breedte, Vector3[] zijkantRichtingen)
        {
            int n = punten.Length;
            var verts = new List<Vector3>(n * 2);
            var uvs = new List<Vector2>(n * 2);

            for (int i = 0; i < n; i++)
            {
                Vector3 zijkant = zijkantRichtingen[i] * (breedte * 0.5f);
                verts.Add(punten[i] - zijkant);
                verts.Add(punten[i] + zijkant);
                float v = n > 1 ? (float)i / (n - 1) : 0f;
                uvs.Add(new Vector2(0f, v));
                uvs.Add(new Vector2(1f, v));
            }

            var tris = new List<int>((n - 1) * 6);
            for (int i = 0; i < n - 1; i++)
            {
                int baseIdx = i * 2;
                tris.Add(baseIdx); tris.Add(baseIdx + 3); tris.Add(baseIdx + 1);
                tris.Add(baseIdx); tris.Add(baseIdx + 2); tris.Add(baseIdx + 3);
            }

            var mesh = new Mesh { name = "WegStrip" };
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.SetUVs(0, uvs);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        public static Mesh BouwWegMesh(DynamicBuffer<WegSegmentSplinePunt> spline, float breedte, Terrain terrain, HoogteProfielData profiel)
        {
            var punten = BerekenGecorrigeerdePunten(spline, terrain, AsfaltOphoging, profiel);
            var zijkantRichtingen = BerekenZijkantRichtingen(punten);
            return BouwStripMeshVanPunten(punten, breedte, zijkantRichtingen);
        }

        /// Center-offset van elke lane t.o.v. de wegas, in dezelfde (ongenormaliseerde) eenheid
        /// als de rand-richting hierboven -- zo blijft een lane-overlay exact op zijn plek staan
        /// t.o.v. de basis-asfaltstrook.
        static float[] BerekenLaneCenters(DynamicBuffer<LaneBufferElement> lanes, float totaalBreedte)
        {
            var centers = new float[lanes.Length];
            float cursor = -totaalBreedte * 0.5f;
            for (int i = 0; i < lanes.Length; i++)
            {
                centers[i] = cursor + lanes[i].BreedteMeter * 0.5f;
                cursor += lanes[i].BreedteMeter;
            }
            return centers;
        }

        /// Doorlopende strook evenwijdig aan de weg-as, verschoven met `offset` t.o.v. het midden
        /// -- voor belijning, fietspad/trottoir/tramrail/busbaan-overlays. Volgt hetzelfde
        /// hoogteprofiel (brug/tunnel) als de basis-asfaltstrook en gebruikt dezelfde gedeelde
        /// rand-richting per punt, dus ook deze overlays blijven één doorlopende band op een bocht.
        public static Mesh BouwOffsetStripMesh(DynamicBuffer<WegSegmentSplinePunt> spline, float offset, float breedte, Terrain terrain, float ophoging, HoogteProfielData profiel = default)
        {
            var basispunten = BerekenGecorrigeerdePunten(spline, terrain, ophoging, profiel);
            var zijkantRichtingen = BerekenZijkantRichtingen(basispunten);

            int n = basispunten.Length;
            var punten = new Vector3[n];
            for (int i = 0; i < n; i++)
                punten[i] = basispunten[i] + zijkantRichtingen[i] * offset;

            return BouwStripMeshVanPunten(punten, breedte, zijkantRichtingen);
        }

        /// Zelfde als BouwOffsetStripMesh maar onderbroken volgens een streep-gat-patroon (voor
        /// stippellijnen tussen rijstroken in dezelfde richting). De streep-fase loopt door over
        /// spline-subsegment-grenzen heen (via `afstandInCyclus`) zodat de streping over de hele
        /// bocht/rechte weg consistent blijft, en elke streep-quad gebruikt de (lineair
        /// geïnterpoleerde) rand-richting van zijn twee eindpunten zodat ook een streep die
        /// midden op een bocht valt netjes meebuigt i.p.v. recht te blijven.
        public static Mesh BouwGestippeldeStripMesh(DynamicBuffer<WegSegmentSplinePunt> spline, float offset, float breedte, Terrain terrain, float ophoging, float streepLengte, float gatLengte, HoogteProfielData profiel = default)
        {
            var basispunten = BerekenGecorrigeerdePunten(spline, terrain, ophoging, profiel);
            var zijkantRichtingen = BerekenZijkantRichtingen(basispunten);
            int n = basispunten.Length;

            var verts = new List<Vector3>();
            var tris = new List<int>();
            var uvs = new List<Vector2>();
            float cyclus = streepLengte + gatLengte;
            float afstandInCyclus = 0f;

            for (int i = 0; i < n - 1; i++)
            {
                Vector3 a0 = basispunten[i];
                Vector3 b0 = basispunten[i + 1];
                float segLengte = Vector3.Distance(a0, b0);
                if (segLengte < 0.0001f) continue;

                float t = 0f;
                while (t < segLengte)
                {
                    float faseAfstand = afstandInCyclus % cyclus;
                    bool aan = faseAfstand < streepLengte;
                    float resterendInFase = aan ? (streepLengte - faseAfstand) : (cyclus - faseAfstand);
                    float stap = Mathf.Min(resterendInFase, segLengte - t);

                    if (aan && stap > 0.001f)
                    {
                        float f0 = t / segLengte;
                        float f1 = (t + stap) / segLengte;
                        Vector3 rz0 = Vector3.Lerp(zijkantRichtingen[i], zijkantRichtingen[i + 1], f0);
                        Vector3 rz1 = Vector3.Lerp(zijkantRichtingen[i], zijkantRichtingen[i + 1], f1);
                        Vector3 p0 = Vector3.Lerp(a0, b0, f0) + rz0 * offset;
                        Vector3 p1 = Vector3.Lerp(a0, b0, f1) + rz1 * offset;
                        Vector3 zijkant0 = rz0 * (breedte * 0.5f);
                        Vector3 zijkant1 = rz1 * (breedte * 0.5f);

                        int baseIdx = verts.Count;
                        verts.Add(p0 - zijkant0);
                        verts.Add(p0 + zijkant0);
                        verts.Add(p1 + zijkant1);
                        verts.Add(p1 - zijkant1);
                        uvs.Add(new Vector2(0, 0));
                        uvs.Add(new Vector2(1, 0));
                        uvs.Add(new Vector2(1, 1));
                        uvs.Add(new Vector2(0, 1));

                        tris.Add(baseIdx); tris.Add(baseIdx + 2); tris.Add(baseIdx + 1);
                        tris.Add(baseIdx); tris.Add(baseIdx + 3); tris.Add(baseIdx + 2);
                    }

                    t += stap;
                    afstandInCyclus += stap;
                }
            }

            var mesh = new Mesh { name = "WegGestippeldeStrip" };
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.SetUVs(0, uvs);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static bool IsRijbaanAchtig(LaneType t) => t == LaneType.Autorijbaan || t == LaneType.GedeeldeBaan;

        static GameObject MaakVisueelKind(Transform parent, string naam, Mesh mesh, Material materiaal)
        {
            var go = new GameObject(naam);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = materiaal;
            return go;
        }

        /// Voegt per-lane kleurcontrast (fietspad/trottoir), belijning tussen rijstroken,
        /// tramrails+bovenleiding, een busbaan-overlay, (bij Verhoogd) brugpijlers en (bij Tunnel)
        /// entree-portalen + een verborgen overzicht-strook toe als kind-objecten van het
        /// basis-asfalt-GameObject.
        public static void VoegBelijningEnOverlaysToe(Transform parent, DynamicBuffer<WegSegmentSplinePunt> spline, DynamicBuffer<LaneBufferElement> lanes, Terrain terrain, bool heeftBusoverlay, HoogteProfielData profiel)
        {
            if (lanes.Length == 0) return;

            float totaalBreedte = TotaalBreedte(lanes);
            var centers = BerekenLaneCenters(lanes, totaalBreedte);

            for (int i = 0; i < lanes.Length; i++)
            {
                var lane = lanes[i];
                switch (lane.Type)
                {
                    case LaneType.Fietspad:
                        MaakVisueelKind(parent, "Fietspad", BouwOffsetStripMesh(spline, centers[i], lane.BreedteMeter, terrain, OppervlakOphoging, profiel), GetOfMaakFietspadMateriaal());
                        break;
                    case LaneType.Trottoir:
                        MaakVisueelKind(parent, "Trottoir", BouwOffsetStripMesh(spline, centers[i], lane.BreedteMeter, terrain, OppervlakOphoging, profiel), GetOfMaakTrottoirMateriaal());
                        break;
                    case LaneType.Tramrail:
                        MaakTramrails(parent, spline, centers[i], terrain, profiel);
                        break;
                    case LaneType.Autorijbaan:
                        // Vereenvoudiging: de busbaan-overlay kleurt beide rijrichtingen i.p.v.
                        // enkel de kant met de daadwerkelijke buslijn -- het datamodel houdt nog
                        // niet bij welke specifieke lane de buslijn gebruikt (zie WegTypeCatalogus:
                        // "geen aparte lane nodig, wel een vlag"), dus dit is het dichtstbijzijnde
                        // zichtbare signaal zonder dat datamodel uit te breiden.
                        if (heeftBusoverlay)
                            MaakVisueelKind(parent, "Busbaan", BouwOffsetStripMesh(spline, centers[i], lane.BreedteMeter, terrain, OppervlakOphoging, profiel), GetOfMaakBusbaanMateriaal());
                        break;
                }

                if (i < lanes.Length - 1)
                {
                    var volgende = lanes[i + 1];
                    if (IsRijbaanAchtig(lane.Type) && IsRijbaanAchtig(volgende.Type))
                    {
                        float grensOffset = centers[i] + lane.BreedteMeter * 0.5f;
                        bool tegengesteldeRichting = lane.Richting != volgende.Richting
                            && lane.Richting != LaneRichting.Tweerichting
                            && volgende.Richting != LaneRichting.Tweerichting;

                        Mesh lijnMesh = tegengesteldeRichting
                            ? BouwOffsetStripMesh(spline, grensOffset, 0.15f, terrain, BelijningOphoging, profiel)
                            : BouwGestippeldeStripMesh(spline, grensOffset, 0.15f, terrain, BelijningOphoging, 3f, 3f, profiel);

                        MaakVisueelKind(parent, "Belijning", lijnMesh, GetOfMaakMarkeringMateriaal());
                    }
                }
            }

            float tramCenterSom = 0f;
            int tramCount = 0;
            for (int i = 0; i < lanes.Length; i++)
            {
                if (lanes[i].Type == LaneType.Tramrail)
                {
                    tramCenterSom += centers[i];
                    tramCount++;
                }
            }

            if (tramCount > 0)
                MaakBovenleiding(parent, spline, tramCenterSom / tramCount, terrain, profiel);

            if (profiel.Modus == HoogteProfielModus.Verhoogd)
                MaakBrugPijlers(parent, spline, terrain, profiel);

            if (profiel.Modus == HoogteProfielModus.Tunnel)
            {
                MaakTunnelPortalen(parent, spline, totaalBreedte, terrain, profiel);

                // Aparte "layover"-strook op vaste hoogte boven maaiveld (dus NIET verzonken zoals
                // de weg zelf) zodat de speler kan zien waar een tunnel loopt zonder erdoorheen te
                // hoeven kijken. Staat standaard uit; WegBouwTool zet 'm actief via een toggle
                // (net als CS1/2's ondergronds-overzicht).
                Mesh overzichtMesh = BouwOffsetStripMesh(spline, 0f, totaalBreedte + 1f, terrain, TunnelOverzichtHoogte);
                var overzichtGo = MaakVisueelKind(parent, "TunnelOverzicht", overzichtMesh, GetOfMaakTunnelOverzichtMateriaal());
                overzichtGo.SetActive(false);
            }
        }

        /// Twee dunne railstroken op standaard spoorwijdte (1.435m) binnen de tramrail-laan.
        static void MaakTramrails(Transform parent, DynamicBuffer<WegSegmentSplinePunt> spline, float laneCenterOffset, Terrain terrain, HoogteProfielData profiel)
        {
            const float spoorwijdte = 1.435f;
            const float railBreedte = 0.12f;
            Mesh railA = BouwOffsetStripMesh(spline, laneCenterOffset - spoorwijdte * 0.5f, railBreedte, terrain, RailOphoging, profiel);
            Mesh railB = BouwOffsetStripMesh(spline, laneCenterOffset + spoorwijdte * 0.5f, railBreedte, terrain, RailOphoging, profiel);
            MaakVisueelKind(parent, "Tramrail_A", railA, GetOfMaakTramrailMateriaal());
            MaakVisueelKind(parent, "Tramrail_B", railB, GetOfMaakTramrailMateriaal());
        }

        /// Bovenleiding: een doorlopende draad-mesh op mastdiepte plus masten op vaste
        /// tussenafstand. Vereenvoudiging t.o.v. echte bovenleiding (geen zigzag, geen
        /// afzonderlijke draagkabel/rijdraad) -- voldoende om "een tramlijn hoort de benodigde
        /// rails en bovenleiding te hebben" zichtbaar te maken zonder een aparte spike.
        static void MaakBovenleiding(Transform parent, DynamicBuffer<WegSegmentSplinePunt> spline, float laneCenterOffset, Terrain terrain, HoogteProfielData profiel)
        {
            Mesh draad = BouwOffsetStripMesh(spline, laneCenterOffset, 0.05f, terrain, BovenleidingHoogte, profiel);
            MaakVisueelKind(parent, "Bovenleiding_Draad", draad, GetOfMaakBovenleidingMateriaal());

            var masten = PuntenOpAfstand(spline, MastTussenafstand, terrain);
            float totaleLengte = BerekenTotaleLengte(spline);
            foreach (var (grondPositie, dir, afstand) in masten)
            {
                // Mastbasis op het wegdek zelf (grondpositie + hetzelfde brug/tunnel-offset als de
                // draad op datzelfde punt), zodat de mast altijd exact BovenleidingHoogte onder de
                // draad eindigt -- ook midden op een brug of in een tunnel-afrit.
                float profielOffset = BerekenProfielOffset(profiel, afstand, totaleLengte);
                Vector3 zijkant = Vector3.Cross(Vector3.up, dir);
                Vector3 wegOppervlak = grondPositie + Vector3.up * profielOffset;
                Vector3 mastBasis = wegOppervlak + zijkant * (laneCenterOffset + 0.4f); // net naast de rail, niet erop

                var mast = new GameObject("Bovenleidingmast");
                mast.transform.SetParent(parent, false);
                mast.transform.position = mastBasis + Vector3.up * (BovenleidingHoogte * 0.5f);
                // Unity's ingebouwde cilinder is 2 lokale eenheden hoog (van -1 tot +1) -- schaal
                // de Y-as dus op de helft van de gewenste hoogte, niet op de hoogte zelf.
                mast.transform.localScale = new Vector3(0.15f, BovenleidingHoogte * 0.5f, 0.15f);
                mast.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Cylinder.fbx");
                mast.AddComponent<MeshRenderer>().sharedMaterial = GetOfMaakBovenleidingMateriaal();
            }
        }

        /// Pijlers vanaf maaiveld tot aan de onderkant van het brugdek, op vaste tussenafstand.
        /// Vlak bij de op-/afrit (waar het dek nog nauwelijks boven het maaiveld uitkomt) wordt
        /// geen pijler geplaatst -- die zou toch geen zichtbare hoogte hebben.
        static void MaakBrugPijlers(Transform parent, DynamicBuffer<WegSegmentSplinePunt> spline, Terrain terrain, HoogteProfielData profiel)
        {
            float totaleLengte = BerekenTotaleLengte(spline);
            if (totaleLengte < 0.01f) return;

            var materiaal = GetOfMaakPijlerMateriaal();
            var punten = PuntenOpAfstand(spline, PijlerTussenafstand, terrain);

            foreach (var (grondPositie, _, afstand) in punten)
            {
                float dekHoogte = BerekenProfielOffset(profiel, afstand, totaleLengte);
                if (dekHoogte < MinimumPijlerHoogte) continue;

                var pijler = new GameObject("Brugpijler");
                pijler.transform.SetParent(parent, false);
                pijler.transform.position = grondPositie + Vector3.up * (dekHoogte * 0.5f);
                pijler.transform.localScale = new Vector3(PijlerDikte, dekHoogte * 0.5f, PijlerDikte);
                pijler.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Cylinder.fbx");
                pijler.AddComponent<MeshRenderer>().sharedMaterial = materiaal;
            }
        }

        /// Vindt de positie/richting op een specifieke boog-afstand vanaf het begin van de spline
        /// -- i.p.v. PuntenOpAfstand's vaste tussenafstand, hier één willekeurig punt (voor
        /// portaalplaatsing op exact OvergangsLengte vanaf elk uiteinde).
        static bool PuntOpAfstandVanBegin(DynamicBuffer<WegSegmentSplinePunt> spline, float doelAfstand, Terrain terrain, out Vector3 grondPositie, out Vector3 dir)
        {
            grondPositie = default;
            dir = Vector3.forward;
            if (spline.Length < 2) return false;

            float afgelegd = 0f;
            for (int i = 0; i < spline.Length - 1; i++)
            {
                Vector3 a = HoogteGecorrigeerd(spline[i].Punt, terrain, 0f);
                Vector3 b = HoogteGecorrigeerd(spline[i + 1].Punt, terrain, 0f);
                float segLengte = Vector3.Distance(a, b);
                if (segLengte < 0.0001f) continue;

                bool laatsteSegment = i == spline.Length - 2;
                if (afgelegd + segLengte >= doelAfstand || laatsteSegment)
                {
                    float t = Mathf.Clamp01((doelAfstand - afgelegd) / segLengte);
                    grondPositie = Vector3.Lerp(a, b, t);
                    dir = (b - a) / segLengte;
                    return true;
                }
                afgelegd += segLengte;
            }
            return false;
        }

        /// Entree-portaal (twee wanden + latei) op de plek waar het wegdek zijn volle
        /// tunneldiepte bereikt -- dat is waar de "open bak" van de op-/afrit overgaat in de
        /// (hier nog niet gemodelleerde) volledig overdekte tunnel, dus daar hoort de poort.
        static void MaakTunnelPortalen(Transform parent, DynamicBuffer<WegSegmentSplinePunt> spline, float totaalBreedte, Terrain terrain, HoogteProfielData profiel)
        {
            float totaleLengte = BerekenTotaleLengte(spline);
            if (totaleLengte < 0.01f) return;

            float overgang = Mathf.Clamp(profiel.OvergangsLengte, 0.01f, totaleLengte * 0.5f);
            MaakEenTunnelPortaal(parent, spline, overgang, totaalBreedte, totaleLengte, terrain, profiel);
            if (totaleLengte - overgang > overgang + 0.01f) // voorkom een dubbel portaal op exact dezelfde plek bij een kort segment
                MaakEenTunnelPortaal(parent, spline, totaleLengte - overgang, totaalBreedte, totaleLengte, terrain, profiel);
        }

        static void MaakEenTunnelPortaal(Transform parent, DynamicBuffer<WegSegmentSplinePunt> spline, float afstand, float totaalBreedte, float totaleLengte, Terrain terrain, HoogteProfielData profiel)
        {
            if (!PuntOpAfstandVanBegin(spline, afstand, terrain, out Vector3 grondPositie, out Vector3 dir)) return;

            float dekOffset = BerekenProfielOffset(profiel, afstand, totaleLengte); // negatief (tunnel ligt onder maaiveld)
            Vector3 zijkantEenheid = Vector3.Cross(Vector3.up, dir);
            float halveBreedte = totaalBreedte * 0.5f + TunnelPortaalMargeBreedte;
            var materiaal = GetOfMaakPijlerMateriaal();

            foreach (float teken in new[] { -1f, 1f })
            {
                Vector3 wandGrond = grondPositie + zijkantEenheid * (halveBreedte * teken);
                float wandHoogte = TunnelPortaalWandHoogte - dekOffset; // dekOffset is negatief -> wand wordt langer

                var wand = new GameObject("TunnelPortaalWand");
                wand.transform.SetParent(parent, false);
                wand.transform.position = wandGrond + Vector3.up * (dekOffset + wandHoogte * 0.5f);
                wand.transform.localScale = new Vector3(TunnelPortaalWandDikte, wandHoogte, TunnelPortaalWandDikte);
                wand.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
                wand.AddComponent<MeshRenderer>().sharedMaterial = materiaal;
            }

            var latei = new GameObject("TunnelPortaalLatei");
            latei.transform.SetParent(parent, false);
            latei.transform.position = grondPositie + Vector3.up * TunnelPortaalWandHoogte;
            latei.transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
            latei.transform.localScale = new Vector3(halveBreedte * 2f + TunnelPortaalWandDikte, TunnelPortaalWandDikte, TunnelPortaalWandDikte);
            latei.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            latei.AddComponent<MeshRenderer>().sharedMaterial = materiaal;
        }

        /// Bemonstert de spline op vaste boog-afstand (i.p.v. per spline-subsegment, waarvan de
        /// lengte varieert) -- voor mast-/pijlerplaatsing. Retourneert (grondpositie, richting,
        /// afstand-vanaf-segmentbegin) per sample; de afstand is nodig om op diezelfde plek het
        /// hoogteprofiel (brug/tunnel-offset) te kunnen berekenen.
        static List<(Vector3 pos, Vector3 dir, float afstand)> PuntenOpAfstand(DynamicBuffer<WegSegmentSplinePunt> spline, float interval, Terrain terrain)
        {
            var resultaat = new List<(Vector3, Vector3, float)>();
            if (spline.Length < 2 || interval <= 0.01f) return resultaat;

            float volgendeMastBij = interval * 0.5f;
            float afgelegd = 0f;

            for (int i = 0; i < spline.Length - 1; i++)
            {
                Vector3 a = HoogteGecorrigeerd(spline[i].Punt, terrain, 0f);
                Vector3 b = HoogteGecorrigeerd(spline[i + 1].Punt, terrain, 0f);
                float segLengte = Vector3.Distance(a, b);
                if (segLengte < 0.0001f) continue;
                Vector3 dir = (b - a) / segLengte;

                while (afgelegd + segLengte >= volgendeMastBij)
                {
                    float tBinnenSegment = volgendeMastBij - afgelegd;
                    resultaat.Add((a + dir * tBinnenSegment, dir, volgendeMastBij));
                    volgendeMastBij += interval;
                }

                afgelegd += segLengte;
            }

            return resultaat;
        }
    }
}
