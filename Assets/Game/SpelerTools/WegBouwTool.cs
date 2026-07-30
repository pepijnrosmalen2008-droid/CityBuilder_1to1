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
    /// Zodra een segment klaar is, genereert deze tool meteen kavels langs de nieuwe weg via de
    /// al bestaande KavelGeneratieUtility (doc 07) -- net als in Cities Skylines maakt een nieuw
    /// getekende weg de aangrenzende grond direct bebouwbaar, geen aparte zoneer-stap nodig.
    [AddComponentMenu("City Builder/Weg Bouw Tool")]
    public class WegBouwTool : MonoBehaviour
    {
        public float snapAfstand = 8f;
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
                _startPunt = SnapNaarBestaandeNode(hitPunt);
                _bezigMetTekenen = true;
                _preview.enabled = true;
            }
            else if (_bezigMetTekenen && Input.GetMouseButtonUp(0))
            {
                Vector3 eindPunt = SnapNaarBestaandeNode(hitPunt);
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
                Vector3 eindPunt = SnapNaarBestaandeNode(hitPunt);
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

        Vector3 SnapNaarBestaandeNode(Vector3 punt)
        {
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;
            var query = em.CreateEntityQuery(typeof(NetwerkNodeData));
            var nodes = query.ToComponentDataArray<NetwerkNodeData>(Allocator.Temp);

            Vector3 beste = punt;
            float besteAfstand = snapAfstand;
            for (int i = 0; i < nodes.Length; i++)
            {
                Vector3 nodePos = new Vector3(nodes[i].Positie.x, nodes[i].Positie.y, nodes[i].Positie.z);
                float afstand = Vector3.Distance(punt, nodePos);
                if (afstand < besteAfstand)
                {
                    besteAfstand = afstand;
                    beste = nodePos;
                }
            }
            nodes.Dispose();
            return beste;
        }

        void MaakWegsegment(Vector3 start, Vector3 eind)
        {
            var em = World.DefaultGameObjectInjectionWorld.EntityManager;

            Entity vanNode = VindOfMaakNode(em, start);
            Entity naarNode = VindOfMaakNode(em, eind);

            Entity segment = em.CreateEntity(typeof(WegSegmentData), typeof(WegSegmentSplinePunt), typeof(LaneBufferElement), typeof(CapaciteitDirty));

            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            spline.Add(new WegSegmentSplinePunt { Punt = new float3(start.x, start.y, start.z) });
            spline.Add(new WegSegmentSplinePunt { Punt = new float3(eind.x, eind.y, eind.z) });

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

        Entity VindOfMaakNode(EntityManager em, Vector3 positie)
        {
            var query = em.CreateEntityQuery(typeof(NetwerkNodeData));
            var entiteiten = query.ToEntityArray(Allocator.Temp);
            var data = query.ToComponentDataArray<NetwerkNodeData>(Allocator.Temp);

            Entity gevonden = Entity.Null;
            for (int i = 0; i < data.Length; i++)
            {
                Vector3 nodePos = new Vector3(data[i].Positie.x, data[i].Positie.y, data[i].Positie.z);
                if (Vector3.Distance(nodePos, positie) < 0.5f)
                {
                    gevonden = entiteiten[i];
                    break;
                }
            }
            entiteiten.Dispose();
            data.Dispose();

            if (gevonden != Entity.Null)
                return gevonden;

            Entity node = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(node, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = new float3(positie.x, positie.y, positie.z) });
            return node;
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
