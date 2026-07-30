using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;
using CityBuilder.Game.Ontwikkeling;

namespace CityBuilder.Game.SpelerTools
{
    /// De speler-gestuurde tegenhanger van de wegennetwerk-testbootstraps: in plaats van
    /// hardcoded testdata tekent de speler zelf een wegsegment met de muis, zoals in Cities
    /// Skylines. Gebruikt UnityEngine.Input (het "oude" Input Manager) -- exact dezelfde API als
    /// FreeCamera.cs, wat al bevestigd werkt in dit project, dus geen nieuwe input-risico's.
    ///
    /// Stap 1 van de CS1/2-vergelijking: snapping op zowel bestaande knopen als bestaande
    /// segmenten (met splitsing), zodat een nieuw segment altijd op een echte knoop aansluit --
    /// nooit los in de lucht/grond eindigt. Dat is precies wat de "groen ertussen"-gaten
    /// veroorzaakte: twee segmenten die elkaar rakelings misten in plaats van op dezelfde knoop
    /// te eindigen. Kruispunt-mesh (de vulling op de knoop zelf) komt in WegVisualisatieSystem.
    ///
    /// Zodra een segment klaar is, genereert deze tool meteen kavels langs de nieuwe weg via de
    /// al bestaande KavelGeneratieUtility (doc 07).
    [AddComponentMenu("City Builder/Weg Bouw Tool")]
    public class WegBouwTool : MonoBehaviour
    {
        public float nodeSnapAfstand = 8f;
        public float segmentSnapAfstand = 5f;
        public float minimumSegmentLengte = 5f;

        static readonly WegTypeId[] kBeschikbareTypes =
        {
            WegTypeId.Woonstraat, WegTypeId.Straat, WegTypeId.StraatMetBus, WegTypeId.Avenue,
            WegTypeId.Tramstraat, WegTypeId.Gebiedsontsluitingsweg, WegTypeId.Snelweg,
            WegTypeId.Fietspad, WegTypeId.Voetpad,
        };

        KavelGeneratieRegel _kavelRegel = new KavelGeneratieRegel { MaxDiepteVanafWeggrens = 50f, MinFrontbreedte = 20f };

        WegTypeId _actiefType = WegTypeId.Straat;
        bool _bezigMetTekenen;
        Vector3 _startPunt;
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

            bool heeftHit = RaycastNaarTerrein(out Vector3 hitPunt);
            if (!heeftHit)
            {
                if (_bezigMetTekenen) _preview.enabled = false;
                return;
            }

            if (Input.GetMouseButtonDown(0))
            {
                _startPunt = BerekenSnapPunt(hitPunt);
                _bezigMetTekenen = true;
                _preview.enabled = true;
            }
            else if (_bezigMetTekenen && Input.GetMouseButtonUp(0))
            {
                Vector3 eindPunt = BerekenSnapPunt(hitPunt);
                _bezigMetTekenen = false;
                _preview.enabled = false;

                if (Vector3.Distance(_startPunt, eindPunt) >= minimumSegmentLengte)
                    MaakWegsegment(_startPunt, eindPunt);
                else
                    _laatsteMelding = "Segment te kort, geannuleerd.";
            }
            else if (_bezigMetTekenen && Input.GetMouseButtonDown(1))
            {
                _bezigMetTekenen = false;
                _preview.enabled = false;
                _laatsteMelding = "Tekenen geannuleerd.";
            }
            else if (_bezigMetTekenen)
            {
                Vector3 eindPunt = BerekenSnapPunt(hitPunt);
                _preview.SetPosition(0, _startPunt + Vector3.up * 1f);
                _preview.SetPosition(1, eindPunt + Vector3.up * 1f);
            }
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

        void MaakWegsegment(Vector3 start, Vector3 eind)
        {
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;

            Entity vanNode = VindOfMaakNode(em, start);
            Entity naarNode = VindOfMaakNode(em, eind);

            Entity segment = em.CreateEntity(typeof(WegSegmentData), typeof(WegSegmentSplinePunt), typeof(LaneBufferElement), typeof(CapaciteitDirty));

            var vanPos = em.GetComponentData<NetwerkNodeData>(vanNode).Positie;
            var naarPos = em.GetComponentData<NetwerkNodeData>(naarNode).Positie;

            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            spline.Add(new WegSegmentSplinePunt { Punt = vanPos });
            spline.Add(new WegSegmentSplinePunt { Punt = naarPos });

            var lanes = em.GetBuffer<LaneBufferElement>(segment);
            foreach (var spec in WegTypeCatalogus.GetLanes(_actiefType))
                lanes.Add(new LaneBufferElement { Type = spec.Type, Richting = spec.Richting, BreedteMeter = spec.BreedteMeter });

            em.SetComponentData(segment, new WegSegmentData
            {
                Id = new Unity.Entities.Hash128((uint)segment.Index, 11, 0, 0),
                WegType = _actiefType,
                VanNode = vanNode,
                NaarNode = naarNode,
                Capaciteit = 0,
                Snelheidslimiet = WegTypeCatalogus.GetSnelheidslimiet(_actiefType),
                HuidigeBelasting = 0f,
                HoogteProfiel = new HoogteProfielData { Modus = HoogteProfielModus.OpMaaiveld, HoogteOffset = 0f, OvergangsLengte = 0f },
                HeeftBusoverlay = false,
            });

            var kavels = KavelGeneratieUtility.GenereerKavelsLangsWeg(em, segment, _kavelRegel, districtId: 0);

            _laatsteMelding = $"{_actiefType} aangelegd ({Vector3.Distance(start, eind):0}m), {kavels.Length} kavels erlangs gegenereerd.";
        }

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
        /// verwijderd.
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

        void OnGUI()
        {
            var stijl = new GUIStyle(GUI.skin.box) { fontSize = 16, alignment = TextAnchor.UpperLeft, normal = { textColor = Color.white } };
            var knopStijl = new GUIStyle(GUI.skin.button) { fontSize = 14 };

            GUI.Box(new Rect(10, Screen.height - 220, 320, 210), "", stijl);
            GUI.Label(new Rect(20, Screen.height - 215, 300, 24), $"Wegtekentool -- actief: {_actiefType}", stijl);
            GUI.Label(new Rect(20, Screen.height - 195, 300, 40), "Klik-sleep om te tekenen, rechtermuisknop annuleert.\nToetsen 1-9 wisselen wegtype.", stijl);

            for (int i = 0; i < kBeschikbareTypes.Length; i++)
            {
                int kolom = i % 3;
                int rij = i / 3;
                var rect = new Rect(20 + kolom * 100, Screen.height - 145 + rij * 30, 95, 26);
                if (GUI.Button(rect, kBeschikbareTypes[i].ToString(), knopStijl))
                    _actiefType = kBeschikbareTypes[i];
            }

            if (!string.IsNullOrEmpty(_laatsteMelding))
                GUI.Label(new Rect(20, Screen.height - 30, 300, 24), _laatsteMelding, stijl);
        }
    }
}
