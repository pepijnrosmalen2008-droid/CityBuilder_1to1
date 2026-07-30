using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Kavellen
{
    /// "oppervlakte: float (m2, afgeleid uit geometrie)" -- section 1. Event-driven off the
    /// GeometrieDirty tag rather than every frame, same pattern as the water/traffic systems in
    /// Spike 2: recompute only changes when the polygon itself changes.
    public partial struct KavelOppervlakteSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var toClear = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, punten, entity) in SystemAPI.Query<RefRW<KavelCore>, DynamicBuffer<KavelGeometriePunt>>()
                         .WithAll<GeometrieDirty>().WithEntityAccess())
            {
                kavel.ValueRW.Oppervlakte = ShoelaceOppervlakte(punten);
                toClear.Add(entity);
            }

            foreach (var e in toClear)
            {
                state.EntityManager.RemoveComponent<GeometrieDirty>(e);
                if (!state.EntityManager.HasComponent<GrondwaardeDirty>(e))
                    state.EntityManager.AddComponent<GrondwaardeDirty>(e);
            }

            toClear.Dispose();
        }

        /// Shoelace formula, absolute value (winding-order-independent). Assumes a simple
        /// (non-self-intersecting) polygon, which is what a perceelgrens should always be.
        public static float ShoelaceOppervlakte(DynamicBuffer<KavelGeometriePunt> punten)
        {
            if (punten.Length < 3)
                return 0f;

            float som = 0f;
            for (int i = 0; i < punten.Length; i++)
            {
                float2 a = punten[i].Punt;
                float2 b = punten[(i + 1) % punten.Length].Punt;
                som += a.x * b.y - b.x * a.y;
            }
            return math.abs(som) * 0.5f;
        }
    }
}
