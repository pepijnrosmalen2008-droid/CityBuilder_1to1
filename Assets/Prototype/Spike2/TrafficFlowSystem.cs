using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Prototype.Spike2
{
    /// Section 0's pathfinding lesson from the CS2 autopsy: this uses a macro capacity-graph
    /// flow model instead of per-vehicle pathfinding, and runs it as a Burst-compiled job so it
    /// benefits from the Job System's multithreading, per section 2/3.
    [BurstCompile]
    public partial struct TrafficFlowJob : IJobEntity
    {
        public float Time;
        public float RelaxRate;

        public void Execute(in WegNodeData node, ref DynamicBuffer<WegSegmentBuffer> segments)
        {
            for (int i = 0; i < segments.Length; i++)
            {
                var seg = segments[i];
                // Synthetisch verkeer: een simpele, tijd- en positie-afhankelijke ruis staat in
                // voor echte vraag/aanbod-gedreven flow, wat voor deze CPU-spike niet nodig is.
                float demand = noise.snoise(new float2(node.Positie.x * 0.01f + Time * 0.05f, node.Positie.z * 0.01f)) * 0.5f + 0.5f;
                float target = seg.Capaciteit * demand;
                seg.HuidigeFlow = math.lerp(seg.HuidigeFlow, target, RelaxRate);
                segments[i] = seg;
            }
        }
    }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct TrafficFlowSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SimClockData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            var clockEntity = SystemAPI.GetSingletonEntity<SimClockData>();
            var clock = SystemAPI.GetComponentRW<SimClockData>(clockEntity);

            double now = clock.ValueRO.ElapsedRealSeconds;
            if (now < clock.ValueRO.VolgendeTrafficTick)
                return;

            clock.ValueRW.VolgendeTrafficTick = now + Spike2Config.TrafficTickInterval;

            var job = new TrafficFlowJob { Time = (float)now, RelaxRate = 0.3f };
            state.Dependency = job.ScheduleParallel(state.Dependency);
        }
    }
}
