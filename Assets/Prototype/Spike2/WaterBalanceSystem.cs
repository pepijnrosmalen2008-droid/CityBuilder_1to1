using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Prototype.Spike2
{
    /// Event-driven per section 2: only recomputes water bodies carrying the WaterDirty tag,
    /// never every water body every frame. Structural changes (adding/removing the tag) are
    /// deferred into NativeLists and applied after each foreach completes -- mutating a
    /// SystemAPI.Query's component values mid-iteration is fine, but adding/removing components
    /// (a structural change) while the same query is being enumerated is not.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct WaterBalanceSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;

            var toClear = new NativeList<Entity>(Allocator.Temp);
            foreach (var (water, entity) in SystemAPI.Query<RefRW<WaterLichaamData>>().WithAll<WaterDirty>().WithEntityAccess())
            {
                var w = water.ValueRO;
                w.Peil = math.clamp(w.Peil + (w.Inflow - w.Outflow) * dt, 0f, w.Capaciteit);
                water.ValueRW = w;
                toClear.Add(entity);
            }
            foreach (var e in toClear)
                state.EntityManager.RemoveComponent<WaterDirty>(e);
            toClear.Dispose();

            // Synthetische events: zonder een gameplay-trigger simuleren we af en toe een
            // wijziging (regenval, onttrekking) zodat dit System herhaaldelijk iets te doen
            // krijgt tijdens een meerdaagse testrun, in plaats van na frame 1 stil te vallen.
            var random = Unity.Mathematics.Random.CreateFromIndex((uint)(SystemAPI.Time.ElapsedTime * 991.0) + 7u);
            var toMark = new NativeList<Entity>(Allocator.Temp);
            foreach (var (water, entity) in SystemAPI.Query<RefRO<WaterLichaamData>>().WithNone<WaterDirty>().WithEntityAccess())
            {
                if (random.NextFloat() < 0.02f)
                    toMark.Add(entity);
            }
            foreach (var e in toMark)
                state.EntityManager.AddComponent<WaterDirty>(e);
            toMark.Dispose();
        }
    }
}
