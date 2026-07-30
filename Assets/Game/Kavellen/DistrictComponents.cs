using Unity.Entities;

namespace CityBuilder.Game.Kavellen
{
    /// Section 6's district/buurt aggregation unit. Separate from Spike 2's DistrictData
    /// (CityBuilder.Prototype.Spike2) on purpose -- that one belonged to the disposable CPU-
    /// validation world, this one belongs to the real game's data model.
    public struct DistrictData : IComponentData
    {
        public int DistrictId;

        // Placeholder proxies until the wegennetwerk (doc 05, "afstand tot wegennetwerk-hub")
        // and a gebouw-generator exist: derived purely from what's already in this doc's scope
        // (kavel status + functiemix), not invented hub/traffic logic that would need to be
        // thrown away once those systems land.
        public float BebouwingsgraadBasis;   // 0-1, aandeel Bebouwd/InHerontwikkeling kavels
        public float IndustrieAandeelBasis;  // 0-1, aandeel kavels met Industrie in de functiemix
    }

    public struct OmgevingstickData : IComponentData
    {
        public double VolgendeTick;
        public double TickIntervalSeconden;
    }
}
