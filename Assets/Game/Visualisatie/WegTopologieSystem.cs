using Unity.Collections;
using Unity.Entities;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Visualisatie
{
    /// Graad (aantal aansluitende wegvakken) en kruispuntstraal per knoop.
    public struct KnoopVisueelData : IComponentData
    {
        public int Graad;
        public float Straal; // > 0 alleen bij een echt kruispunt (graad >= 3)
    }

    /// Tag: de wegmesh van dit segment moet opnieuw (aansluiting veranderd, dus andere inkorting).
    public struct WegHerbouwNodig : IComponentData { }

    /// Tag: de kruispuntvulling op deze knoop moet opnieuw.
    public struct KruispuntHerbouwNodig : IComponentData { }

    /// Houdt per knoop bij hoeveel wegen er samenkomen. Verandert dat (er wordt een weg
    /// aangesloten of gesplitst), dan worden de aansluitende wegvakken en de kruispuntvulling
    /// opnieuw opgebouwd -- zo kan een wegvak bij een kruispunt netjes ingekort worden en
    /// eindigen de stoepen met een band, in plaats van over het kruispunt heen te lopen.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(WegVisualisatieSystem))]
    [UpdateBefore(typeof(KruispuntVisualisatieSystem))]
    public partial struct WegTopologieSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;
            var graad = new NativeHashMap<Entity, int>(64, Allocator.Temp);
            var halveBreedte = new NativeHashMap<Entity, float>(64, Allocator.Temp);

            foreach (var (segment, lanes) in SystemAPI.Query<RefRO<WegSegmentData>, DynamicBuffer<LaneBufferElement>>())
            {
                float hb = WegProfielUtility.TotaleBreedte(lanes) * 0.5f;
                Tel(ref graad, ref halveBreedte, segment.ValueRO.VanNode, hb);
                Tel(ref graad, ref halveBreedte, segment.ValueRO.NaarNode, hb);
            }

            var gewijzigd = new NativeHashSet<Entity>(16, Allocator.Temp);
            var nieuw = new NativeList<Entity>(Allocator.Temp);
            var nieuweData = new NativeList<KnoopVisueelData>(Allocator.Temp);
            var aangepast = new NativeList<Entity>(Allocator.Temp);
            var aangepasteData = new NativeList<KnoopVisueelData>(Allocator.Temp);

            foreach (var (knoopData, entity) in SystemAPI.Query<RefRO<NetwerkNodeData>>().WithEntityAccess())
            {
                int g = graad.TryGetValue(entity, out int gg) ? gg : 0;
                float straal = g >= 3 && halveBreedte.TryGetValue(entity, out float hb) ? hb + 1.5f : 0f;
                var data = new KnoopVisueelData { Graad = g, Straal = straal };

                if (!em.HasComponent<KnoopVisueelData>(entity))
                {
                    nieuw.Add(entity);
                    nieuweData.Add(data);
                    gewijzigd.Add(entity);
                    continue;
                }

                var oud = em.GetComponentData<KnoopVisueelData>(entity);
                if (oud.Graad != g || UnityEngine.Mathf.Abs(oud.Straal - straal) > 0.01f)
                {
                    aangepast.Add(entity);
                    aangepasteData.Add(data);
                    gewijzigd.Add(entity);
                }
            }

            for (int i = 0; i < nieuw.Length; i++)
                em.AddComponentData(nieuw[i], nieuweData[i]);
            for (int i = 0; i < aangepast.Length; i++)
                em.SetComponentData(aangepast[i], aangepasteData[i]);

            if (!gewijzigd.IsEmpty)
            {
                var segmenten = new NativeList<Entity>(Allocator.Temp);
                foreach (var (segment, entity) in SystemAPI.Query<RefRO<WegSegmentData>>().WithEntityAccess())
                {
                    if (gewijzigd.Contains(segment.ValueRO.VanNode) || gewijzigd.Contains(segment.ValueRO.NaarNode))
                        segmenten.Add(entity);
                }
                foreach (var s in segmenten)
                    if (!em.HasComponent<WegHerbouwNodig>(s)) em.AddComponent<WegHerbouwNodig>(s);
                foreach (var knoop in gewijzigd)
                    if (!em.HasComponent<KruispuntHerbouwNodig>(knoop)) em.AddComponent<KruispuntHerbouwNodig>(knoop);
                segmenten.Dispose();
            }

            graad.Dispose();
            halveBreedte.Dispose();
            gewijzigd.Dispose();
            nieuw.Dispose();
            nieuweData.Dispose();
            aangepast.Dispose();
            aangepasteData.Dispose();
        }

        static void Tel(ref NativeHashMap<Entity, int> graad, ref NativeHashMap<Entity, float> breedte, Entity knoop, float hb)
        {
            if (knoop == Entity.Null) return;
            graad[knoop] = graad.TryGetValue(knoop, out int g) ? g + 1 : 1;
            breedte[knoop] = breedte.TryGetValue(knoop, out float b) ? UnityEngine.Mathf.Max(b, hb) : hb;
        }
    }
}
