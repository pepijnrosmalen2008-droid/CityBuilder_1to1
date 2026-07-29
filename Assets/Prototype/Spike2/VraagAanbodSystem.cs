using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace CityBuilder.Prototype.Spike2
{
    /// Single-threaded on purpose (not IJobEntity/parallel): this only runs once per in-game
    /// day, so there is no perf reason to risk a parallel scatter-gather over district sums.
    /// Still Burst-compiled per section 3 -- it's the "zwaardere berekening" for this system,
    /// just not one that needs multithreading at this frequency.
    [BurstCompile]
    struct VraagAanbodJob : IJob
    {
        [ReadOnly] public NativeArray<KavelData> Kavels;
        public NativeArray<float> DistrictVraagSom;
        public NativeArray<int> DistrictKavelCount;

        public void Execute()
        {
            for (int i = 0; i < Kavels.Length; i++)
            {
                var k = Kavels[i];
                DistrictKavelCount[k.DistrictId] += 1;
                // Synthetische vraag-proxy: voltooide kavels tellen als "vervulde vraag".
                float vraagWaarde = k.Status == OntwikkelStatus.Voltooid ? 1f : 0.3f;
                DistrictVraagSom[k.DistrictId] += vraagWaarde;
            }
        }
    }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct VraagAanbodSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SimClockData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            var clockEntity = SystemAPI.GetSingletonEntity<SimClockData>();
            if (!state.EntityManager.HasComponent<NieuweDagEvent>(clockEntity))
                return;

            state.EntityManager.RemoveComponent<NieuweDagEvent>(clockEntity);

            RecomputeDistricts(ref state);
            TriggerRedevelopment(ref state);
        }

        void RecomputeDistricts(ref SystemState state)
        {
            var kavelQuery = SystemAPI.QueryBuilder().WithAll<KavelData>().Build();
            var kavels = kavelQuery.ToComponentDataArray<KavelData>(Allocator.TempJob);

            var vraagSom = new NativeArray<float>(Spike2Config.DistrictCount, Allocator.TempJob);
            var kavelCount = new NativeArray<int>(Spike2Config.DistrictCount, Allocator.TempJob);

            new VraagAanbodJob { Kavels = kavels, DistrictVraagSom = vraagSom, DistrictKavelCount = kavelCount }
                .Schedule()
                .Complete();

            foreach (var districtData in SystemAPI.Query<RefRW<DistrictData>>())
            {
                int id = districtData.ValueRO.DistrictId;
                int count = kavelCount[id];
                districtData.ValueRW.KavelCount = count;
                districtData.ValueRW.VraagAanbodIndex = count > 0 ? vraagSom[id] / count : 0f;
            }

            kavels.Dispose();
            vraagSom.Dispose();
            kavelCount.Dispose();
        }

        /// Section 3's event-driven trigger for BiedingsrondeSystem: without some ongoing source
        /// of status changes, the bidding round would only ever fire once (at world generation)
        /// and the spike couldn't validate its cost across "een aantal in-game dagen" as step 8
        /// asks for. A small, low-probability redevelopment chance keeps the pipeline exercised.
        void TriggerRedevelopment(ref SystemState state)
        {
            var random = Unity.Mathematics.Random.CreateFromIndex((uint)(SystemAPI.Time.ElapsedTime * 997.0) + 1u);
            var toFlag = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, entity) in SystemAPI.Query<RefRO<KavelData>>().WithNone<BiedingVereist>().WithEntityAccess())
            {
                if (kavel.ValueRO.Status != OntwikkelStatus.Voltooid) continue;
                if (random.NextFloat() < 0.02f)
                    toFlag.Add(entity);
            }

            foreach (var e in toFlag)
            {
                var kavel = state.EntityManager.GetComponentData<KavelData>(e);
                kavel.Status = OntwikkelStatus.BeschikbaarVoorBod;
                state.EntityManager.SetComponentData(e, kavel);
                state.EntityManager.AddComponent<BiedingVereist>(e);
            }

            toFlag.Dispose();
        }
    }
}
