using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;
using CityBuilder.Game.Visualisatie.Procedureel;

namespace CityBuilder.Game.Visualisatie
{
    /// Vult elk echt kruispunt (3 of meer aansluitende wegen) met een asfaltvlak. De wegvakken
    /// zelf zijn daar ingekort (WegMeshBouwer), zodat stoepen met een band eindigen en de
    /// zebrapaden net buiten het kruisingsvlak liggen. Bij een gewone doorgaande knoop (graad 2)
    /// lopen de wegvakken gewoon in elkaar over en is er geen vulling nodig.
    static class KruispuntRegister
    {
        public static readonly Dictionary<Entity, GameObject> Objecten = new Dictionary<Entity, GameObject>();
        public static Transform Ouder;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset()
        {
            Objecten.Clear();
            Ouder = null;
        }
    }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct KruispuntVisualisatieSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;
            var werk = new NativeList<Entity>(Allocator.Temp);
            foreach (var (knoopData, entity) in SystemAPI.Query<RefRO<KnoopVisueelData>>().WithAll<KruispuntHerbouwNodig>().WithEntityAccess())
                werk.Add(entity);

            foreach (var knoop in werk)
            {
                if (KruispuntRegister.Objecten.TryGetValue(knoop, out var oud))
                {
                    if (oud != null) Object.Destroy(oud);
                    KruispuntRegister.Objecten.Remove(knoop);
                }

                var data = em.GetComponentData<KnoopVisueelData>(knoop);
                if (data.Graad >= 3 && data.Straal > 0f && em.HasComponent<NetwerkNodeData>(knoop))
                {
                    if (KruispuntRegister.Ouder == null) KruispuntRegister.Ouder = new GameObject("Kruispunten").transform;
                    var pos = em.GetComponentData<NetwerkNodeData>(knoop).Positie;
                    KruispuntRegister.Objecten[knoop] = Bouw(new Vector3(pos.x, pos.y, pos.z), data.Straal, KruispuntRegister.Ouder);
                }

                em.RemoveComponent<KruispuntHerbouwNodig>(knoop);
            }
            werk.Dispose();
        }

        static GameObject Bouw(Vector3 midden, float straal, Transform ouder)
        {
            const int segmenten = 32;
            var mb = new MeshBouwer();
            float y0 = TerreinHoogte.Op(midden.x, midden.z) + 0.065f;
            var c = new Vector3(midden.x, y0, midden.z);
            for (int i = 0; i < segmenten; i++)
            {
                float a0 = (float)i / segmenten * Mathf.PI * 2f, a1 = (float)(i + 1) / segmenten * Mathf.PI * 2f;
                var p0 = midden + new Vector3(Mathf.Cos(a0), 0f, Mathf.Sin(a0)) * straal;
                var p1 = midden + new Vector3(Mathf.Cos(a1), 0f, Mathf.Sin(a1)) * straal;
                p0.y = TerreinHoogte.Op(p0.x, p0.z) + 0.065f;
                p1.y = TerreinHoogte.Op(p1.x, p1.z) + 0.065f;
                mb.Driehoek(Materialen.Asfalt, c, p0, p1,
                    new Vector2(c.x, c.z) / 4f, new Vector2(p0.x, p0.z) / 4f, new Vector2(p1.x, p1.z) / 4f, Vector3.up);
            }
            return mb.BouwObject("Kruispunt", ouder, Vector3.zero, false);
        }
    }
}
