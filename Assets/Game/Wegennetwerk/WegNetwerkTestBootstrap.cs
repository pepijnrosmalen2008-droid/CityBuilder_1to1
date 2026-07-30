using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace CityBuilder.Game.Wegennetwerk
{
    /// NOT a gameplay feature -- same purpose as KavelTestBootstrap: a small example network to
    /// confirm the graaf/lane/capaciteit/flow/tram/OV/klimaat/sneeuw pieces actually compile and
    /// interoperate. Safe to delete once a real road-drawing tool exists.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct WegNetwerkTestBootstrap : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;

            Entity tick = em.CreateEntity(typeof(NetwerkTickData));
            em.SetComponentData(tick, new NetwerkTickData { VolgendeTick = 0, TickIntervalSeconden = 1.5 });

            Entity node0 = MaakNode(em, new float3(0, 0, 0));
            Entity node1 = MaakNode(em, new float3(100, 0, 0));
            Entity node2 = MaakNode(em, new float3(0, 0, 100));
            Entity node3 = MaakNode(em, new float3(100, 0, 100));

            Entity segmentWoonstraat = MaakSegment(em, node0, node1, WegTypeId.Woonstraat);
            Entity segmentStraat = MaakSegment(em, node0, node2, WegTypeId.Straat);
            Entity segmentAvenue = MaakSegment(em, node1, node3, WegTypeId.Avenue);
            Entity segmentTramstraat = MaakSegment(em, node2, node3, WegTypeId.Tramstraat);

            Entity onderstation = MaakOnderstation(em, new float3(50, 0, 100));
            em.AddComponentData(segmentTramstraat, new TramInfrastructuurData
            {
                Rails = true,
                Bovenleiding = true,
                Stroombron = onderstation,
                AanlegStatus = TramAanlegStatus.Gereed,
            });

            // Straat heeft geen gemodelleerde marge -> verwacht VerbredingNodig.
            var resultaatStraat = TramUpgradeUtility.WegSegmentUpgradeNaarTram(em, segmentStraat);
            // Avenue heeft de middenberm-marge -> verwacht AanlegGestart.
            var resultaatAvenue = TramUpgradeUtility.WegSegmentUpgradeNaarTram(em, segmentAvenue);

            Debug.Log($"[WegNetwerkTestBootstrap] Tram-retrofit-check: Straat = {resultaatStraat.Type} (verwacht VerbredingNodig, " +
                      $"benodigde breedte {(resultaatStraat.Type == TramUpgradeResultType.VerbredingNodig ? resultaatStraat.Voorstel.BenodigdeExtraBreedteMeter : 0)}m), " +
                      $"Avenue = {resultaatAvenue.Type} (verwacht AanlegGestart).");

            bool tramstraatKanActiveren = TramUpgradeUtility.KanLijnActiveren(em, new[] { segmentTramstraat });
            Debug.Log($"[WegNetwerkTestBootstrap] Tramlijn op de Gereed-Tramstraat activeerbaar = {tramstraatKanActiveren} (verwacht true).");

            Entity halte0 = MaakStopplaats(em, new float3(0, 0, 0), segmentWoonstraat);
            Entity halte1 = MaakStopplaats(em, new float3(100, 0, 0), segmentWoonstraat);
            MaakBuslijn(em, halte0, halte1);

            var klimaat = new KaartKlimaatData
            {
                Type = KlimaatType.Zeeklimaat,
                LenteTemperatuurC = 10f,
                ZomerTemperatuurC = 19f,
                HerfstTemperatuurC = 11f,
                WinterTemperatuurC = -1f, // onder vriespunt, voor de SneeuwStatus-check hieronder
                HeeftSneeuwlijn = false,
                SneeuwlijnHoogteMeter = 0f,
            };
            Entity klimaatEntity = em.CreateEntity(typeof(KaartKlimaatData));
            em.SetComponentData(klimaatEntity, klimaat);

            bool sneeuwInWinter = KlimaatUtility.SneeuwStatus(locatieHoogteMeter: 5f, Seizoen.Winter, klimaat);
            bool sneeuwInZomer = KlimaatUtility.SneeuwStatus(locatieHoogteMeter: 5f, Seizoen.Zomer, klimaat);
            Debug.Log($"[WegNetwerkTestBootstrap] SneeuwStatus-check: winter = {sneeuwInWinter} (verwacht true), zomer = {sneeuwInZomer} (verwacht false).");

            em.AddComponentData(segmentWoonstraat, new WegSneeuwData { SneeuwNiveau = 0.5f });

            Entity schuifSysteem = em.CreateEntity(typeof(SneeuwSchuifSysteemData));
            em.SetComponentData(schuifSysteem, new SneeuwSchuifSysteemData { Actief = true, RouteStrategie = SneeuwRouteStrategie.PrioriteitWegtype });

            Entity economieEffect = em.CreateEntity(typeof(SneeuwEconomieEffectData));
            em.SetComponentData(economieEffect, new SneeuwEconomieEffectData
            {
                EnergiekostenMultiplier = 1.15f,
                DetailhandelOmzetMultiplier = 0.95f,
                WegonderhoudKosten = 2500f,
                BouwvertragingMultiplier = 1.2f,
            });

            const int kaartLimietGroteStations = 1;
            bool kanGrootVoorPlaatsing = StationPlaatsingUtility.KanStationPlaatsen(em, StationType.Groot, kaartLimietGroteStations);
            Entity grootStationConnector = em.CreateEntity(typeof(StationOffMapConnectorData));
            em.SetComponentData(grootStationConnector, new StationOffMapConnectorData { GekoppeldStation = Entity.Null, InstroomCapaciteit = 500, VraagMultiplier = 1f });
            bool kanGrootNaPlaatsing = StationPlaatsingUtility.KanStationPlaatsen(em, StationType.Groot, kaartLimietGroteStations);

            Debug.Log($"[WegNetwerkTestBootstrap] Groot-station-limiet-check: voor plaatsing = {kanGrootVoorPlaatsing} (verwacht true), " +
                      $"na plaatsing van 1 (limiet=1) = {kanGrootNaPlaatsing} (verwacht false).");
        }

        static Entity MaakNode(EntityManager em, float3 positie)
        {
            Entity node = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(node, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = positie });
            return node;
        }

        static Entity MaakSegment(EntityManager em, Entity van, Entity naar, WegTypeId wegType)
        {
            Entity segment = em.CreateEntity(
                typeof(WegSegmentData),
                typeof(WegSegmentSplinePunt),
                typeof(LaneBufferElement),
                typeof(CapaciteitDirty));

            var vanPositie = em.GetComponentData<NetwerkNodeData>(van).Positie;
            var naarPositie = em.GetComponentData<NetwerkNodeData>(naar).Positie;

            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            spline.Add(new WegSegmentSplinePunt { Punt = vanPositie });
            spline.Add(new WegSegmentSplinePunt { Punt = naarPositie });

            var lanes = em.GetBuffer<LaneBufferElement>(segment);
            foreach (var spec in WegTypeCatalogus.GetLanes(wegType))
                lanes.Add(new LaneBufferElement { Type = spec.Type, Richting = spec.Richting, BreedteMeter = spec.BreedteMeter });

            em.SetComponentData(segment, new WegSegmentData
            {
                Id = new Unity.Entities.Hash128((uint)segment.Index, 0, 0, 0),
                WegType = wegType,
                VanNode = van,
                NaarNode = naar,
                Capaciteit = 0, // WegCapaciteitSystem berekent dit bij de eerste CapaciteitDirty-pass
                Snelheidslimiet = WegTypeCatalogus.GetSnelheidslimiet(wegType),
                HuidigeBelasting = 0f,
                HoogteProfiel = new HoogteProfielData { Modus = HoogteProfielModus.OpMaaiveld, HoogteOffset = 0f, OvergangsLengte = 0f },
                HeeftBusoverlay = false,
            });

            return segment;
        }

        static Entity MaakOnderstation(EntityManager em, float3 positie)
        {
            Entity onderstation = em.CreateEntity(typeof(OnderstationData), typeof(OnderstationGevoedSegmentBufferElement));
            em.SetComponentData(onderstation, new OnderstationData
            {
                Id = new Unity.Entities.Hash128((uint)onderstation.Index, 1, 0, 0),
                Positie = positie,
                Capaciteit = 500f,
                Bereik = 300f,
                GekoppeldAanNet = Entity.Null,
            });
            return onderstation;
        }

        static Entity MaakStopplaats(EntityManager em, float3 positie, Entity gekoppeldSegment)
        {
            Entity halte = em.CreateEntity(typeof(StopplaatsData));
            em.SetComponentData(halte, new StopplaatsData
            {
                Id = new Unity.Entities.Hash128((uint)halte.Index, 2, 0, 0),
                Positie = positie,
                GekoppeldWegsegment = gekoppeldSegment,
                Type = StopplaatsType.Bushalte,
                WachtendeReizigers = 0,
            });
            return halte;
        }

        static void MaakBuslijn(EntityManager em, Entity halte0, Entity halte1)
        {
            Entity lijn = em.CreateEntity(typeof(LijnData), typeof(RouteStopBufferElement));
            em.SetComponentData(lijn, new LijnData
            {
                Type = LijnType.Bus,
                Naam = "Lijn 1",
                FrequentieMinuten = 10,
                VoertuigType = Entity.Null,
                Actief = true,
            });

            var route = em.GetBuffer<RouteStopBufferElement>(lijn);
            route.Add(new RouteStopBufferElement { Stopplaats = halte0 });
            route.Add(new RouteStopBufferElement { Stopplaats = halte1 });
        }
    }
}
