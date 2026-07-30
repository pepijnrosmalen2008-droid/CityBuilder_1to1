using Unity.Collections;
using Unity.Entities;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 1: "capaciteit: int, afgeleid van lane-samenstelling". Event-driven op
    /// CapaciteitDirty, net als het kavel-cluster -- alleen herrekend bij creatie of een
    /// lane-wijziging (tram-retrofit), niet elke frame.
    public static class WegCapaciteitConstanten
    {
        // Voertuigen/uur die een lane-type aan doorstroom bijdraagt. Placeholder-cijfers, geen
        // verkeerskundige referentie -- retune zodra er echte tellingen/normen zijn.
        public static int CapaciteitPerUur(LaneType type) => type switch
        {
            LaneType.Autorijbaan => 800,
            LaneType.Busbaan => 800,
            LaneType.GedeeldeBaan => 600, // gedeeld met fiets, dus lager dan een pure autorijbaan
            LaneType.Tramrail => 0,        // draagt niet bij aan autocapaciteit
            LaneType.Fietspad => 0,
            LaneType.Trottoir => 0,
            _ => 0,
        };
    }

    public partial struct WegCapaciteitSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var toClear = new NativeList<Entity>(Allocator.Temp);

            foreach (var (segment, lanes, entity) in SystemAPI.Query<RefRW<WegSegmentData>, DynamicBuffer<LaneBufferElement>>()
                         .WithAll<CapaciteitDirty>().WithEntityAccess())
            {
                int totaal = 0;
                for (int i = 0; i < lanes.Length; i++)
                    totaal += WegCapaciteitConstanten.CapaciteitPerUur(lanes[i].Type);

                segment.ValueRW.Capaciteit = totaal;
                toClear.Add(entity);
            }

            foreach (var e in toClear)
                state.EntityManager.RemoveComponent<CapaciteitDirty>(e);

            toClear.Dispose();
        }
    }
}
