using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Visualisatie
{
    /// Tag: dit wegsegment heeft een visueel object (zie WegVisueelRegister).
    public struct WegVisueelGemaakt : IComponentData { }

    /// Welke GameObjects bij welk wegsegment horen. Zo kunnen de speltools (splitsen, upgraden)
    /// het oude object opruimen zonder op naam te zoeken.
    public static class WegVisueelRegister
    {
        public static readonly Dictionary<Entity, GameObject> Objecten = new Dictionary<Entity, GameObject>();
        static Transform _ouder;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset()
        {
            Objecten.Clear();
            _ouder = null;
        }

        public static Transform Ouder
        {
            get
            {
                if (_ouder == null)
                    _ouder = new GameObject("Wegen").transform;
                return _ouder;
            }
        }

        public static void Verwijder(Entity segment)
        {
            if (Objecten.TryGetValue(segment, out var go))
            {
                if (go != null) Object.Destroy(go);
                Objecten.Remove(segment);
            }
        }
    }

    /// Maakt per wegsegment het visuele object (WegMeshBouwer) en bouwt het opnieuw zodra
    /// WegTopologieSystem meldt dat de aansluitingen veranderd zijn.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct WegVisualisatieSystem : ISystem
    {
        int _frame;

        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;

            var herbouw = new NativeList<Entity>(Allocator.Temp);
            foreach (var (segment, entity) in SystemAPI.Query<RefRO<WegSegmentData>>().WithAll<WegHerbouwNodig>().WithEntityAccess())
                herbouw.Add(entity);
            foreach (var e in herbouw)
            {
                WegVisueelRegister.Verwijder(e);
                if (em.HasComponent<WegVisueelGemaakt>(e)) em.RemoveComponent<WegVisueelGemaakt>(e);
                em.RemoveComponent<WegHerbouwNodig>(e);
            }
            herbouw.Dispose();

            var nieuw = new NativeList<Entity>(Allocator.Temp);
            foreach (var (segment, entity) in SystemAPI.Query<RefRO<WegSegmentData>>().WithNone<WegVisueelGemaakt>().WithEntityAccess())
                nieuw.Add(entity);

            foreach (var e in nieuw)
            {
                WegVisueelRegister.Verwijder(e);
                var go = WegMeshBouwer.Bouw(em, e, WegVisueelRegister.Ouder);
                if (go != null)
                    WegVisueelRegister.Objecten[e] = go;
                em.AddComponent<WegVisueelGemaakt>(e);
            }
            nieuw.Dispose();

            // Opruimen: objecten van segmenten die niet meer bestaan (bijv. na een splitsing).
            if (++_frame % 60 == 0 && WegVisueelRegister.Objecten.Count > 0)
            {
                var weg = new List<Entity>();
                foreach (var kv in WegVisueelRegister.Objecten)
                    if (!em.Exists(kv.Key)) weg.Add(kv.Key);
                foreach (var e in weg)
                    WegVisueelRegister.Verwijder(e);
            }
        }
    }
}
