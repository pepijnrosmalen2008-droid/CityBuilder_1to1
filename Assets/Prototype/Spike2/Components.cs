using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Prototype.Spike2
{
    public enum Bestemmingsplan : byte
    {
        WoonwijkLaag,
        WoonwijkHoog,
        Kantoren,
        Detailhandel,
        Gemengd,
    }

    public enum OntwikkelStatus : byte
    {
        Onbebouwd,
        BeschikbaarVoorBod,
        Gegund,
        InAanbouw,
        Voltooid,
    }

    public struct KavelData : IComponentData
    {
        public int DistrictId;
        public Bestemmingsplan Bestemmingsplan;
        public OntwikkelStatus Status;
        public float Oppervlakte;           // m2
        public float ResiduleGrondwaarde;
        public int HuidigeEigenaarIndex;    // index in de ontwikkelaar-array, -1 = geen
    }

    /// Tag: kavel wisselde net van status, wacht op verwerking door BiedingsrondeSystem.
    public struct BiedingVereist : IComponentData { }

    public struct DistrictData : IComponentData
    {
        public int DistrictId;
        public float VraagAanbodIndex;
        public int KavelCount;
    }

    public struct WegNodeData : IComponentData
    {
        public float3 Positie;
    }

    /// Eén element per uitgaande verbinding vanaf deze WegNode-entity (capaciteitsgraaf-edge).
    public struct WegSegmentBuffer : IBufferElementData
    {
        public Entity NaarNode;
        public float Capaciteit;
        public float HuidigeFlow;
    }

    public struct WaterLichaamData : IComponentData
    {
        public float Peil;
        public float Capaciteit;
        public float Inflow;
        public float Outflow;
    }

    /// Tag: dit waterlichaam moet deze tick herberekend worden (event-driven, geen continue update).
    public struct WaterDirty : IComponentData { }

    public struct ProjectontwikkelaarData : IComponentData
    {
        public float Budget;
        public float RisicoProfiel; // 0-1, hoger = agressiever bieden
        public int ActieveBiedingen;
    }

    public struct SimClockData : IComponentData
    {
        public double ElapsedRealSeconds;
        public int HuidigeDag;
        public double VolgendeTrafficTick;
    }

    /// Singleton-tag op de klok-entity: gezet op de frame dat de dagteller omhoog gaat,
    /// verwijderd door VraagAanbodSystem zodra die het verwerkt heeft.
    public struct NieuweDagEvent : IComponentData { }
}
