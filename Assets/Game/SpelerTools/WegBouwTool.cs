using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;
using CityBuilder.Game.Ontwikkeling;
using CityBuilder.Game.Visualisatie;

namespace CityBuilder.Game.SpelerTools
{
    /// De speler-gestuurde tegenhanger van de wegennetwerk-testbootstraps: in plaats van
    /// hardcoded testdata tekent de speler zelf een wegsegment met de muis, zoals in Cities
    /// Skylines. Gebruikt UnityEngine.Input (het "oude" Input Manager) -- exact dezelfde API als
    /// FreeCamera.cs, wat al bevestigd werkt in dit project, dus geen nieuwe input-risico's.
    ///
    /// Stap 1: snapping op zowel bestaande knopen als bestaande segmenten (met splitsing), zodat
    /// een nieuw segment altijd op een echte knoop aansluit -- nooit los eindigt. Kruispunt-
    /// vulling zit in KruispuntVisualisatieSystem.
    ///
    /// Stap 2 (dit bestand): Bocht-modus met een kwadratische Bézier (klik start, klik eind,
    /// beweeg voor het buigpunt, klik om af te ronden). Dit is bewust een vereenvoudiging van
    /// CS1/2's cubic-Bézier-met-tangenten-continuiteit (die zorgt dat aangrenzende segmenten
    /// vloeiend in elkaar overlopen over de hele graaf) -- dat is een aanzienlijk grotere
    /// aparte feature. Eén buigpunt per segment geeft al een bochtige weg, wat de directe vraag
    /// was; tangent-continuiteit tussen segmenten is een latere verfijning.
    ///
    /// Zodra een segment klaar is, genereert deze tool meteen kavels langs de nieuwe weg via de
    /// al bestaande KavelGeneratieUtility (doc 07).
    [AddComponentMenu("City Builder/Weg Bouw Tool")]
    public class WegBouwTool : MonoBehaviour
    {
        public float nodeSnapAfstand = 8f;
        public float segmentSnapAfstand = 5f;
        public float minimumSegmentLengte = 5f;
        const int kBochtSamples = 12;

        enum TekenModus { Recht, Bocht }
        enum TekenFase { Geen, WachtOpEindpunt, WachtOpBuiging }

        /// Stap 5: los van de teken-submodus (Recht/Bocht) staat de tool als geheel in Bouwen of
        /// Upgraden. In Upgraden selecteert een klik een bestaand segment en vervangt het
        /// wegtype in-place -- geen nieuwe knopen, geen nieuwe kavels, alleen lane-samenstelling/
        /// snelheidslimiet/busvlag en de bijbehorende mesh worden herbouwd.
        enum ToolActie { Bouwen, Upgraden }
        const float UpgradeSelectieAfstand = 6f;

        // Paneel-geometrie, gedeeld tussen OnGUI (tekenen) en MuisBovenUI (wereld-klik blokkeren).
        const float PaneelX = 10f;
        const float PaneelBreedte = 340f;
        const float PaneelTopVanaf = 330f; // afstand vanaf de onderkant van het scherm tot de bovenkant van het paneel
        const float PaneelHoogte = 320f;

        /// Stap 4/6: hoogte van het volgende segment als één doorlopende dial (PageUp/PageDown),
        /// zoals in CS1/2 -- geen aparte "kies brug" of "kies tunnel"-tool. Niveau 0 = maaiveld,
        /// positief = omhoog (brug/viaduct), negatief = omlaag (tunnel); het teken van het niveau
        /// bepaalt de HoogteProfielModus, de grootte bepaalt HoogteOffset.
        const int HoogteNiveauMin = -2;
        const int HoogteNiveauMax = 2;
        const float HoogteStapMeter = 4f;
        const float StandaardOvergangsLengte = 20f;

        static readonly WegTypeId[] kBeschikbareTypes =
        {
            WegTypeId.Woonstraat, WegTypeId.Straat, WegTypeId.StraatMetBus, WegTypeId.Avenue,
            WegTypeId.Tramstraat, WegTypeId.Gebiedsontsluitingsweg, WegTypeId.Snelweg,
            WegTypeId.Fietspad, WegTypeId.Voetpad,
        };

        KavelGeneratieRegel _kavelRegel = new KavelGeneratieRegel { MaxDiepteVanafWeggrens = 50f, MinFrontbreedte = 20f };

        WegTypeId _actiefType = WegTypeId.Straat;
        TekenModus _modus = TekenModus.Recht;
        int _hoogteNiveau = 0; // 0 = maaiveld, >0 = brug, <0 = tunnel
        ToolActie _actie = ToolActie.Bouwen;
        bool _toonTunnelOverzicht;

        // Recht-modus state.
        bool _bezigMetTekenen;
        Vector3 _startPunt;

        // Bocht-modus state.
        TekenFase _fase = TekenFase.Geen;
        Vector3 _p0, _p2;

        LineRenderer _preview;
        Camera _camera;
        string _laatsteMelding = "";

        void Awake()
        {
            _camera = Camera.main;

            var previewGo = new GameObject("WegBouwPreview");
            previewGo.transform.SetParent(transform, false);
            _preview = previewGo.AddComponent<LineRenderer>();
            _preview.positionCount = 2;
            _preview.startWidth = 2f;
            _preview.endWidth = 2f;
            _preview.material = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            _preview.startColor = new Color(1f, 1f, 0f, 0.7f);
            _preview.endColor = new Color(1f, 1f, 0f, 0.7f);
            _preview.useWorldSpace = true;
            _preview.enabled = false;
        }

        void Update()
        {
            HandleTypeSelectie();
            HandleModusSelectie();
            HandleHoogteSelectie();
            HandleActieSelectie();
            HandleTunnelOverzichtToggle();

            // Klikken op het UI-paneel (OnGUI) mag niet ook als wereld-klik tellen -- anders start
            // je per ongeluk een segment/upgrade onder een knop die je net indrukte.
            if (MuisBovenUI())
            {
                _preview.enabled = false;
                return;
            }

            if (!RaycastNaarTerrein(out Vector3 hitPunt))
            {
                if (_bezigMetTekenen || _fase != TekenFase.Geen) _preview.enabled = false;
                return;
            }

            if (_actie == ToolActie.Upgraden)
            {
                UpdateUpgradeModus(hitPunt);
                return;
            }

            if (_modus == TekenModus.Recht)
                UpdateRechteModus(hitPunt);
            else
                UpdateBochtModus(hitPunt);
        }

        void HandleActieSelectie()
        {
            if (Input.GetKeyDown(KeyCode.U))
            {
                _actie = _actie == ToolActie.Bouwen ? ToolActie.Upgraden : ToolActie.Bouwen;
                AnnuleerTekenen();
                _laatsteMelding = $"Actie: {_actie}.";
            }
        }

        /// Upgraden gebruikt geen sleep-/meerklik-interactie: één klik op een bestaand segment
        /// past het geselecteerde wegtype direct toe.
        void UpdateUpgradeModus(Vector3 hitPunt)
        {
            if (!Input.GetMouseButtonDown(0)) return;

            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            if (ZoekSegmentBijPunt(em, hitPunt, UpgradeSelectieAfstand, out Entity segment))
                UpgradeSegment(em, segment);
            else
                _laatsteMelding = "Geen weg gevonden om te upgraden.";
        }

        void HandleModusSelectie()
        {
            if (Input.GetKeyDown(KeyCode.C))
            {
                _modus = _modus == TekenModus.Recht ? TekenModus.Bocht : TekenModus.Recht;
                AnnuleerTekenen();
                _laatsteMelding = $"Modus: {(_modus == TekenModus.Recht ? "Recht" : "Bocht")}.";
            }
        }

        void HandleHoogteSelectie()
        {
            // Geen AnnuleerTekenen() hier -- net als in CS1/2 kun je de hoogte bijstellen terwijl
            // je middenin het tekenen van een segment zit, zonder de klik-keten te verliezen.
            if (Input.GetKeyDown(KeyCode.PageUp))
                ZetHoogteNiveau(_hoogteNiveau + 1);
            else if (Input.GetKeyDown(KeyCode.PageDown))
                ZetHoogteNiveau(_hoogteNiveau - 1);
        }

        void ZetHoogteNiveau(int niveau)
        {
            _hoogteNiveau = Mathf.Clamp(niveau, HoogteNiveauMin, HoogteNiveauMax);
            _laatsteMelding = $"Hoogte: {BeschrijfHoogteNiveau(_hoogteNiveau)}.";
        }

        static string BeschrijfHoogteNiveau(int niveau)
        {
            if (niveau == 0) return "maaiveld";
            return niveau > 0 ? $"brug (niveau {niveau})" : $"tunnel (niveau {-niveau})";
        }

        HoogteProfielData BerekenHoogteProfiel()
        {
            if (_hoogteNiveau == 0)
                return new HoogteProfielData { Modus = HoogteProfielModus.OpMaaiveld, HoogteOffset = 0f, OvergangsLengte = 0f };

            var modus = _hoogteNiveau > 0 ? HoogteProfielModus.Verhoogd : HoogteProfielModus.Tunnel;
            float offset = Mathf.Abs(_hoogteNiveau) * HoogteStapMeter;
            return new HoogteProfielData { Modus = modus, HoogteOffset = offset, OvergangsLengte = StandaardOvergangsLengte };
        }

        void HandleTunnelOverzichtToggle()
        {
            if (Input.GetKeyDown(KeyCode.O))
                ZetTunnelOverzichtActief(!_toonTunnelOverzicht);
        }

        /// Zoekt alle bestaande tunnelsegmenten op en toont/verbergt hun al aangemaakte (maar
        /// standaard onzichtbare) "TunnelOverzicht"-kind (zie WegVisualisatieUtility). Een tunnel
        /// die je bouwt terwijl dit al aanstaat, krijgt zijn overzicht pas zichtbaar bij de
        /// volgende toggle -- acceptabel, je bouwt een tunnel meestal eerst af en bekijkt 'm
        /// daarna pas van bovenaf.
        void ZetTunnelOverzichtActief(bool actief)
        {
            _toonTunnelOverzicht = actief;
            _laatsteMelding = actief ? "Tunneloverzicht aan." : "Tunneloverzicht uit.";

            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            var query = em.CreateEntityQuery(typeof(WegSegmentData));
            var entiteiten = query.ToEntityArray(Allocator.Temp);
            var data = query.ToComponentDataArray<WegSegmentData>(Allocator.Temp);

            for (int i = 0; i < data.Length; i++)
            {
                if (data[i].HoogteProfiel.Modus != HoogteProfielModus.Tunnel) continue;

                var wegVisueel = GameObject.Find($"WegVisueel_{entiteiten[i].Index}");
                if (wegVisueel == null) continue;

                var overzicht = wegVisueel.transform.Find("TunnelOverzicht");
                if (overzicht != null) overzicht.gameObject.SetActive(actief);
            }

            entiteiten.Dispose();
            data.Dispose();
        }

        /// Screen-space check tegen het OnGUI-paneel (zie PaneelX/PaneelTopVanaf/etc in OnGUI) --
        /// zodat een klik op een UI-knop niet ook als wereld-klik telt. Input.mousePosition is
        /// bottom-left-georiënteerd, OnGUI-Rects zijn top-left-georiënteerd; hier omgerekend.
        bool MuisBovenUI()
        {
            float muisYVanBoven = Screen.height - Input.mousePosition.y;
            float paneelBovenkant = Screen.height - PaneelTopVanaf;
            float paneelOnderkant = paneelBovenkant + PaneelHoogte;
            return Input.mousePosition.x >= PaneelX && Input.mousePosition.x <= PaneelX + PaneelBreedte
                && muisYVanBoven >= paneelBovenkant && muisYVanBoven <= paneelOnderkant;
        }

        void AnnuleerTekenen()
        {
            _bezigMetTekenen = false;
            _fase = TekenFase.Geen;
            _preview.enabled = false;
        }

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
                    _preview.SetPosition(0, _p0 + Vector3.up);
                    _preview.SetPosition(1, hitPunt + Vector3.up);
                    if (Input.GetMouseButtonDown(0))
                    {
                        _p2 = BerekenSnapPunt(hitPunt);
                        _fase = TekenFase.WachtOpBuiging;
                    }
                    break;

                case TekenFase.WachtOpBuiging:
                    // Het buigpunt is bewust ongesnapt -- het is een vormgreep, geen netwerkknoop.
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
        }

        static Vector3 BerekenKwadratischeBezier(Vector3 p0, Vector3 p1, Vector3 p2, float t)
        {
            float u = 1f - t;
            return u * u * p0 + 2f * u * t * p1 + t * t * p2;
        }

        void HandleTypeSelectie()
        {
            for (int i = 0; i < kBeschikbareTypes.Length && i < 9; i++)
            {
                if (Input.GetKeyDown(KeyCode.Alpha1 + i))
                    _actiefType = kBeschikbareTypes[i];
            }
        }

        bool RaycastNaarTerrein(out Vector3 punt)
        {
            punt = default;
            if (_camera == null) return false;

            var ray = _camera.ScreenPointToRay(Input.mousePosition);
            if (Physics.Raycast(ray, out var hit, 5000f))
            {
                punt = hit.point;
                return true;
            }
            return false;
        }

        /// Puur voor preview/beslissing "waar zou dit naartoe snappen" -- geen entity-mutaties.
        /// Nodes wegen zwaarder dan segmenten: als beide binnen bereik liggen, wint de node.
        Vector3 BerekenSnapPunt(Vector3 ruwPunt)
        {
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;

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
                Vector3 nodePos = new Vector3(nodes[i].Positie.x, nodes[i].Positie.y, nodes[i].Positie.z);
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
                    Vector3 a = new Vector3(spline[s].Punt.x, spline[s].Punt.y, spline[s].Punt.z);
                    Vector3 b = new Vector3(spline[s + 1].Punt.x, spline[s + 1].Punt.y, spline[s + 1].Punt.z);
                    Vector3 dichtstbij = DichtstbijzijndPuntOpLijnstuk(punt, a, b);
                    float afstand = Vector3.Distance(punt, dichtstbij);

                    // Vermijd snappen vlak bij het eigen eindpunt van het segment -- dat geval
                    // wordt al door ZoekDichtstbijzijndeNode afgehandeld en zou hier onnodig een
                    // splitsing vlak naast een bestaande knoop veroorzaken.
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

        /// Zelfde afstandsberekening als ZoekDichtstbijzijndSegmentPunt, maar zonder de
        /// eindpunt-uitsluiting daarvan (die is er specifiek om een onnodige splitsing vlak naast
        /// een knoop te voorkomen -- hier willen we juist het hele segment kunnen selecteren,
        /// inclusief vlak bij zijn uiteinden).
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
                    Vector3 a = new Vector3(spline[s].Punt.x, spline[s].Punt.y, spline[s].Punt.z);
                    Vector3 b = new Vector3(spline[s + 1].Punt.x, spline[s + 1].Punt.y, spline[s + 1].Punt.z);
                    Vector3 dichtstbij = DichtstbijzijndPuntOpLijnstuk(punt, a, b);
                    float afstand = Vector3.Distance(punt, dichtstbij);

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

        /// Vervangt het wegtype van een bestaand segment in-place: lanes herbouwd vanuit
        /// WegTypeCatalogus, snelheidslimiet/busvlag opnieuw afgeleid, CapaciteitDirty gezet.
        /// VanNode/NaarNode/HoogteProfiel blijven ongewijzigd -- een upgrade verandert het
        /// wegtype, niet de ligging of hoogte. De bestaande mesh past niet meer bij de nieuwe
        /// lane-samenstelling, dus die wordt weggehaald en de WegVisueelGemaakt-tag verwijderd
        /// zodat WegVisualisatieSystem het segment volgende frame opnieuw opbouwt (zelfde route
        /// als na een segment-splitsing).
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

            if (!em.HasComponent<CapaciteitDirty>(segment))
                em.AddComponent<CapaciteitDirty>(segment);

            var oudVisueel = GameObject.Find($"WegVisueel_{segment.Index}");
            if (oudVisueel != null) Object.Destroy(oudVisueel);
            if (em.HasComponent<WegVisueelGemaakt>(segment))
                em.RemoveComponent<WegVisueelGemaakt>(segment);

            _laatsteMelding = $"Segment geüpgraded naar {_actiefType}.";
        }

        void MaakRechteWegsegment(Vector3 start, Vector3 eind)
        {
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            Entity vanNode = VindOfMaakNode(em, start);
            Entity naarNode = VindOfMaakNode(em, eind);
            var vanPos = em.GetComponentData<NetwerkNodeData>(vanNode).Positie;
            var naarPos = em.GetComponentData<NetwerkNodeData>(naarNode).Positie;

            MaakWegsegmentMetSpline(vanNode, naarNode, new List<float3> { vanPos, naarPos });
        }

        void MaakGebogenWegsegment(Vector3 p0Ruw, Vector3 p1, Vector3 p2Ruw)
        {
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            Entity vanNode = VindOfMaakNode(em, p0Ruw);
            Entity naarNode = VindOfMaakNode(em, p2Ruw);
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
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;

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
                // Sluit aan bij WegTypeCatalogus' aanpak (zelfde lanes als Straat, alleen dit
                // vlag verschilt) -- de speler-tool moet die keuze wel daadwerkelijk doorzetten.
                HeeftBusoverlay = _actiefType == WegTypeId.StraatMetBus,
            });

            float lengte = 0f;
            for (int i = 0; i < splinePunten.Count - 1; i++)
                lengte += Vector3.Distance(ToVector3(splinePunten[i]), ToVector3(splinePunten[i + 1]));

            // Geen kavels langs een brug/tunnel -- die staan op maaiveld en zouden dwars door het
            // viaduct/de op-/afrit heen komen te liggen, wat geen enkele geldige kavel oplevert.
            if (hoogteProfiel.Modus == HoogteProfielModus.OpMaaiveld)
            {
                var kavels = KavelGeneratieUtility.GenereerKavelsLangsWeg(em, segment, _kavelRegel, districtId: 0);
                _laatsteMelding = $"{_actiefType} aangelegd ({lengte:0}m), {kavels.Length} kavels erlangs gegenereerd.";
            }
            else
            {
                _laatsteMelding = $"{_actiefType} aangelegd ({lengte:0}m) als {BeschrijfHoogteNiveau(_hoogteNiveau)}.";
            }
        }

        static Vector3 ToVector3(float3 f) => new Vector3(f.x, f.y, f.z);

        /// Vindt een bestaande knoop op deze positie, splitst een bestaand segment als de positie
        /// daar middenop valt, of maakt anders een verse losse knoop.
        Entity VindOfMaakNode(EntityManager em, Vector3 positie)
        {
            var nodeQuery = em.CreateEntityQuery(typeof(NetwerkNodeData));
            var nodeEntiteiten = nodeQuery.ToEntityArray(Allocator.Temp);
            var nodeData = nodeQuery.ToComponentDataArray<NetwerkNodeData>(Allocator.Temp);

            Entity gevonden = Entity.Null;
            for (int i = 0; i < nodeData.Length; i++)
            {
                Vector3 nodePos = new Vector3(nodeData[i].Positie.x, nodeData[i].Positie.y, nodeData[i].Positie.z);
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

        /// Splitst een bestaand segment in twee op het gegeven punt: nieuwe knoop erop, twee
        /// nieuwe segmenten met dezelfde wegtype/lane-samenstelling, oude segment (+ zijn visueel)
        /// verwijderd. Werkt op basis van de eindpunten van het gesplitste segment, niet zijn
        /// eventuele tussenliggende bochtpunten -- een bocht wordt dus als twee rechte helften
        /// heraangelegd bij een splitsing. Acceptabele vereenvoudiging voor nu.
        static Entity SplitsSegmentOpPunt(EntityManager em, Entity teSplitsen, Vector3 splitsPunt)
        {
            var sjabloon = em.GetComponentData<WegSegmentData>(teSplitsen);
            Entity vanNode = sjabloon.VanNode;
            Entity naarNode = sjabloon.NaarNode;

            Entity nieuweNode = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(nieuweNode, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = new float3(splitsPunt.x, splitsPunt.y, splitsPunt.z) });

            var oudeLanes = em.GetBuffer<LaneBufferElement>(teSplitsen);
            var laneKopie = new NativeArray<LaneBufferElement>(oudeLanes.Length, Allocator.Temp);
            for (int i = 0; i < oudeLanes.Length; i++)
                laneKopie[i] = oudeLanes[i];

            MaakSegmentTussenNodes(em, vanNode, nieuweNode, sjabloon, laneKopie);
            MaakSegmentTussenNodes(em, nieuweNode, naarNode, sjabloon, laneKopie);
            laneKopie.Dispose();

            var oudVisueel = GameObject.Find($"WegVisueel_{teSplitsen.Index}");
            if (oudVisueel != null) Object.Destroy(oudVisueel);
            em.DestroyEntity(teSplitsen);

            return nieuweNode;
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

        /// Klikbare knoppen i.p.v. alleen sneltoetsen, met een blauwe highlight op de actieve
        /// keuze -- rechtstreeks antwoord op "een UI zoals bij CS1/2 zou fijn zijn en handiger om
        /// te overzien". Geen aparte Action-parameter/lambda's: de aanroeper leest gewoon de
        /// return-waarde, zelfde stijl als de rest van dit bestand.
        static bool KnopMetHighlight(Rect rect, string label, bool actief, GUIStyle stijl)
        {
            var vorigeKleur = GUI.backgroundColor;
            if (actief) GUI.backgroundColor = new Color(0.35f, 0.75f, 1f);
            bool geklikt = GUI.Button(rect, label, stijl);
            GUI.backgroundColor = vorigeKleur;
            return geklikt;
        }

        void OnGUI()
        {
            var stijl = new GUIStyle(GUI.skin.box) { fontSize = 14, alignment = TextAnchor.UpperLeft, normal = { textColor = Color.white } };
            var knopStijl = new GUIStyle(GUI.skin.button) { fontSize = 13 };
            var kopStijl = new GUIStyle(GUI.skin.label) { fontSize = 15, fontStyle = FontStyle.Bold, normal = { textColor = Color.white } };

            float x = PaneelX + 10f;
            float y = Screen.height - PaneelTopVanaf + 8f;
            const float knopH = 26f;
            const float rijGap = 4f;

            GUI.Box(new Rect(PaneelX, Screen.height - PaneelTopVanaf, PaneelBreedte, PaneelHoogte), "", stijl);

            GUI.Label(new Rect(x, y, PaneelBreedte - 20f, 22f), $"Wegtekentool -- {_actiefType}", kopStijl);
            y += 26f;

            if (KnopMetHighlight(new Rect(x, y, 155f, knopH), "Bouwen", _actie == ToolActie.Bouwen, knopStijl))
            {
                _actie = ToolActie.Bouwen;
                AnnuleerTekenen();
            }
            if (KnopMetHighlight(new Rect(x + 165f, y, 155f, knopH), "Upgraden", _actie == ToolActie.Upgraden, knopStijl))
            {
                _actie = ToolActie.Upgraden;
                AnnuleerTekenen();
            }
            y += knopH + rijGap;

            if (_actie == ToolActie.Bouwen)
            {
                if (KnopMetHighlight(new Rect(x, y, 155f, knopH), "Recht", _modus == TekenModus.Recht, knopStijl))
                {
                    _modus = TekenModus.Recht;
                    AnnuleerTekenen();
                }
                if (KnopMetHighlight(new Rect(x + 165f, y, 155f, knopH), "Bocht", _modus == TekenModus.Bocht, knopStijl))
                {
                    _modus = TekenModus.Bocht;
                    AnnuleerTekenen();
                }
                y += knopH + rijGap;

                GUI.Label(new Rect(x, y, PaneelBreedte - 20f, 20f), $"Hoogte: {BeschrijfHoogteNiveau(_hoogteNiveau)}", stijl);
                y += 20f;
                if (GUI.Button(new Rect(x, y, 40f, knopH), "-", knopStijl)) ZetHoogteNiveau(_hoogteNiveau - 1);
                GUI.Label(new Rect(x + 45f, y + 4f, PaneelBreedte - 130f, 20f), NiveauBalk(_hoogteNiveau), stijl);
                if (GUI.Button(new Rect(x + PaneelBreedte - 60f, y, 40f, knopH), "+", knopStijl)) ZetHoogteNiveau(_hoogteNiveau + 1);
                y += knopH + rijGap;
            }
            else
            {
                GUI.Label(new Rect(x, y, PaneelBreedte - 20f, 40f), "Klik op een bestaande weg om 'm naar\nhet geselecteerde wegtype te upgraden.", stijl);
                y += 50f; // korter dan de Bouwen-tak (geen modus/hoogte-rijen) -- laat gewoon wat lege ruimte in het paneel
            }

            if (KnopMetHighlight(new Rect(x, y, PaneelBreedte - 20f, knopH), _toonTunnelOverzicht ? "Tunneloverzicht: AAN" : "Tunneloverzicht: uit", _toonTunnelOverzicht, knopStijl))
                ZetTunnelOverzichtActief(!_toonTunnelOverzicht);
            y += knopH + rijGap + 2f;

            for (int i = 0; i < kBeschikbareTypes.Length; i++)
            {
                int kolom = i % 3;
                int rij = i / 3;
                var rect = new Rect(x + kolom * 108f, y + rij * 30f, 100f, 26f);
                if (KnopMetHighlight(rect, kBeschikbareTypes[i].ToString(), _actiefType == kBeschikbareTypes[i], knopStijl))
                    _actiefType = kBeschikbareTypes[i];
            }
            y += 3 * 30f + 6f;

            GUI.Label(new Rect(x, y, PaneelBreedte - 20f, 18f), "C/U/PgUp/PgDn/O: zelfde acties via toetsenbord.", stijl);
            y += 22f;

            if (!string.IsNullOrEmpty(_laatsteMelding))
                GUI.Label(new Rect(x, y, PaneelBreedte - 20f, 22f), _laatsteMelding, stijl);
        }

        static string NiveauBalk(int huidig)
        {
            string resultaat = "";
            for (int n = HoogteNiveauMin; n <= HoogteNiveauMax; n++)
                resultaat += n == huidig ? $"[{n}]" : $" {n} ";
            return resultaat;
        }
    }
}
