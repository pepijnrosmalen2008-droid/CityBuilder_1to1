using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 3, data model only -- geen halte-editor/heatmap, geen pathfinding voor routes,
    /// geen zichtbare voertuigen in deze pass. "voertuig: Reference<VoertuigType>" wordt hier
    /// Entity.Null totdat er een voertuig-catalogus/prefab-systeem bestaat.
    public struct LijnData : IComponentData
    {
        public LijnType Type;
        public FixedString64Bytes Naam;
        public int FrequentieMinuten;
        public Entity VoertuigType;
        public bool Actief;
    }

    public struct RouteStopBufferElement : IBufferElementData
    {
        public Entity Stopplaats;
    }

    public struct StopplaatsData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public float3 Positie;
        public Entity GekoppeldWegsegment; // Entity.Null voor treinstation
        public StopplaatsType Type;
        public int WachtendeReizigers;
    }

    /// Section 3's HalteSuggestieScore -- alleen de datavorm; de heatmap-berekening zelf
    /// (bevolking/werkgelegenheid binnen netwerk-afstand) heeft een voltooid wegennetwerk +
    /// kavel-dichtheidsdata nodig om zinvol te zijn, en komt met de halte-editor-tool.
    public struct HalteSuggestieScore
    {
        public float3 Positie;
        public int BevolkingInBereik;
        public int WerkgelegenheidInBereik;
        public float DekkingOverlap;
        public float Score;
    }
}
