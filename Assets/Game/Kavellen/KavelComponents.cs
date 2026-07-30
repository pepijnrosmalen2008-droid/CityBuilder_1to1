using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Kavellen
{
    /// Section 1's core Kavel entity. `Bestemmingsplan`, `Gebouw` and `Ontsluiting` are Entity
    /// references (Entity.Null = "not set", matching the doc's nullable Reference<T> fields).
    /// `Gebouw` stays a bare Entity reference until the gebouw-generator exists (out of scope
    /// here). `DistrictId` isn't in the doc's Kavel field list, but section 6's per-district tick
    /// requires a cheap district lookup per kavel -- deriving district membership from geometry
    /// on every tick would defeat the point of that performance pattern, so it's added here.
    public struct KavelCore : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public int DistrictId;
        public float Oppervlakte;              // m^2, derived from Geometrie -- see KavelOppervlakteSystem
        public float Marktwaarde;               // grondwaarde, zie GrondwaardeSystem
        public BouwPeriode BouwPeriode;
        public Entity Bestemmingsplan;          // Entity.Null = geen plan toegewezen
        public float BebouwingspercentageMax;   // effectieve waarde voor deze kavel (doorgaans overgenomen van het bestemmingsplan)
        public float BouwhoogteMax;
        public KavelStatus Status;
        public Entity Gebouw;                   // Entity.Null = onbebouwd
        public Entity Ontsluiting;              // Entity.Null = geen wegtoegang -> kan nooit Bouwkavel worden
    }

    public struct KavelEigenaarData : IComponentData
    {
        public EigenaarType Type;
        public Entity OwnerEntity; // Entity.Null tenzij Type == Projectontwikkelaar (of later Speler/Gemeente-singletons)
    }

    public struct NutsvoorzieningenData : IComponentData
    {
        public bool Water;
        public bool Elektriciteit;
        public bool Riolering;
        public bool Internet;
    }

    /// Sectie 5. `afstand_voorzieningen` (de Map<VoorzieningType,float> uit de spec) zit als
    /// aparte DynamicBuffer op de entity, niet hier -- Maps zijn niet blittable/ECS-vriendelijk.
    public struct OmgevingsfactorenData : IComponentData
    {
        public float BereikbaarheidScore;
        public float UitzichtScore;
        public float GeluidsbelastingDb;
        public float LuchtkwaliteitIndex;
        public float OverstromingsrisicoScore;
        public Bodemkwaliteit Bodemkwaliteit;
    }

    public struct VoorzieningAfstandBufferElement : IBufferElementData
    {
        public VoorzieningType Type;
        public float AfstandMeter;
    }

    /// Audit trail (sectie 1: `historie: List<KavelEvent>`). Bewust minimaal (geen vrije payload)
    /// om blittable/ECS-vriendelijk te blijven -- events zijn zelfverklarend genoeg via het type
    /// + tijdstip, en de betrokken velden zijn al terug te vinden in de huidige componentstate.
    public struct KavelEventBufferElement : IBufferElementData
    {
        public KavelEventType Type;
        public double Tijdstip;
    }

    public struct KavelGeometriePunt : IBufferElementData
    {
        public float2 Punt;
    }

    public struct KavelBouwvlakPunt : IBufferElementData
    {
        public float2 Punt;
    }

    /// Tag: geometrie is gewijzigd, KavelOppervlakteSystem moet Oppervlakte herberekenen.
    public struct GeometrieDirty : IComponentData { }

    /// Tag: iets dat de grondwaarde beinvloedt is gewijzigd (status, bestemmingsplan,
    /// omgevingsfactoren), GrondwaardeSystem moet Marktwaarde herberekenen.
    public struct GrondwaardeDirty : IComponentData { }
}
