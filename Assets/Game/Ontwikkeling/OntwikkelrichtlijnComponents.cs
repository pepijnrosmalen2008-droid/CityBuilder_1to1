using Unity.Entities;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Section 6. Optionele scalaire velden gebruiken het "Heeft<Veld>"-patroon (ECS heeft geen
    /// nullable primitives, zelfde aanpak als bij WaterLichaam/KaartKlimaat). De optionele
    /// `verplichte_functiemix: List<FunctieAandeel>?` is een DynamicBuffer op dezelfde entity
    /// (hergebruikt Kavellen.FunctieAandeelBufferElement) -- een lege buffer betekent "niet
    /// ingevuld", geen apart bool-veld nodig voor een lijst.
    public struct OntwikkelrichtlijnData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public ScopeType ScopeType;
        public Entity ScopeReferentie; // Kavel-entity, WegSegment-entity, of District-entity afhankelijk van ScopeType

        public bool HeeftBouwstijl;
        public BouwPeriode Bouwstijl;

        public bool HeeftMaxHoogte;
        public float MaxHoogte;

        public bool HeeftMinEnergielabel;
        public Energielabel MinEnergielabel;

        public bool HeeftSocialeWoningbouwEis;
        public float VerplichtPercentageSocialeWoningbouw;

        public bool HeeftEsthetischeEis;
        public Welstandsniveau EsthetischeEis;

        public bool HeeftAcceptatiebeleid;
        public AcceptatieBeleid Acceptatiebeleid;
    }
}
