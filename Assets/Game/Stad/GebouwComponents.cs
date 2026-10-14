using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Stad
{
    /// Eén gebouw op één kavel (KavelCore.Gebouw verwijst hiernaar). Footprint is een
    /// georiënteerde rechthoek: `Centrum` op maaiveld, `Voor` wijst naar de straat, `Breedte`
    /// loopt langs de straat. Bij rijwoningen zijn dat `Eenheden` woningen naast elkaar.
    public struct GebouwData : IComponentData
    {
        public Entity Kavel;
        public ZoneType Zone;
        public GebouwVorm Vorm;
        public float2 Centrum;
        public float2 Voor;
        public float Breedte;
        public float Diepte;
        public int Verdiepingen;
        public int Eenheden;
        public uint Seed;
        public float BouwVoortgang; // 0-1, bouwplaats tot oplevering
        public float Bezetting;     // 0-1, deel van de capaciteit dat bewoond of bemand is
        public bool Klaar;
    }

    /// Multi-use: elke verdieping heeft zijn eigen functie (begane grond winkel, erboven wonen).
    /// Index 0 = begane grond.
    public struct VerdiepingBufferElement : IBufferElementData
    {
        public FunctieType Functie;
        public float Hoogte;
    }

    /// Wat er in het gebouw past als het vol is, afgeleid van vloeroppervlak per functie
    /// (FunctieKengetallen). Werkelijk aanwezig = capaciteit x GebouwData.Bezetting.
    public struct GebouwCapaciteitData : IComponentData
    {
        public float Vloeroppervlak;
        public int Woningen;
        public int Bewoners;
        public int BanenDetailhandel;
        public int BanenHoreca;
        public int BanenKantoor;
        public int BanenIndustrie;
        public int BanenOverig;

        public int BanenTotaal => BanenDetailhandel + BanenHoreca + BanenKantoor + BanenIndustrie + BanenOverig;
    }
}
