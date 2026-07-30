using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.WaterEnLandschap
{
    /// Section 1. `volume_mesh` (visueel, uit heightmap afgeleid) hoort niet in dit datamodel --
    /// dat komt met de mesh-generatie-pas, net als bij de wegen. `OppervlakteM2` staat niet
    /// letterlijk in de doc-tabel maar wordt wel gebruikt in MeerVervalStatus'
    /// verdampingsformule ("oppervlakte(waterlichaam)"), dus toegevoegd als opgeslagen veld --
    /// zelfde behandeling als KavelCore.Oppervlakte in doc 04.
    public struct WaterLichaamData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public WaterLichaamType Type;
        public float Waterpeil;
        public float OppervlakteM2;
        public WaterOorsprong Oorsprong;
        public bool WaterpeilDynamisch;   // afgeleid: true alleen als Oorsprong == SpelerGecreeerd, gezet bij creatie
        public bool HeeftStroomrichting;   // alleen Rivier/Gracht
        public float2 Stroomrichting;       // puur visueel (shader-based), geen fysieke berekening
    }

    public struct VerbondenLichaamBufferElement : IBufferElementData
    {
        public Entity WaterLichaam;
    }

    /// Tag: bron/pomp toegevoegd of aangepast, of landscaping die het stroompad raakt --
    /// triggert een onmiddellijke herberekening in WaterpeilBalansSystem, los van de trage
    /// periodieke tick die de dag/week-verdamping/verval afhandelt.
    public struct WaterpeilDirty : IComponentData { }

    public struct WaterBronData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public float3 Positie;
        public float Debiet;              // bepaalt resulterende rivierbreedte/meergrootte
        public bool Actief;
        public Entity ResultLichaam;       // Entity.Null totdat de eenmalige flood-fill/flow-berekening gedraaid heeft
    }

    /// Drijft de trage periodieke herberekening (verdamping/verval, "eens per in-game dag/week"
    /// per sectie 1) -- los van WaterpeilDirty, dat een onmiddellijke herberekening triggert.
    public struct WaterTickData : IComponentData
    {
        public double VolgendeTick;
        public double TickIntervalSeconden;
    }

    /// Section 3: functioneel hetzelfde patroon als het Onderstation uit doc 05 (te plaatsen
    /// gebouw met bereik/capaciteit dat aangesloten moet worden), hier de water-tegenhanger.
    public struct PompstationData : IComponentData
    {
        public Entity BronWaterlichaam;
        public float Onttrekking;         // m3/tijdseenheid, telt mee als uitstroom in de balans
        public float3 Positie;
        public float Bereik;
        public float Capaciteit;
        public Entity GekoppeldAanNet;     // Entity.Null totdat er een nutsvoorzieningen-netwerk-model is
    }
}
