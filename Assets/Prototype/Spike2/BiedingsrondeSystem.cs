using Unity.Collections;
using Unity.Entities;

namespace CityBuilder.Prototype.Spike2
{
    /// Event-driven (reacts to BiedingVereist, added on a kavel status change) and batch-limited
    /// to Spike2Config.MaxBiedingenPerTick per section 3. Not Burst-compiled: this touches
    /// developer entity data directly via EntityManager and is comparatively low-volume (at most
    /// MaxBiedingenPerTick kavels resolved per tick), so plain C# is simpler and safe here.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct BiedingsrondeSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var developerQuery = SystemAPI.QueryBuilder().WithAll<ProjectontwikkelaarData>().Build();
            var developers = developerQuery.ToComponentDataArray<ProjectontwikkelaarData>(Allocator.Temp);
            var developerEntities = developerQuery.ToEntityArray(Allocator.Temp);

            if (developers.Length == 0)
            {
                developers.Dispose();
                developerEntities.Dispose();
                return;
            }

            int processed = 0;
            var toClearTag = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, entity) in SystemAPI.Query<RefRW<KavelData>>().WithAll<BiedingVereist>().WithEntityAccess())
            {
                if (processed >= Spike2Config.MaxBiedingenPerTick)
                    break;

                // Simpele score: hoger risicoprofiel + hogere grondwaarde-tolerantie wint,
                // begrensd door beschikbaar budget.
                int bestIdx = -1;
                float bestScore = float.MinValue;
                for (int i = 0; i < developers.Length; i++)
                {
                    var dev = developers[i];
                    if (dev.Budget < kavel.ValueRO.ResiduleGrondwaarde)
                        continue;

                    float score = dev.RisicoProfiel * kavel.ValueRO.ResiduleGrondwaarde - dev.Budget * 0.001f;
                    if (score > bestScore)
                    {
                        bestScore = score;
                        bestIdx = i;
                    }
                }

                if (bestIdx >= 0)
                {
                    var k = kavel.ValueRO;
                    k.HuidigeEigenaarIndex = bestIdx;
                    k.Status = OntwikkelStatus.Gegund;
                    kavel.ValueRW = k;

                    var dev = developers[bestIdx];
                    dev.Budget -= k.ResiduleGrondwaarde;
                    dev.ActieveBiedingen += 1;
                    developers[bestIdx] = dev;
                    state.EntityManager.SetComponentData(developerEntities[bestIdx], dev);
                }

                toClearTag.Add(entity);
                processed++;
            }

            foreach (var e in toClearTag)
                state.EntityManager.RemoveComponent<BiedingVereist>(e);

            toClearTag.Dispose();
            developers.Dispose();
            developerEntities.Dispose();
        }
    }
}
