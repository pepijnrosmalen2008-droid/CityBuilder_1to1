using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Ontwikkeling
{
    /// NOT a gameplay feature -- same purpose as the other bootstraps: proves the doc 07 pieces
    /// (kavelgeneratie, vraag/aanbod, ontwikkelrichtlijn-overerving, bod-generatie/-filtering)
    /// compile and interoperate, including the cross-references into the already-shipped
    /// Kavellen/Wegennetwerk code.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct OntwikkelingTestBootstrap : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;
            var rng = new Unity.Mathematics.Random(777);

            Entity district = em.CreateEntity(typeof(DistrictData));
            em.SetComponentData(district, new DistrictData { DistrictId = 0, BebouwingsgraadBasis = 0f, IndustrieAandeelBasis = 0f });

            Entity wegsegment = MaakEenvoudigWegsegment(em, new float3(0, 0, 0), new float3(200, 0, 0));

            var regel = new KavelGeneratieRegel { MaxDiepteVanafWeggrens = 50f, MinFrontbreedte = 20f };
            Entity[] kavels = KavelGeneratieUtility.GenereerKavelsLangsWeg(em, wegsegment, regel, districtId: 0);
            int verwacht = 2 * (int)math.floor(200f / 20f);
            Debug.Log($"[OntwikkelingTestBootstrap] Kavelgeneratie: {kavels.Length} kavels gegenereerd langs een 200m wegsegment (verwacht {verwacht}).");

            Entity plan = MaakBestemmingsplan(em);

            Entity testKavel = kavels[0];
            var kavelCore = em.GetComponentData<KavelCore>(testKavel);
            kavelCore.Bestemmingsplan = plan;
            kavelCore.BebouwingspercentageMax = 60f;
            kavelCore.BouwhoogteMax = 15f;
            em.SetComponentData(testKavel, kavelCore);

            KavelStatusTransitions.TryTransition(em, testKavel, KavelStatus.Landbouwgrond, default, 0);
            KavelStatusTransitions.TryTransition(em, testKavel, KavelStatus.BouwrijpGemaakt, default, 0);
            bool naarBouwkavelGelukt = KavelStatusTransitions.TryTransition(em, testKavel, KavelStatus.Bouwkavel, default, 0);
            Debug.Log($"[OntwikkelingTestBootstrap] Statusmachine tot Bouwkavel (generatie + bestemmingsplan + ontsluiting) = {naarBouwkavelGelukt} (verwacht true).");

            MaakVraagAanbodIndex(em, districtId: 0, functie: FunctieType.Wonen, vraag: 150f, aanbod: 100f);
            MaakVraagAanbodIndex(em, districtId: 0, functie: FunctieType.Detailhandel, vraag: 20f, aanbod: 80f);
            Debug.Log("[OntwikkelingTestBootstrap] VraagAanbodIndex-opzet klaar. Controleer na een paar seconden in de Inspector: " +
                      "Wonen moet Verhouding/PrijsMultiplier > 1 blijven tonen (vraag > aanbod), Detailhandel < 1 (overschot).");

            MaakRichtlijn(em, ScopeType.Gebied, district, heeftMaxHoogte: false, maxHoogte: 0f, heeftBouwstijl: true, bouwstijl: BouwPeriode.Jaren30);
            MaakRichtlijn(em, ScopeType.Straat, wegsegment, heeftMaxHoogte: true, maxHoogte: 12f, heeftBouwstijl: false, bouwstijl: default);

            var voorwaarden = EffectieveVoorwaardenUtility.ResolveEffectieveVoorwaarden(em, testKavel);
            Debug.Log($"[OntwikkelingTestBootstrap] EffectieveVoorwaarden: BouwhoogteMax = {voorwaarden.BouwhoogteMax} " +
                      $"(verwacht 12 -- straat-richtlijn verstrengt het bestemmingsplan's 15), HeeftBouwstijl = {voorwaarden.HeeftBouwstijl} " +
                      "(verwacht true, uit de gebied-richtlijn; de straat-richtlijn had er zelf geen).");

            Entity ontwikkelaar = MaakProjectontwikkelaar(em, RisicoProfiel.Gemiddeld, budget: 2_000_000f);

            // GrondwaardeSystem is event-driven en heeft op dit synchrone punt (OnCreate, vóór de
            // eerste SimulationSystemGroup-pass) nog niet getikt, dus Marktwaarde staat nog op 0.
            // Handmatig een representatieve testwaarde zetten om BepaalAantalBiedingen's
            // drempel-logica zinvol te kunnen demonstreren, i.p.v. altijd triviaal 0 te zien.
            kavelCore = em.GetComponentData<KavelCore>(testKavel);
            kavelCore.Marktwaarde = 400_000f;
            em.SetComponentData(testKavel, kavelCore);

            int aantalBiedingen = BiedingsFlowUtility.BepaalAantalBiedingen(em, testKavel, ref rng);
            Debug.Log($"[OntwikkelingTestBootstrap] BepaalAantalBiedingen voor testKavel (met testwaarde Marktwaarde=400000) = {aantalBiedingen} " +
                      "(verwacht 2 of 3: genormaliseerde waarde 0.8 x gem. verhouding 0.875 = 0.7, tussen GemiddeldeDrempel en HogeDrempel).");

            var geldigPlan = new System.Collections.Generic.List<FunctieAandeelBufferElement>
            {
                new FunctieAandeelBufferElement { Functie = FunctieType.Wonen, MinPercentage = 80f, MaxPercentage = 80f, VerdiepingRestrictie = VerdiepingRestrictie.Geen },
            };
            var ongeldigPlan = new System.Collections.Generic.List<FunctieAandeelBufferElement>
            {
                new FunctieAandeelBufferElement { Functie = FunctieType.Industrie, MinPercentage = 100f, MaxPercentage = 100f, VerdiepingRestrictie = VerdiepingRestrictie.Geen },
            };

            var geldigBod = BiedingsFlowUtility.GenereerBod(em, testKavel, ontwikkelaar, voorwaarden, 10f,
                geldigPlan, Energielabel.B, ParkeerOplossing.OpEigenTerrein, 180f, 0);
            var ongeldigBod = BiedingsFlowUtility.GenereerBod(em, testKavel, ontwikkelaar, voorwaarden, 10f,
                ongeldigPlan, Energielabel.B, ParkeerOplossing.OpEigenTerrein, 180f, 0);

            Debug.Log($"[OntwikkelingTestBootstrap] Bod-generatie: geldig plan (Wonen, binnen bestemmingsplan) = {geldigBod.HasValue} (verwacht true), " +
                      $"ongeldig plan (Industrie, niet toegestaan door bestemmingsplan) = {ongeldigBod.HasValue} (verwacht false).");
        }

        static Entity MaakEenvoudigWegsegment(EntityManager em, float3 van, float3 naar)
        {
            Entity nodeVan = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(nodeVan, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = van });
            Entity nodeNaar = em.CreateEntity(typeof(NetwerkNodeData));
            em.SetComponentData(nodeNaar, new NetwerkNodeData { Type = NodeType.Kruispunt, Positie = naar });

            Entity segment = em.CreateEntity(typeof(WegSegmentData), typeof(WegSegmentSplinePunt), typeof(LaneBufferElement));
            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            spline.Add(new WegSegmentSplinePunt { Punt = van });
            spline.Add(new WegSegmentSplinePunt { Punt = naar });

            var lanes = em.GetBuffer<LaneBufferElement>(segment);
            foreach (var spec in WegTypeCatalogus.GetLanes(WegTypeId.Straat))
                lanes.Add(new LaneBufferElement { Type = spec.Type, Richting = spec.Richting, BreedteMeter = spec.BreedteMeter });

            em.SetComponentData(segment, new WegSegmentData
            {
                Id = new Unity.Entities.Hash128((uint)segment.Index, 8, 0, 0),
                WegType = WegTypeId.Straat,
                VanNode = nodeVan,
                NaarNode = nodeNaar,
                Capaciteit = 0,
                Snelheidslimiet = WegTypeCatalogus.GetSnelheidslimiet(WegTypeId.Straat),
                HuidigeBelasting = 0f,
                HoogteProfiel = new HoogteProfielData { Modus = HoogteProfielModus.OpMaaiveld, HoogteOffset = 0f, OvergangsLengte = 0f },
                HeeftBusoverlay = false,
            });

            return segment;
        }

        static Entity MaakBestemmingsplan(EntityManager em)
        {
            Entity plan = em.CreateEntity(typeof(BestemmingsplanData), typeof(FunctieAandeelBufferElement), typeof(BouwregelsData));
            em.SetComponentData(plan, new BestemmingsplanData { Naam = "Ontwikkeling_Testgebied", HeeftLooptijd = false });

            var functies = em.GetBuffer<FunctieAandeelBufferElement>(plan);
            functies.Add(new FunctieAandeelBufferElement { Functie = FunctieType.Wonen, MinPercentage = 50f, MaxPercentage = 100f, VerdiepingRestrictie = VerdiepingRestrictie.Geen });
            functies.Add(new FunctieAandeelBufferElement { Functie = FunctieType.Detailhandel, MinPercentage = 0f, MaxPercentage = 30f, VerdiepingRestrictie = VerdiepingRestrictie.AlleenBeganeGrond });

            em.SetComponentData(plan, new BouwregelsData
            {
                BebouwingspercentageMax = 70f,
                BouwhoogteMax = 15f,
                MinAfstandBuren = 3f,
                MinGroenPercentage = 10f,
                Parkeernorm = 1.2f,
                GeluidseisMaxDb = 55f,
                EnergielabelMin = Energielabel.C,
            });

            return plan;
        }

        static Entity MaakVraagAanbodIndex(EntityManager em, int districtId, FunctieType functie, float vraag, float aanbod)
        {
            Entity index = em.CreateEntity(typeof(VraagAanbodIndexData));
            float verhouding = aanbod > 0f ? vraag / aanbod : 1f;
            float multiplier = math.clamp(verhouding, VraagAanbodConstanten.MinPrijsMultiplier, VraagAanbodConstanten.MaxPrijsMultiplier);

            em.SetComponentData(index, new VraagAanbodIndexData
            {
                DistrictId = districtId,
                Functie = functie,
                Vraag = vraag,
                Aanbod = aanbod,
                Verhouding = verhouding,
                PrijsMultiplier = multiplier,
            });
            em.AddComponent<VraagAanbodIndexDirty>(index);
            return index;
        }

        static Entity MaakRichtlijn(EntityManager em, ScopeType scope, Entity scopeReferentie, bool heeftMaxHoogte, float maxHoogte, bool heeftBouwstijl, BouwPeriode bouwstijl)
        {
            Entity richtlijn = em.CreateEntity(typeof(OntwikkelrichtlijnData));
            em.SetComponentData(richtlijn, new OntwikkelrichtlijnData
            {
                Id = new Unity.Entities.Hash128((uint)richtlijn.Index, 9, 0, 0),
                ScopeType = scope,
                ScopeReferentie = scopeReferentie,
                HeeftBouwstijl = heeftBouwstijl,
                Bouwstijl = bouwstijl,
                HeeftMaxHoogte = heeftMaxHoogte,
                MaxHoogte = maxHoogte,
                HeeftMinEnergielabel = false,
                MinEnergielabel = default,
                HeeftSocialeWoningbouwEis = false,
                VerplichtPercentageSocialeWoningbouw = 0f,
                HeeftEsthetischeEis = false,
                EsthetischeEis = default,
                HeeftAcceptatiebeleid = false,
                Acceptatiebeleid = default,
            });
            return richtlijn;
        }

        static Entity MaakProjectontwikkelaar(EntityManager em, RisicoProfiel risicoProfiel, float budget)
        {
            Entity ontwikkelaar = em.CreateEntity(typeof(ProjectontwikkelaarData), typeof(VoorkeursfunctieBufferElement), typeof(ActiefBodBufferElement));
            em.SetComponentData(ontwikkelaar, new ProjectontwikkelaarData
            {
                Id = new Unity.Entities.Hash128((uint)ontwikkelaar.Index, 10, 0, 0),
                Naam = "Ontwikkelaar Test BV",
                RisicoProfiel = risicoProfiel,
                MinRendementseisPercentage = OntwikkelaarsProfielConstanten.MinRendementseisVoor(risicoProfiel),
                Budget = budget,
            });

            var voorkeuren = em.GetBuffer<VoorkeursfunctieBufferElement>(ontwikkelaar);
            voorkeuren.Add(new VoorkeursfunctieBufferElement { Functie = FunctieType.Wonen, Gewicht = 1f });

            return ontwikkelaar;
        }
    }
}
