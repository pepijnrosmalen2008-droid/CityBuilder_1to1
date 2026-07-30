using Unity.Entities;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 8: "hergebruikt de bestaande graaf en flow-logica, geen nieuw systeem". No vehicle
    /// AI/pathing here (that's the deferred "zichtbare voertuigen" category from section 3/9) --
    /// just the data + a small modifier on top of WegFlowSystem's output.
    public struct SneeuwSchuifSysteemData : IComponentData
    {
        public bool Actief; // getriggerd door weer-state (winter + sneeuwval) -- weer-state zelf bestaat nog niet
        public SneeuwRouteStrategie RouteStrategie;
    }

    /// Optioneel op een WegSegment-entity: alleen aanwezig als er daadwerkelijk sneeuw ligt.
    /// Afwezig = geen effect, geen kost om te checken voor de meeste segmenten.
    public struct WegSneeuwData : IComponentData
    {
        public float SneeuwNiveau; // 0 = schoon, 1 = zwaar ondergesneeuwd
    }

    /// Section 8's SneeuwEconomieEffect. Puur data -- de koppeling naar de kavel-cluster
    /// (energiekosten -> nutsvoorzieningen, bouwvertraging -> Bouwplaats-status) is nog niet
    /// bedraad, dat is een integratiestap voor zodra dat cluster er behoefte aan heeft.
    public struct SneeuwEconomieEffectData : IComponentData
    {
        public float EnergiekostenMultiplier;
        public float DetailhandelOmzetMultiplier;
        public float WegonderhoudKosten;
        public float BouwvertragingMultiplier;
    }

    /// "Sneeuw op een segment verlaagt tijdelijk de effectieve capaciteit/snelheid, net als een
    /// file" -- gemodelleerd als een multiplier bovenop WegFlowSystem's uitkomst, niet als een
    /// aparte capaciteitswaarde, zodat WegCapaciteitSystem's berekening (uit lane-samenstelling)
    /// niet vervuild raakt met een tijdelijke, weersafhankelijke factor.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(WegFlowSystem))]
    public partial struct WegSneeuwEffectSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            foreach (var (segment, sneeuw) in SystemAPI.Query<RefRW<WegSegmentData>, RefRO<WegSneeuwData>>())
            {
                float factor = 1f + sneeuw.ValueRO.SneeuwNiveau * 0.7f;
                segment.ValueRW.HuidigeBelasting = Unity.Mathematics.math.clamp(segment.ValueRO.HuidigeBelasting * factor, 0f, 1f);
            }
        }
    }
}
