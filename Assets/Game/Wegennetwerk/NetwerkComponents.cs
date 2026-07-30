using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Section 1: "een graaf, meerdere lagen". Kruispunt/Stopplaats/StationOffMapConnector/Wissel
    /// zijn allemaal gewoon NetwerkNodeData -- het onderscheid zit in NodeType, niet in aparte
    /// component-types, zodat WegSegment/RailSegment naar elk knooppunt hetzelfde soort
    /// Entity-referentie kunnen gebruiken.
    public struct NetwerkNodeData : IComponentData
    {
        public NodeType Type;
        public float3 Positie;
    }

    /// Nested plain struct (geen eigen IComponentData) -- blittable, ingebed in WegSegmentData.
    public struct HoogteProfielData
    {
        public HoogteProfielModus Modus;
        public float HoogteOffset;
        public float OvergangsLengte;
    }

    /// Section 1's WegSegment. `Id` is voluit `Unity.Entities.Hash128` gequalificeerd -- zowel
    /// Unity.Entities als UnityEngine declareren een Hash128-type, dus de bare naam is ambigu
    /// zodra beide namespaces in beeld zijn (zie de Kavel-fix in commit 57a9d01).
    public struct WegSegmentData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public WegTypeId WegType;
        public Entity VanNode;
        public Entity NaarNode;
        public int Capaciteit;             // afgeleid van lane-samenstelling, zie WegCapaciteitSystem
        public int Snelheidslimiet;
        public float HuidigeBelasting;      // 0-1, output van WegFlowSystem, ververst per tick
        public HoogteProfielData HoogteProfiel;
        public bool HeeftBusoverlay;         // section 1: geen aparte lane, wel een vlag
    }

    public struct WegSegmentSplinePunt : IBufferElementData
    {
        public float3 Punt;
    }

    public struct LaneBufferElement : IBufferElementData
    {
        public LaneType Type;
        public LaneRichting Richting;
        public float BreedteMeter;
    }

    /// Tag: lane-samenstelling is gewijzigd (initiële creatie, tram-retrofit), Capaciteit moet
    /// herrekend worden.
    public struct CapaciteitDirty : IComponentData { }

    public struct NetwerkTickData : IComponentData
    {
        public double VolgendeTick;
        public double TickIntervalSeconden;
    }
}
