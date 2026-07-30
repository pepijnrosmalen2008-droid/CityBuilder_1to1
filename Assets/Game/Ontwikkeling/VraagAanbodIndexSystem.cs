using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Ontwikkeling
{
    public static class VraagAanbodConstanten
    {
        public const float MinPrijsMultiplier = 0.5f;
        public const float MaxPrijsMultiplier = 2f;
    }

    /// Event-driven op VraagAanbodIndexDirty, zelfde stijl als de rest van dit cluster.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct VraagAanbodIndexSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var toClear = new NativeList<Entity>(Allocator.Temp);

            foreach (var (index, entity) in SystemAPI.Query<RefRW<VraagAanbodIndexData>>().WithAll<VraagAanbodIndexDirty>().WithEntityAccess())
            {
                float verhouding;
                if (index.ValueRO.Aanbod > 0f)
                    verhouding = index.ValueRO.Vraag / index.ValueRO.Aanbod;
                else
                    verhouding = index.ValueRO.Vraag > 0f ? VraagAanbodConstanten.MaxPrijsMultiplier * 2f : 1f;

                index.ValueRW.Verhouding = verhouding;
                index.ValueRW.PrijsMultiplier = math.clamp(verhouding, VraagAanbodConstanten.MinPrijsMultiplier, VraagAanbodConstanten.MaxPrijsMultiplier);
                toClear.Add(entity);
            }

            foreach (var e in toClear)
                state.EntityManager.RemoveComponent<VraagAanbodIndexDirty>(e);

            toClear.Dispose();
        }
    }
}
