using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 5: tram vereist rails + bovenleiding voordat een lijn kan rijden. Alleen aanwezig
    /// op WegSegment-entities die tram dragen (Tramstraat van meet af aan, of een retrofit).
    public struct TramInfrastructuurData : IComponentData
    {
        public bool Rails;
        public bool Bovenleiding;
        public Entity Stroombron;   // Entity.Null = geen stroom, tram kan niet rijden (Onderstation)
        public TramAanlegStatus AanlegStatus;
    }

    public struct OnderstationData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public float3 Positie;
        public float Capaciteit;
        public float Bereik;
        public Entity GekoppeldAanNet; // Entity.Null totdat er een elektriciteitsnetwerk-model is
    }

    public struct OnderstationGevoedSegmentBufferElement : IBufferElementData
    {
        public Entity Segment;
    }

    /// Los TramSegment (sectie 5, "los van WegSegment"). Voor de flow-simulatie telt dit als een
    /// gewone edge in dezelfde graaf (VanNode/NaarNode); het onderscheid met een WegSegment-
    /// tramrail-lane is puur voor snelheid/auto-capaciteit, niet voor de graaf-topologie.
    public struct TramSegmentData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public Entity VanNode;
        public Entity NaarNode;
        public HoogteProfielData HoogteProfiel;
        public bool Bovenleiding;
        public OndergrondType Ondergrond;
    }

    public enum OndergrondType : byte
    {
        Gras,
        Verhard,
        Grind,
    }

    public struct TramSegmentSplinePunt : IBufferElementData
    {
        public float3 Punt;
    }
}
