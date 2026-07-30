using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 10: wegflow draait op dezelfde tick-interval capaciteitsgraaf-aanpak die Spike 2
    /// al valideerde (110-150 fps met 750 kavels + een vergelijkbaar flow-model) -- dezelfde
    /// architectuur, nu op het echte WegSegment-datamodel in plaats van synthetische data.
    ///
    /// Er bestaat nog geen echte vraagbron (bevolkingsdichtheid/bestemmingsverkeer vanuit het
    /// kavel-cluster) die hier voedt, dus HuidigeBelasting gebruikt -- net als Spike 2's
    /// TrafficFlowJob -- een tijd/positie-afhankelijke ruis als synthetische plaatsvervanger.
    /// Vervang dit zodra kavel-vraag daadwerkelijk aan het wegennetwerk gekoppeld wordt.
    [BurstCompile]
    public partial struct WegFlowJob : IJobEntity
    {
        public float Tijd;
        public float RelaxRate;
        [ReadOnly] public ComponentLookup<NetwerkNodeData> NodeLookup;

        public void Execute(ref WegSegmentData segment)
        {
            if (segment.Capaciteit <= 0)
            {
                segment.HuidigeBelasting = 0f;
                return;
            }

            float3 positie = NodeLookup.HasComponent(segment.VanNode) ? NodeLookup[segment.VanNode].Positie : float3.zero;
            float vraag = noise.snoise(new float2(positie.x * 0.01f + Tijd * 0.05f, positie.z * 0.01f)) * 0.5f + 0.5f;

            float doelBelasting = math.clamp(vraag, 0f, 1f);
            segment.HuidigeBelasting = math.lerp(segment.HuidigeBelasting, doelBelasting, RelaxRate);
        }
    }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(WegCapaciteitSystem))]
    public partial struct WegFlowSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<NetwerkTickData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            var tickEntity = SystemAPI.GetSingletonEntity<NetwerkTickData>();
            var tick = SystemAPI.GetComponentRW<NetwerkTickData>(tickEntity);

            double now = SystemAPI.Time.ElapsedTime;
            if (now < tick.ValueRO.VolgendeTick)
                return;
            tick.ValueRW.VolgendeTick = now + tick.ValueRO.TickIntervalSeconden;

            var job = new WegFlowJob
            {
                Tijd = (float)now,
                RelaxRate = 0.3f,
                NodeLookup = SystemAPI.GetComponentLookup<NetwerkNodeData>(true),
            };
            state.Dependency = job.ScheduleParallel(state.Dependency);
        }
    }
}
