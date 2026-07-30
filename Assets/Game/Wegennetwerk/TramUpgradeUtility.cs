using Unity.Entities;

namespace CityBuilder.Game.Wegennetwerk
{
    /// Plain result struct, geen ECS-component -- dit is een voorstel dat de aanroeper (later:
    /// een UI-laag) aan de speler toont, geen gesimuleerde entiteit. Bewaar 'm zelf ergens als je
    /// een persistente Voorgesteld/Geaccepteerd/Geweigerd-workflow wilt; deze utility berekent
    /// 'm alleen.
    public struct WegVerbredingsVoorstel
    {
        public Entity Segment;
        public float BenodigdeExtraBreedteMeter;
        public Entity[] GeraakteKavels; // nog leeg totdat kavel<->wegsegment ruimtelijke overlap bestaat
        public float GeschatteKosten;
        public WegVerbredingStatus Status;
    }

    public enum TramUpgradeResultType : byte
    {
        AanlegGestart,
        VerbredingNodig,
        AlAanwezig,
    }

    public struct TramUpgradeResult
    {
        public TramUpgradeResultType Type;
        public WegVerbredingsVoorstel Voorstel; // alleen betekenisvol bij VerbredingNodig
    }

    /// Section 5's WegSegmentUpgradeNaarTram + de "kan deze lijn actief worden"-check.
    public static class TramUpgradeUtility
    {
        const float KostenPerMeterVerbreding = 4500f; // placeholder, geen echte aannemersprijs

        /// Eerste-orde regel: alleen Avenue heeft al ongebruikte breedte (de middenberm uit
        /// sectie 2, die niet als Lane gemodelleerd is) om tramrails in te passen zonder
        /// verbreding. Elk ander WegType heeft geen gemodelleerde marge en krijgt dus altijd een
        /// verbredingsvoorstel. Dit is een bewuste eerste-pas-vereenvoudiging, geen precieze
        /// ruimte-boekhouding per meter.
        public static TramUpgradeResult WegSegmentUpgradeNaarTram(EntityManager em, Entity segment)
        {
            var lanes = em.GetBuffer<LaneBufferElement>(segment);
            for (int i = 0; i < lanes.Length; i++)
            {
                if (lanes[i].Type == LaneType.Tramrail)
                    return new TramUpgradeResult { Type = TramUpgradeResultType.AlAanwezig };
            }

            var segmentData = em.GetComponentData<WegSegmentData>(segment);
            bool pastZonderVerbreding = segmentData.WegType == WegTypeId.Avenue;

            if (!pastZonderVerbreding)
            {
                float benodigd = WegTypeCatalogus.TramrailBreedte * 2f; // twee tramrail-lanes, altijd samen aangelegd
                return new TramUpgradeResult
                {
                    Type = TramUpgradeResultType.VerbredingNodig,
                    Voorstel = new WegVerbredingsVoorstel
                    {
                        Segment = segment,
                        BenodigdeExtraBreedteMeter = benodigd,
                        GeraakteKavels = System.Array.Empty<Entity>(),
                        GeschatteKosten = benodigd * KostenPerMeterVerbreding,
                        Status = WegVerbredingStatus.Voorgesteld,
                    },
                };
            }

            lanes.Add(new LaneBufferElement { Type = LaneType.Tramrail, Richting = LaneRichting.EenrichtingA, BreedteMeter = WegTypeCatalogus.TramrailBreedte });
            lanes.Add(new LaneBufferElement { Type = LaneType.Tramrail, Richting = LaneRichting.EenrichtingB, BreedteMeter = WegTypeCatalogus.TramrailBreedte });

            if (!em.HasComponent<TramInfrastructuurData>(segment))
                em.AddComponentData(segment, new TramInfrastructuurData { Rails = true, Bovenleiding = false, Stroombron = Entity.Null, AanlegStatus = TramAanlegStatus.InAanleg });
            else
                em.SetComponentData(segment, new TramInfrastructuurData { Rails = true, Bovenleiding = false, Stroombron = Entity.Null, AanlegStatus = TramAanlegStatus.InAanleg });

            if (!em.HasComponent<CapaciteitDirty>(segment))
                em.AddComponent<CapaciteitDirty>(segment);

            return new TramUpgradeResult { Type = TramUpgradeResultType.AanlegGestart };
        }

        /// "Een tramlijn kan pas actief=true als elk segment op de route aanlegstatus==Gereed heeft."
        public static bool KanLijnActiveren(EntityManager em, Entity[] routeSegmenten)
        {
            foreach (var segment in routeSegmenten)
            {
                if (!em.HasComponent<TramInfrastructuurData>(segment))
                    return false;

                var infra = em.GetComponentData<TramInfrastructuurData>(segment);
                if (infra.AanlegStatus != TramAanlegStatus.Gereed || infra.Stroombron == Entity.Null)
                    return false;
            }
            return true;
        }
    }
}
