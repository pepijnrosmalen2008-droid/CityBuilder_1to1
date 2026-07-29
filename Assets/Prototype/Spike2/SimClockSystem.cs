using Unity.Entities;

namespace CityBuilder.Prototype.Spike2
{
    /// Drives the in-game day counter that VraagAanbodSystem reacts to. Runs in
    /// InitializationSystemGroup so its value is fresh before any SimulationSystemGroup system
    /// reads it later in the same frame. Deliberately not Burst-compiled: this is O(1) per frame
    /// and occasionally performs a structural change (adding NieuweDagEvent), which plain C# does
    /// without any of the EntityManager-inside-Burst caveats.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct SimClockSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SimClockData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            var clockEntity = SystemAPI.GetSingletonEntity<SimClockData>();
            var clock = SystemAPI.GetComponentRW<SimClockData>(clockEntity);

            clock.ValueRW.ElapsedRealSeconds += SystemAPI.Time.DeltaTime;

            int nieuweDag = (int)(clock.ValueRO.ElapsedRealSeconds / Spike2Config.SecondenPerDag);
            if (nieuweDag > clock.ValueRO.HuidigeDag)
            {
                clock.ValueRW.HuidigeDag = nieuweDag;
                if (!state.EntityManager.HasComponent<NieuweDagEvent>(clockEntity))
                    state.EntityManager.AddComponent<NieuweDagEvent>(clockEntity);
            }
        }
    }
}
