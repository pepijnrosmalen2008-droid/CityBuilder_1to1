using Unity.Entities;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Section 2: one entity per (District, FunctieType) combination. `Verhouding`/
    /// `PrijsMultiplier` are derived-but-stored (recomputed by VraagAanbodIndexSystem), same
    /// pattern as KavelCore.Oppervlakte in doc 04.
    public struct VraagAanbodIndexData : IComponentData
    {
        public int DistrictId;
        public FunctieType Functie;
        public float Vraag;
        public float Aanbod;
        public float Verhouding;      // vraag / aanbod
        public float PrijsMultiplier;  // > 1 bij schaarste, < 1 bij overschot
    }

    /// Tag: Vraag of Aanbod is gewijzigd, Verhouding/PrijsMultiplier moeten herrekend worden.
    public struct VraagAanbodIndexDirty : IComponentData { }
}
