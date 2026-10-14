using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Wegennetwerk;
using CityBuilder.Game.Ontwikkeling;
using CityBuilder.Game.Stad;
using CityBuilder.Game.Visualisatie;

namespace CityBuilder.Game.SpelerTools
{
    /// De bouwtool van de speler, ingedeeld zoals de werkbalk van Cities: Skylines:
    /// - Wegen: recht of in een bocht tekenen, snappen op knopen en wegen (met splitsing), hoogte
    ///   met PageUp/PageDown (positief = brug, negatief = tunnel).
    /// - Zones: met een penseel over kavels slepen om ze in te kleuren (wonen laag/hoog, gemengd,
    ///   kantoor, industrie). Gezoneerde kavels gaan vanzelf bouwen als er vraag naar is.
    /// - Upgraden: klik op een weg om hem naar het gekozen wegtype om te bouwen.
    /// Nieuwe wegen met erftoegang krijgen kavels; kavels die door een nieuwe weg doorsneden
    /// worden, verdwijnen (KavelOpruimUtility).
    [AddComponentMenu("City Builder/Weg Bouw Tool")]
    public class WegBouwTool : MonoBehaviour
    {
        public float nodeSnapAfstand = 8f;
        public float segmentSnapAfstand = 5f;
        public float minimumSegmentLengte = 5f;
        const int kBochtSamples = 12;

        enum Tab { Wegen, Zones, Upgraden }
        enum TekenModus { Recht, Bocht }
        enum TekenFase { Geen, WachtOpEindpunt, WachtOpBuiging }

        const float UpgradeSelectieAfstand = 6f;
        const int HoogteNiveauMin = -2;
        const int HoogteNiveauMax = 2;
        const float HoogteStapMeter = 4f;
        const float StandaardOvergangsLengte = 22f;

        const float PaneelBreedte = 940f;
        const float PaneelHoogte = 150f;

        static readonly WegTypeId[] kBeschikbareTypes =
        {
            WegTypeId.Woonstraat, WegTypeId.Straat, WegTypeId.StraatMetBus, WegTypeId.Avenue,
            WegTypeId.Tramstraat, WegTypeId.Gebiedsontsluitingsweg, WegTypeId.Snelweg,
            WegTypeId.Fietspad, WegTypeId.Voetpad,
        };

        static readonly string[] kTypeNamen =
        {
            "Woonstraat", "Straat", "Straat + bus", "Stadslaan", "Tramstraat", "70-weg", "Snelweg", "Fietspad", "Voetpad",
        };

        static readonly ZoneType[] kZones =
        {
            ZoneType.WonenLaag, ZoneType.WonenHoog, ZoneType.Gemengd, ZoneType.Kantoor, ZoneType.Industrie, ZoneType.Geen,
        };

        static readonly string[] kZoneNamen =
        {
            "Wonen laag", "Wonen hoog", "Winkels + wonen", "Kantoren", "Industrie", "Wissen",
        };

        KavelGeneratieRegel _kavelRegel = new KavelGeneratieRegel { MaxDiepteVanafWeggrens = 42f, MinFrontbreedte = 20f };

        Tab _tab = Tab.Wegen;
        WegTypeId _actiefType = WegTypeId.Straat;
        TekenModus _modus = TekenModus.Recht;
        int _hoogteNiveau;
        bool _toonTunnelOverzicht;
        ZoneType _zone = ZoneType.WonenLaag;
        float _penseel = 16f;
        float _volgendeVerf;

        bool _bezigMetTekenen;
        Vector3 _startPunt;
        TekenFase _fase = TekenFase.Geen;
        Vector3 _p0, _p2;

        LineRenderer _preview;
        LineRenderer _penseelCirkel;
        Camera _camera;
        string _laatsteMelding = "";

        void Awake()
        {
            _camera = Camera.main;
            _preview = MaakLijn("WegBouwPreview", new Color(1f, 0.92f, 0.2f, 0.85f), 2f);
            _penseelCirkel = MaakLijn("ZonePenseel", new Color(1f, 1f, 1f, 0.85f), 0.6f);
            _penseelCirkel.loop = true;
        }

        LineRenderer MaakLijn(string naam, Color kleur, float breedte)
        {
            var go = new GameObject(naam);
            go.transform.SetParent(transform, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = 2;
            lr.startWidth = breedte;
            lr.endWidth = breedte;
            lr.material = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            lr.material.SetColor("_BaseColor", kleur);
            lr.startColor = kleur;
            lr.endColor = kleur;
            lr.useWorldSpace = true;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lr.enabled = false;
            return lr;
        }

        static EntityManager EM => World.DefaultGameObjectInjectionWorld.EntityManager;

        // ═══════ INVOER ═══════

        void Update()
        {
            if (World.DefaultGameObjectInjectionWorld == null)
                return;

            HandleSneltoetsen();
            ZoneWeergave.OverlayZichtbaar = _tab == Tab.Zones;

            if (MuisBovenUI() || !RaycastNaarTerrein(out Vector3 hitPunt))
            {
                _preview.enabled = _bezigMetTekenen || _fase != TekenFase.Geen ? _preview.enabled : false;
                _penseelCirkel.enabled = false;
                return;
            }

            switch (_tab)
            {
                case Tab.Zones:
                    _preview.enabled = false;
                    UpdateZones(hitPunt);
                    break;
                case Tab.Upgraden:
                    _penseelCirkel.enabled = false;
                    UpdateUpgradeModus(hitPunt);
                    break;
                default:
                    _penseelCirkel.enabled = false;
                    if (_modus == TekenModus.Recht) UpdateRechteModus(hitPunt);
                    else UpdateBochtModus(hitPunt);
                    break;
            }
        }

        void HandleSneltoetsen()
        {
            if (Input.GetKeyDown(KeyCode.Z)) ZetTab(_tab == Tab.Zones ? Tab.Wegen : Tab.Zones);
            if (Input.GetKeyDown(KeyCode.U)) ZetTab(_tab == Tab.Upgraden ? Tab.Wegen : Tab.Upgraden);
            if (Input.GetKeyDown(KeyCode.O)) ZetTunnelOverzichtActief(!_toonTunnelOverzicht);

            if (_tab == Tab.Zones)
            {
                for (int i = 0; i < kZones.Length; i++)
                    if (Input.GetKeyDown(KeyCode.Alpha1 + i)) _zone = kZones[i];
                if (Input.GetKeyDown(KeyCode.Equals) || Input.GetKeyDown(KeyCode.KeypadPlus)) _penseel = Mathf.Min(60f, _penseel + 4f);
                if (Input.GetKeyDown(KeyCode.Minus) || Input.GetKeyDown(KeyCode.KeypadMinus)) _penseel = Mathf.Max(6f, _penseel - 4f);
                return;
            }

            for (int i = 0; i < kBeschikbareTypes.Length && i < 9; i++)
                if (Input.GetKeyDown(KeyCode.Alpha1 + i)) _actiefType = kBeschikbareTypes[i];

            if (_tab != Tab.Wegen)
                return;

            if (Input.GetKeyDown(KeyCode.C))
            {
                _modus = _modus == TekenModus.Recht ? TekenModus.Bocht : TekenModus.Recht;
                AnnuleerTekenen();
                _laatsteMelding = $"Modus: {(_modus == TekenModus.Recht ? "recht" : "bocht")}.";
            }
            // Geen AnnuleerTekenen() bij de hoogte: net als in CS stel je die bij tijdens het tekenen.
            if (Input.GetKeyDown(KeyCode.PageUp)) ZetHoogteNiveau(_hoogteNiveau + 1);
            if (Input.GetKeyDown(KeyCode.PageDown)) ZetHoogteNiveau(_hoogteNiveau - 1);
        }

        void ZetTab(Tab tab)
        {
            _tab = tab;
            AnnuleerTekenen();
            _laatsteMelding = tab switch
            {
                Tab.Zones => "Zones: sleep met de linkermuisknop over kavels langs een weg.",
                Tab.Upgraden => "Upgraden: klik op een weg om hem om te bouwen.",
                _ => "Wegen tekenen.",
            };
        }

        void ZetHoogteNiveau(int niveau)
        {
            _hoogteNiveau = Mathf.Clamp(niveau, HoogteNiveauMin, HoogteNiveauMax);
            _laatsteMelding = $"Hoogte: {BeschrijfHoogteNiveau(_hoogteNiveau)}.";
        }

        static string BeschrijfHoogteNiveau(int niveau)
        {
            if (niveau == 0) return "maaiveld";
            return niveau > 0 ? $"brug, {niveau * HoogteStapMeter:0} m" : $"tunnel, {-niveau * HoogteStapMeter:0} m diep";
        }

        HoogteProfielData BerekenHoogteProfiel()
        {
            if (_hoogteNiveau == 0)
                return new HoogteProfielData { Modus = HoogteProfielModus.OpMaaiveld, HoogteOffset = 0f, OvergangsLengte = 0f };
            var modus = _hoogteNiveau > 0 ? HoogteProfielModus.Verhoogd : HoogteProfielModus.Tunnel;
            return new HoogteProfielData { Modus = modus, HoogteOffset = Mathf.Abs(_hoogteNiveau) * HoogteStapMeter, OvergangsLengte = StandaardOvergangsLengte };
        }

        void AnnuleerTekenen()
        {
            _bezigMetTekenen = false;
            _fase = TekenFase.Geen;
            _preview.enabled = false;
        }

        Rect PaneelRect() => new Rect((UiSchaal.Breedte - PaneelBreedte) * 0.5f, UiSchaal.Hoogte - PaneelHoogte - 8f, PaneelBreedte, PaneelHoogte);

        bool MuisBovenUI() => PaneelRect().Contains(UiSchaal.Muis) || StadHud.MuisErboven();

        bool RaycastNaarTerrein(out Vector3 punt)
        {
            punt = default;
            if (_camera == null) _camera = Camera.main;
            if (_camera == null) return false;
            var ray = _camera.ScreenPointToRay(Input.mousePosition);
            if (Physics.Raycast(ray, out var hit, 5000f))
            {
                punt = hit.point;
                return true;
            }
            return false;
        }

        // ═══════ ZONES ═══════

        void UpdateZones(Vector3 hitPunt)
        {
            const int stappen = 48;
            _penseelCirkel.positionCount = stappen;
            for (int i = 0; i < stappen; i++)
            {
                float a = (float)i / stappen * Mathf.PI * 2f;
                var p = hitPunt + new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a)) * _penseel;
                p.y = Visualisatie.Procedureel.TerreinHoogte.Op(p.x, p.z) + 0.6f;
                _penseelCirkel.SetPosition(i, p);
            }
            _penseelCirkel.enabled = true;

            if (!Input.GetMouseButton(0) || Time.unscaledTime < _volgendeVerf)
                return;
            _volgendeVerf = Time.unscaledTime + 0.05f;

            var em = EM;
            var query = em.CreateEntityQuery(typeof(KavelCore), typeof(KavelGeometriePunt));
            var kavels = query.ToEntityArray(Allocator.Temp);
            var raak = new List<Entity>();
            var centrum = new float2(hitPunt.x, hitPunt.z);
            foreach (var kavel in kavels)
            {
                var geo = em.GetBuffer<KavelGeometriePunt>(kavel);
                if (geo.Length < 4) continue;
                float2 midden = (geo[0].Punt + geo[1].Punt + geo[2].Punt + geo[3].Punt) * 0.25f;
                if (math.distance(midden, centrum) < _penseel + 6f)
                    raak.Add(kavel);
            }
            kavels.Dispose();

            int gezet = 0;
            foreach (var kavel in raak)
                if (ZoneringUtility.ZetZone(em, kavel, _zone)) gezet++;
            if (gezet > 0)
                _laatsteMelding = _zone == ZoneType.Geen ? $"{gezet} kavels ontzoneerd." : $"{gezet} kavels gezoneerd als {kZoneNamen[System.Array.IndexOf(kZones, _zone)].ToLower()}.";
        }

        // ═══════ UPGRADEN ═══════

        void UpdateUpgradeModus(Vector3 hitPunt)
        {
            if (!Input.GetMouseButtonDown(0)) return;
            var em = EM;
            if (ZoekSegmentBijPunt(em, hitPunt, UpgradeSelectieAfstand, out Entity segment))
                UpgradeSegment(em, segment);
            else
                _laatsteMelding = "Geen weg gevonden om te upgraden.";
        }

        void UpgradeSegment(EntityManager em, Entity segment)
        {
            var data = em.GetComponentData<WegSegmentData>(segment);
            if (data.WegType == _actiefType)
            {
                _laatsteMelding = "Dit segment is al dit wegtype.";
                return;
            }

            var laneBuffer = em.GetBuffer<LaneBufferElement>(segment);
            laneBuffer.Clear();
            foreach (var spec in WegTypeCatalogus.GetLanes(_actiefType))
                laneBuffer.Add(new LaneBufferElement { Type = spec.Type, Richting = spec.Richting, BreedteMeter = spec.BreedteMeter });

            data.WegType = _actiefType;
            data.Snelheidslimiet = WegTypeCatalogus.GetSnelheidslimiet(_actiefType);
            data.HeeftBusoverlay = _actiefType == WegTypeId.StraatMetBus;
            em.SetComponentData(segment, data);

            if (!em.HasComponent<CapaciteitDirty>(segment)) em.AddComponent<CapaciteitDirty>(segment);
            WegVisueelRegister.Verwijder(segment);
            if (em.HasComponent<WegVisueelGemaakt>(segment)) em.RemoveComponent<WegVisueelGemaakt>(segment);
            // Bredere weg: aansluitende kruispunten moeten mee groeien.
            if (em.Exists(data.VanNode) && !em.HasComponent<KruispuntHerbouwNodig>(data.VanNode) && em.HasComponent<KnoopVisueelData>(data.VanNode))
                em.RemoveComponent<KnoopVisueelData>(data.VanNode);
            if (em.Exists(data.NaarNode) && !em.HasComponent<KruispuntHerbouwNodig>(data.NaarNode) && em.HasComponent<KnoopVisueelData>(data.NaarNode))
                em.RemoveComponent<KnoopVisueelData>(data.NaarNode);

            _laatsteMelding = $"Weg omgebouwd naar {Naam(_actiefType)}.";
        }

        static string Naam(WegTypeId type)
        {
            int i = System.Array.IndexOf(kBeschikbareTypes, type);
            return i >= 0 ? kTypeNamen[i] : type.ToString();
        }

        // ═══════ TUNNELOVERZICHT ═══════

        void ZetTunnelOverzichtActief(bool actief)
        {
            _toonTunnelOverzicht = actief;
            _laatsteMelding = actief ? "Tunneloverzicht aan." : "Tunneloverzicht uit.";
            foreach (var kv in WegVisueelRegister.Objecten)
            {
                if (kv.Value == null) continue;
                var overzicht = kv.Value.transform.Find("TunnelOverzicht");
                if (overzicht != null) overzicht.gameObject.SetActive(actief);
            }
        }

        // ═══════ WEGEN TEKENEN ═══════

        void UpdateRechteModus(Vector3 hitPunt)
        {
            if (Input.GetMouseButtonDown(0))
            {
                _startPunt = BerekenSnapPunt(hitPunt);
                _bezigMetTekenen = true;
                _preview.positionCount = 2;
                _preview.enabled = true;
            }
            else if (_bezigMetTekenen && Input.GetMouseButtonUp(0))
            {
                Vector3 eindPunt = BerekenSnapPunt(hitPunt);
                _bezigMetTekenen = false;
                _preview.enabled = false;
                if (Vector3.Distance(_startPunt, eindPunt) >= minimumSegmentLengte)
                    MaakRechteWegsegment(_startPunt, eindPunt);
                else
                    _laatsteMelding = "Segment te kort, geannuleerd.";
            }
            else if (_bezigMetTekenen && Input.GetMouseButtonDown(1))
            {
                AnnuleerTekenen();
                _laatsteMelding = "Tekenen geannuleerd.";
            }
            else if (_bezigMetTekenen)
            {
                Vector3 eindPunt = BerekenSnapPunt(hitPunt);
                _preview.SetPosition(0, _startPunt + Vector3.up);
                _preview.SetPosition(1, eindPunt + Vector3.up);
            }
        }

        void UpdateBochtModus(Vector3 hitPunt)
        {
            if (_fase != TekenFase.Geen && Input.GetMouseButtonDown(1))
            {
                AnnuleerTekenen();
                _laatsteMelding = "Tekenen geannuleerd.";
                return;
            }

            switch (_fase)
            {
                case TekenFase.Geen:
                    if (Input.GetMouseButtonDown(0))
                    {
                        _p0 = BerekenSnapPunt(hitPunt);
                        _fase = TekenFase.WachtOpEindpunt;
                        _preview.positionCount = 2;
                        _preview.enabled = true;
                    }
                    break;
                case TekenFase.WachtOpEindpunt:
                    _preview.positionCount = 2;
                    _preview.SetPosition(0, _p0 + Vector3.up);
                    _preview.SetPosition(1, hitPunt + Vector3.up);
                    if (Input.GetMouseButtonDown(0))
                    {
                        _p2 = BerekenSnapPunt(hitPunt);
                        _fase = TekenFase.WachtOpBuiging;
                    }
                    break;
                case TekenFase.WachtOpBuiging:
                    ToonBuigPreview(_p0, hitPunt, _p2);
                    if (Input.GetMouseButtonDown(0))
                    {
                        MaakGebogenWegsegment(_p0, hitPunt, _p2);
                        AnnuleerTekenen();
                    }
                    break;
            }
        }

        void ToonBuigPreview(Vector3 p0, Vector3 p1, Vector3 p2)
        {
            _preview.positionCount = kBochtSamples + 1;
            for (int i = 0; i <= kBochtSamples; i++)
            {
                float t = (float)i / kBochtSamples;
                _preview.SetPosition(i, BerekenKwadratischeBezier(p0, p1, p2, t) + Vector3.up);
            }
            _preview.enabled = true;
        }

        static Vector3 BerekenKwadratischeBezier(Vector3 p0, Vector3 p1, Vector3 p2, float t)
        {
            float u = 1f - t;
            return u * u * p0 + 2f * u * t * p1 + t * t * p2;
        }

        // ═══════ SNAPPEN ═══════

        Vector3 BerekenSnapPunt(Vector3 ruwPunt)
        {
            var em = EM;
            if (ZoekDichtstbijzijndeNode(em, ruwPunt, nodeSnapAfstand, out Vector3 nodePunt))
                return nodePunt;
            if (ZoekDichtstbijzijndSegmentPunt(em, ruwPunt, segmentSnapAfstand, out _, out Vector3 segmentPunt, out _))
                return segmentPunt;
            return ruwPunt;
        }

        static bool ZoekDichtstbijzijndeNode(EntityManager em, Vector3 punt, float maxAfstand, out Vector3 gevondenPositie)
        {
            var query = em.CreateEntityQuery(typeof(NetwerkNodeData));
            var nodes = query.ToComponentDataArray<NetwerkNodeData>(Allocator.Temp);
            gevondenPositie = punt;
            float besteAfstand = maxAfstand;
            bool gevonden = false;
            for (int i = 0; i < nodes.Length; i++)
            {
                var nodePos = new Vector3(nodes[i].Positie.x, nodes[i].Positie.y, nodes[i].Positie.z);
                float afstand = Vector3.Distance(punt, nodePos);
                if (afstand < besteAfstand)
                {
                    besteAfstand = afstand;
                    gevondenPositie = nodePos;
                    gevonden = true;
                }
            }
            nodes.Dispose();
            return gevonden;
        }

        static bool ZoekDichtstbijzijndSegmentPunt(EntityManager em, Vector3 punt, float maxAfstand,
            out Entity gevondenSegment, out Vector3 gevondenPunt, out float gevondenAfstand)
        {
            gevondenSegment = Entity.Null;
            gevondenPunt = punt;
            gevondenAfstand = maxAfstand;

            var query = em.CreateEntityQuery(typeof(WegSegmentData));
            var entiteiten = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entiteiten.Length; i++)
            {
                var spline = em.GetBuffer<WegSegmentSplinePunt>(entiteiten[i]);
                for (int s = 0; s < spline.Length - 1; s++)
                {
                    var a = new Vector3(spline[s].Punt.x, spline[s].Punt.y, spline[s].Punt.z);
                    var b = new Vector3(spline[s + 1].Punt.x, spline[s + 1].Punt.y, spline[s + 1].Punt.z);
                    Vector3 dichtstbij = DichtstbijzijndPuntOpLijnstuk(punt, a, b);
                    float afstand = Vector3.Distance(punt, dichtstbij);
                    // Vlak bij het eigen eindpunt snapt ZoekDichtstbijzijndeNode al; geen splitsing naast een knoop.
                    if (afstand < gevondenAfstand && Vector3.Distance(dichtstbij, a) > 1f && Vector3.Distance(dichtstbij, b) > 1f)
                    {
                        gevondenAfstand = afstand;
                        gevondenPunt = dichtstbij;
                        gevondenSegment = entiteiten[i];
                    }
                }
            }
            entiteiten.Dispose();
            return gevondenSegment != Entity.Null;
        }

        static Vector3 DichtstbijzijndPuntOpLijnstuk(Vector3 p, Vector3 a, Vector3 b)
        {
            Vector3 ab = b - a;
            float lengteKwadraat = ab.sqrMagnitude;
            if (lengteKwadraat < 0.0001f) return a;
            float t = Mathf.Clamp01(Vector3.Dot(p - a, ab) / lengteKwadraat);
            return a + ab * t;
        }

        /// Zelfde als ZoekDichtstbijzijndSegmentPunt maar zonder de eindpunt-uitsluiting: hier
        /// willen we het hele segment kunnen aanklikken, ook vlak bij zijn uiteinden.
        static bool ZoekSegmentBijPunt(EntityManager em, Vector3 punt, float maxAfstand, out Entity gevondenSegment)
        {
            gevondenSegment = Entity.Null;
            float besteAfstand = maxAfstand;
            var query = em.CreateEntityQuery(typeof(WegSegmentData));
            var entiteiten = query.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < entiteiten.Length; i++)
            {
                var spline = em.GetBuffer<WegSegmentSplinePunt>(entiteiten[i]);
                for (int s = 0; s < spline.Length - 1; s++)
                {
                    var a = new Vector3(spline[s].Punt.x, spline[s].Punt.y, spline[s].Punt.z);
                    var b = new Vector3(spline[s + 1].Punt.x, spline[s + 1].Punt.y, spline[s + 1].Punt.z);
                    float afstand = Vector3.Distance(punt, DichtstbijzijndPuntOpLijnstuk(punt, a, b));
                    if (afstand < besteAfstand)
                    {
                        besteAfstand = afstand;
                        gevondenSegment = entiteiten[i];
                    }
                }
            }
            entiteiten.Dispose();
            return gevondenSegment != Entity.Null;
        }

        // ═══════ SEGMENTEN MAKEN ═══════

        void MaakRechteWegsegment(Vector3 start, Vector3 eind)
        {
            var em = EM;
            Entity vanNode = VindOfMaakNode(em, start);
            Entity naarNode = VindOfMaakNode(em, eind);
            if (vanNode == naarNode) { _laatsteMelding = "Begin en eind vallen samen."; return; }
            var vanPos = em.GetComponentData<NetwerkNodeData>(vanNode).Positie;
            var naarPos = em.GetComponentData<NetwerkNodeData>(naarNode).Positie;
            MaakWegsegmentMetSpline(vanNode, naarNode, new List<float3> { vanPos, naarPos });
        }

        void MaakGebogenWegsegment(Vector3 p0Ruw, Vector3 p1, Vector3 p2Ruw)
        {
            var em = EM;
            Entity vanNode = VindOfMaakNode(em, p0Ruw);
            Entity naarNode = VindOfMaakNode(em, p2Ruw);
            if (vanNode == naarNode) { _laatsteMelding = "Begin en eind vallen samen."; return; }
            var vanPos = em.GetComponentData<NetwerkNodeData>(vanNode).Positie;
            var naarPos = em.GetComponentData<NetwerkNodeData>(naarNode).Positie;

            var punten = new List<float3>(kBochtSamples + 1);
            for (int i = 0; i <= kBochtSamples; i++)
            {
                float t = (float)i / kBochtSamples;
                Vector3 p = BerekenKwadratischeBezier(ToVector3(vanPos), p1, ToVector3(naarPos), t);
                punten.Add(new float3(p.x, p.y, p.z));
            }
            MaakWegsegmentMetSpline(vanNode, naarNode, punten);
        }

        void MaakWegsegmentMetSpline(Entity vanNode, Entity naarNode, List<float3> splinePunten)
        {
            var em = EM;
            Entity segment = em.CreateEntity(typeof(WegSegmentData), typeof(WegSegmentSplinePunt), typeof(LaneBufferElement), typeof(CapaciteitDirty));

            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            foreach (var p in splinePunten)
                spline.Add(new WegSegmentSplinePunt { Punt = p });

            var lanes = em.GetBuffer<LaneBufferElement>(segment);
            foreach (var spec in WegTypeCatalogus.GetLanes(_actiefType))
                lanes.Add(new LaneBufferElement { Type = spec.Type, Richting = spec.Richting, BreedteMeter = spec.BreedteMeter });

            HoogteProfielData hoogteProfiel = BerekenHoogteProfiel();
            em.SetComponentData(segment, new WegSegmentData
            {
                Id = new Unity.Entities.Hash128((uint)segment.Index, 11, 0, 0),
                WegType = _actiefType,
                VanNode = vanNode,
                NaarNode = naarNode,
                Capaciteit = 0,
                Snelheidslimiet = WegTypeCatalogus.GetSnelheidslimiet(_actiefType),
                HuidigeBelasting = 0f,
                HoogteProfiel = hoogteProfiel,
                HeeftBusoverlay = _actiefType == WegTypeId.StraatMetBus,
            });

            float lengte = 0f;
            for (int i = 0; i < splinePunten.Count - 1; i++)
                lengte += Vector3.Distance(ToVector3(splinePunten[i]), ToVector3(splinePunten[i + 1]));

            bool erf = hoogteProfiel.Modus == HoogteProfielModus.OpMaaiveld && WegTypeCatalogus.HeeftErfOntsluiting(_actiefType);
            var kavels = erf ? KavelGeneratieUtility.GenereerKavelsLangsWeg(em, segment, _kavelRegel, 0) : System.Array.Empty<Entity>();
            int opgeruimd = KavelOpruimUtility.RuimOp(em, segment, kavels);

            string hoogte = hoogteProfiel.Modus == HoogteProfielModus.OpMaaiveld ? "" : $" als {BeschrijfHoogteNiveau(_hoogteNiveau)}";
            _laatsteMelding = erf
                ? $"{Naam(_actiefType)} aangelegd ({lengte:0} m), {math.max(0, kavels.Length - CountNieuwOpgeruimd(em, kavels))} kavels erlangs."
                : $"{Naam(_actiefType)} aangelegd ({lengte:0} m){hoogte}." + (opgeruimd > 0 ? $" {opgeruimd} kavels vervallen." : "");
        }

        static int CountNieuwOpgeruimd(EntityManager em, Entity[] kavels)
        {
            int n = 0;
            foreach (var k in kavels)
                if (!em.Exists(k)) n++;
            return n;
        }

        static Vector3 ToVector3(float3 f) => new Vector3(f.x, f.y, f.z);

        Entity VindOfMaakNode(EntityManager em, Vector3 positie)
        {
            var nodeQuery = em.CreateEntityQuery(typeof(NetwerkNodeData));
            var nodeEntiteiten = nodeQuery.ToEntityArray(Allocator.Temp);
            var nodeData = nodeQuery.ToComponentDataArray<NetwerkNodeData>(Allocator.Temp);
            Entity gevonden = Entity.Null;
            for (int i = 0; i < nodeData.Length; i++)
            {
                var nodePos = new Vector3(nodeData[i].Positie.x, nodeData[i].Positie.y, nodeData[i].Positie.z);
                if (Vector3.Distance(nodePos, positie) < 0.5f)
                {
                    gevonden = nodeEntiteiten[i];
                    break;
                }
            }
            nodeEntiteiten.Dispose();
            nodeData.Dispose();

            if (gevonden != Entity.Null)
                return gevonden;

            if (ZoekDichtstbijzijndSegmentPunt(em, positie, 0.5f, out Entity teSplitsen, out Vector3 splitsPunt, out _))
                return SplitsSegmentOpPunt(em, teSplitsen, splitsPunt);

            Entity node = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(node, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = new float3(positie.x, positie.y, positie.z) });
            return node;
        }

        /// Splitst een segment op een punt: nieuwe knoop, twee nieuwe segmenten met hetzelfde
        /// wegtype/profiel. De kavels van het oude segment gaan over naar de helft waar ze aan
        /// liggen. Een bocht wordt hierbij als twee rechte helften heraangelegd.
        static Entity SplitsSegmentOpPunt(EntityManager em, Entity teSplitsen, Vector3 splitsPunt)
        {
            var sjabloon = em.GetComponentData<WegSegmentData>(teSplitsen);
            Entity nieuweNode = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(nieuweNode, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = new float3(splitsPunt.x, splitsPunt.y, splitsPunt.z) });

            var oudeLanes = em.GetBuffer<LaneBufferElement>(teSplitsen);
            var laneKopie = new NativeArray<LaneBufferElement>(oudeLanes.Length, Allocator.Temp);
            for (int i = 0; i < oudeLanes.Length; i++)
                laneKopie[i] = oudeLanes[i];

            Entity helftA = MaakSegmentTussenNodes(em, sjabloon.VanNode, nieuweNode, sjabloon, laneKopie);
            Entity helftB = MaakSegmentTussenNodes(em, nieuweNode, sjabloon.NaarNode, sjabloon, laneKopie);
            laneKopie.Dispose();

            HerverdeelKavels(em, teSplitsen, helftA, helftB);

            WegVisueelRegister.Verwijder(teSplitsen);
            em.DestroyEntity(teSplitsen);
            return nieuweNode;
        }

        static void HerverdeelKavels(EntityManager em, Entity oud, Entity a, Entity b)
        {
            var query = em.CreateEntityQuery(typeof(KavelCore), typeof(KavelGeometriePunt));
            var kavels = query.ToEntityArray(Allocator.Temp);
            var splineA = em.GetBuffer<WegSegmentSplinePunt>(a);
            var splineB = em.GetBuffer<WegSegmentSplinePunt>(b);
            float2 a0 = splineA[0].Punt.xz, a1 = splineA[splineA.Length - 1].Punt.xz;
            float2 b0 = splineB[0].Punt.xz, b1 = splineB[splineB.Length - 1].Punt.xz;

            var bijA = new List<Entity>();
            var bijB = new List<Entity>();
            foreach (var kavel in kavels)
            {
                if (em.GetComponentData<KavelCore>(kavel).Ontsluiting != oud) continue;
                var geo = em.GetBuffer<KavelGeometriePunt>(kavel);
                if (geo.Length < 2) continue;
                float2 front = (geo[0].Punt + geo[1].Punt) * 0.5f;
                (AfstandTotLijnstuk(front, a0, a1) <= AfstandTotLijnstuk(front, b0, b1) ? bijA : bijB).Add(kavel);
            }
            kavels.Dispose();

            foreach (var k in bijA) ZetOntsluiting(em, k, a);
            foreach (var k in bijB) ZetOntsluiting(em, k, b);
        }

        static void ZetOntsluiting(EntityManager em, Entity kavel, Entity segment)
        {
            var core = em.GetComponentData<KavelCore>(kavel);
            core.Ontsluiting = segment;
            em.SetComponentData(kavel, core);
        }

        static float AfstandTotLijnstuk(float2 p, float2 a, float2 b)
        {
            float2 ab = b - a;
            float t = math.lengthsq(ab) > 1e-6f ? math.saturate(math.dot(p - a, ab) / math.lengthsq(ab)) : 0f;
            return math.distance(p, a + ab * t);
        }

        static Entity MaakSegmentTussenNodes(EntityManager em, Entity van, Entity naar, in WegSegmentData sjabloon, NativeArray<LaneBufferElement> lanes)
        {
            Entity segment = em.CreateEntity(typeof(WegSegmentData), typeof(WegSegmentSplinePunt), typeof(LaneBufferElement), typeof(CapaciteitDirty));
            var vanPos = em.GetComponentData<NetwerkNodeData>(van).Positie;
            var naarPos = em.GetComponentData<NetwerkNodeData>(naar).Positie;

            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            spline.Add(new WegSegmentSplinePunt { Punt = vanPos });
            spline.Add(new WegSegmentSplinePunt { Punt = naarPos });

            var laneBuffer = em.GetBuffer<LaneBufferElement>(segment);
            for (int i = 0; i < lanes.Length; i++)
                laneBuffer.Add(lanes[i]);

            em.SetComponentData(segment, new WegSegmentData
            {
                Id = new Unity.Entities.Hash128((uint)segment.Index, 12, 0, 0),
                WegType = sjabloon.WegType,
                VanNode = van,
                NaarNode = naar,
                Capaciteit = 0,
                Snelheidslimiet = sjabloon.Snelheidslimiet,
                HuidigeBelasting = 0f,
                HoogteProfiel = sjabloon.HoogteProfiel,
                HeeftBusoverlay = sjabloon.HeeftBusoverlay,
            });
            return segment;
        }

        // ═══════ WERKBALK ═══════

        static bool Knop(Rect rect, string label, bool actief, GUIStyle stijl, Color? kleur = null)
        {
            var oud = GUI.backgroundColor;
            if (kleur.HasValue) GUI.backgroundColor = kleur.Value;
            if (actief) GUI.backgroundColor = new Color(0.35f, 0.75f, 1f);
            bool geklikt = GUI.Button(rect, label, stijl);
            GUI.backgroundColor = oud;
            return geklikt;
        }

        void OnGUI()
        {
            UiSchaal.Toepassen();
            var r = PaneelRect();
            var knop = new GUIStyle(GUI.skin.button) { fontSize = 13 };
            var tab = new GUIStyle(GUI.skin.button) { fontSize = 14, fontStyle = FontStyle.Bold };
            var tekst = new GUIStyle(GUI.skin.label) { fontSize = 13, normal = { textColor = new Color(0.85f, 0.9f, 0.95f) } };

            GUI.Box(r, "");
            float x = r.x + 10f, y = r.y + 8f;

            if (Knop(new Rect(x, y, 120f, 28f), "Wegen", _tab == Tab.Wegen, tab)) ZetTab(Tab.Wegen);
            if (Knop(new Rect(x + 126f, y, 120f, 28f), "Zones (Z)", _tab == Tab.Zones, tab)) ZetTab(Tab.Zones);
            if (Knop(new Rect(x + 252f, y, 120f, 28f), "Upgraden (U)", _tab == Tab.Upgraden, tab)) ZetTab(Tab.Upgraden);
            if (Knop(new Rect(r.xMax - 200f, y, 190f, 28f), _toonTunnelOverzicht ? "Tunneloverzicht: aan (O)" : "Tunneloverzicht (O)", _toonTunnelOverzicht, knop))
                ZetTunnelOverzichtActief(!_toonTunnelOverzicht);

            y += 36f;
            if (_tab == Tab.Zones)
            {
                for (int i = 0; i < kZones.Length; i++)
                {
                    var kleur = ZoneWeergave.Kleur(kZones[i]);
                    kleur.a = 1f;
                    if (Knop(new Rect(x + i * 152f, y, 146f, 28f), $"{i + 1}  {kZoneNamen[i]}", _zone == kZones[i], knop, kleur))
                        _zone = kZones[i];
                }
                y += 34f;
                GUI.Label(new Rect(x, y + 4f, 70f, 22f), "Penseel", tekst);
                if (GUI.Button(new Rect(x + 70f, y, 30f, 26f), "-", knop)) _penseel = Mathf.Max(6f, _penseel - 4f);
                GUI.Label(new Rect(x + 108f, y + 4f, 60f, 22f), $"{_penseel:0} m", tekst);
                if (GUI.Button(new Rect(x + 160f, y, 30f, 26f), "+", knop)) _penseel = Mathf.Min(60f, _penseel + 4f);
                GUI.Label(new Rect(x + 210f, y + 4f, 700f, 22f), "Sleep over kavels langs een weg. Gebouwen verschijnen vanzelf als er vraag is (balken bovenin).", tekst);
            }
            else
            {
                for (int i = 0; i < kBeschikbareTypes.Length; i++)
                {
                    if (Knop(new Rect(x + i * 102f, y, 98f, 28f), kTypeNamen[i], _actiefType == kBeschikbareTypes[i], knop))
                        _actiefType = kBeschikbareTypes[i];
                }
                y += 34f;
                if (_tab == Tab.Wegen)
                {
                    if (Knop(new Rect(x, y, 90f, 26f), "Recht", _modus == TekenModus.Recht, knop)) { _modus = TekenModus.Recht; AnnuleerTekenen(); }
                    if (Knop(new Rect(x + 94f, y, 90f, 26f), "Bocht (C)", _modus == TekenModus.Bocht, knop)) { _modus = TekenModus.Bocht; AnnuleerTekenen(); }
                    GUI.Label(new Rect(x + 200f, y + 4f, 60f, 22f), "Hoogte", tekst);
                    if (GUI.Button(new Rect(x + 256f, y, 30f, 26f), "-", knop)) ZetHoogteNiveau(_hoogteNiveau - 1);
                    GUI.Label(new Rect(x + 292f, y + 4f, 170f, 22f), BeschrijfHoogteNiveau(_hoogteNiveau), tekst);
                    if (GUI.Button(new Rect(x + 462f, y, 30f, 26f), "+", knop)) ZetHoogteNiveau(_hoogteNiveau + 1);
                    GUI.Label(new Rect(x + 506f, y + 4f, 420f, 22f), "PgUp/PgDn hoogte, rechtermuisknop annuleert, 1-9 wegtype.", tekst);
                }
                else
                {
                    GUI.Label(new Rect(x, y + 4f, 900f, 22f), "Kies een wegtype en klik op een bestaande weg om hem om te bouwen.", tekst);
                }
            }

            y += 34f;
            if (!string.IsNullOrEmpty(_laatsteMelding))
                GUI.Label(new Rect(x, y + 2f, r.width - 20f, 22f), _laatsteMelding, tekst);
        }
    }
}
