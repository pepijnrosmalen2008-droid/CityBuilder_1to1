using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 4. `Wissel` krijgt geen eigen component -- de doc zegt het zelf al: "functioneel
    /// gelijk aan een Kruispunt, maar voor rails, geen conflict-simulatie nodig". Dat is precies
    /// NetwerkNodeData met Type = NodeType.Wissel, geen nieuw datatype nodig.
    public struct RailSegmentData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public Entity VanNode;   // Station, Wissel, of doorgaand tracé-eindpunt
        public Entity NaarNode;
        public int MaxSnelheid;
        public HoogteProfielData HoogteProfiel; // hergebruik -- bruggen/tunnels werken hetzelfde als bij wegen
    }

    public struct RailSegmentSplinePunt : IBufferElementData
    {
        public float3 Punt;
    }

    /// "alleen Groot-stations" -- of een station Groot of Klein is, blijkt dus uit de aan-/
    /// afwezigheid van dit component op de Stopplaats-entity, niet uit een los veld.
    public struct StationOffMapConnectorData : IComponentData
    {
        public Entity GekoppeldStation; // moet een Stopplaats met StopplaatsType.TreinStation zijn
        public int InstroomCapaciteit;   // reizigers/uur die de stad in kunnen
        public float VraagMultiplier;
    }

    /// Section 4's KanStationPlaatsen. AlgemeneRuimteValidatie (overlap met bestaande objecten
    /// etc.) hoort bij een generieke plaatsingstool die nog niet bestaat -- Klein-stations
    /// worden hier dus altijd toegestaan totdat die tool er is, niet stilzwijgend beperkt.
    public static class StationPlaatsingUtility
    {
        public static bool KanStationPlaatsen(EntityManager em, StationType type, int kaartLimietGroteStations)
        {
            if (type == StationType.Groot)
            {
                int aantalBestaand = em.CreateEntityQuery(typeof(StationOffMapConnectorData)).CalculateEntityCount();
                return aantalBestaand < kaartLimietGroteStations;
            }

            return true; // AlgemeneRuimteValidatie: nog niet geïmplementeerd, zie doc-commentaar hierboven
        }
    }
}
