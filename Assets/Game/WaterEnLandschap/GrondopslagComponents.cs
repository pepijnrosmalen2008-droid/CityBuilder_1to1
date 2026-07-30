using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.WaterEnLandschap
{
    /// Section 4 vervangt sectie 2's abstracte "GrondVoorraad // per district"-pot expliciet door
    /// een fysieke voorziening: "Geen abstracte 'pot volume', maar een fysieke voorziening per
    /// district". Dus HuidigeVoorraad/prijzen leven hier op Grondopslag, geen apart GrondVoorraad-
    /// component ernaast (dat zou twee bronnen van waarheid geven).
    /// `wagenpark: List<Vrachtwagen>` wordt `AantalVrachtwagens` -- zichtbare voertuig-AI/
    /// -rendering is dezelfde bewuste deferral als bij OV-voertuigen in doc 05.
    public struct GrondopslagData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public int DistrictId;
        public float3 Positie;
        public float Capaciteit;
        public float HuidigeVoorraad;
        public float AankoopprijsPerM3;
        public float VerkoopprijsPerM3;
        public int AantalVrachtwagens;
        public Entity GekoppeldWegsegment;
    }

    public struct GrondTransportOpdrachtData : IComponentData
    {
        public Entity Van;
        public Entity Naar;
        public float VolumeM3;
        public int IngezetteVrachtwagens;
        public TransportStatus Status;
        // route (pathfinding over het wegennetwerk) is bewust nog niet gemodelleerd -- zelfde
        // deferral als OV-routes in doc 05, dit heeft een echte capaciteitsgraaf-pathfinder nodig.
    }

    /// Section 4: "zelfde patroon als StationOffMapConnector" -- Aanvoerpunt is een generieke
    /// Entity-referentie in plaats van een nieuw KaartRandNode-component, om doc 05's NodeType-
    /// enum niet met een ongeteste toevoeging te hoeven aanpassen voor dit ene gebruik.
    public struct GrondImportOpdrachtData : IComponentData
    {
        public Entity Naar;
        public float VolumeM3;
        public float Kosten; // hoger dan interne verplaatsing
        public Entity Aanvoerpunt;
        public TransportStatus Status;
    }

    public static class GrondTransportUtility
    {
        public const float StandaardLaadcapaciteitPerVrachtwagen = 12f; // m3, placeholder

        public static int BerekenIngezetteVrachtwagens(float volumeM3, float laadcapaciteitPerVrachtwagen = StandaardLaadcapaciteitPerVrachtwagen)
        {
            if (volumeM3 <= 0f) return 0;
            return (int)math.ceil(volumeM3 / laadcapaciteitPerVrachtwagen);
        }
    }
}
