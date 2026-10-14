using Unity.Entities;

namespace CityBuilder.Game.Stad
{
    public struct KavelZoneData : IComponentData
    {
        public ZoneType Zone;
    }

    /// Tag: zone van deze kavel is veranderd, de zone-overlay moet zijn kleur bijwerken.
    public struct ZoneVisueelDirty : IComponentData { }

    /// Eén bestemmingsplan-entity per zone, aangemaakt door StadBootstrapSystem.
    public struct ZonePlannenData : IComponentData
    {
        public Entity WonenLaag;
        public Entity WonenHoog;
        public Entity Gemengd;
        public Entity Kantoor;
        public Entity Industrie;

        public Entity Voor(ZoneType zone) => zone switch
        {
            ZoneType.WonenLaag => WonenLaag,
            ZoneType.WonenHoog => WonenHoog,
            ZoneType.Gemengd => Gemengd,
            ZoneType.Kantoor => Kantoor,
            ZoneType.Industrie => Industrie,
            _ => Entity.Null,
        };
    }

    public struct StadStatistiekData : IComponentData
    {
        public int Inwoners;
        public int Woningen;
        public int Beroepsbevolking;
        public int Werkenden;
        public float Werkloosheid; // 0-1
        public int BanenTotaal;
        public int BanenDetailhandel;
        public int BanenHoreca;
        public int BanenKantoor;
        public int BanenIndustrie;
        public int BanenOverig;
        public int GebouwenKlaar;
        public int GebouwenInAanbouw;
    }

    /// Vraag per categorie, 0-1 (de W/D/K/I-balken in de HUD, zoals de RCI-balken in CS).
    public struct StadVraagData : IComponentData
    {
        public float Wonen;
        public float Detailhandel;
        public float Kantoor;
        public float Industrie;

        public float VoorZone(ZoneType zone) => zone switch
        {
            ZoneType.WonenLaag => Wonen,
            ZoneType.WonenHoog => Wonen,
            ZoneType.Gemengd => Wonen > Detailhandel ? Wonen : Detailhandel,
            ZoneType.Kantoor => Kantoor,
            ZoneType.Industrie => Industrie,
            _ => 0f,
        };
    }

    public struct SimTijdData : IComponentData
    {
        public float Snelheid; // 0 = pauze, 1/2/4
        public double Dagen;
    }

    public static class SimTijdConstanten
    {
        public const float SecondenPerDag = 4f; // bij snelheid 1
    }
}
