using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace CityBuilder.Game.Kavellen
{
    /// NOT a gameplay feature -- there is no zoning/map-drawing tool yet to actually create
    /// kavels and bestemmingsplannen from player input (that's a separate tools doc). This exists
    /// purely to sanity-check that KavelCore, BestemmingsplanData, KavelOppervlakteSystem,
    /// KavelStatusTransitions, GrondwaardeSystem and OmgevingsfactorenSystem all wire together
    /// and produce sane numbers when actually run. Safe to delete once real world-authoring
    /// exists.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct KavelTestBootstrap : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;

            Entity tick = em.CreateEntity(typeof(OmgevingstickData));
            em.SetComponentData(tick, new OmgevingstickData { VolgendeTick = 0, TickIntervalSeconden = 5.0 });

            const int districtCount = 2;
            for (int d = 0; d < districtCount; d++)
            {
                Entity district = em.CreateEntity(typeof(DistrictData));
                em.SetComponentData(district, new DistrictData { DistrictId = d, BebouwingsgraadBasis = 0f, IndustrieAandeelBasis = 0f });
            }

            Entity plan = MaakVoorbeeldplanGemengdWonenCentrumOost(em);

            var kavels = MaakVoorbeeldKavels(em, plan);
            VerifieerStatusmachine(em, kavels);
        }

        /// Extra wiring check: confirms KavelStatusTransitions actually rejects an illegal jump
        /// and accepts a legal one, per section 3's precondition table.
        static void VerifieerStatusmachine(EntityManager em, Entity[] kavels)
        {
            // kavels[0] staat op Natuur -- rechtstreeks naar Bouwkavel springen moet mislukken.
            bool illegaalGeslaagd = KavelStatusTransitions.TryTransition(
                em, kavels[0], KavelStatus.Bouwkavel, default, huidigeTijd: 0);

            // kavels[1] staat op Landbouwgrond -> BouwrijpGemaakt heeft geen precondities.
            bool legaalGeslaagd = KavelStatusTransitions.TryTransition(
                em, kavels[1], KavelStatus.BouwrijpGemaakt, default, huidigeTijd: 0);

            Debug.Log($"[KavelTestBootstrap] Statusmachine-check: illegale transitie geweigerd = {!illegaalGeslaagd} (verwacht true), " +
                      $"legale transitie geaccepteerd = {legaalGeslaagd} (verwacht true).");
        }

        static Entity MaakVoorbeeldplanGemengdWonenCentrumOost(EntityManager em)
        {
            Entity plan = em.CreateEntity(
                typeof(BestemmingsplanData),
                typeof(BestemmingsplanGebiedPunt),
                typeof(FunctieAandeelBufferElement),
                typeof(BouwregelsData));

            em.SetComponentData(plan, new BestemmingsplanData
            {
                Naam = "Gemengd Wonen Centrum-Oost",
                HeeftLooptijd = false,
            });

            var gebied = em.GetBuffer<BestemmingsplanGebiedPunt>(plan);
            gebied.Add(new BestemmingsplanGebiedPunt { Punt = new float2(0, 0) });
            gebied.Add(new BestemmingsplanGebiedPunt { Punt = new float2(200, 0) });
            gebied.Add(new BestemmingsplanGebiedPunt { Punt = new float2(200, 200) });
            gebied.Add(new BestemmingsplanGebiedPunt { Punt = new float2(0, 200) });

            // Exact het voorbeeld uit sectie 2 van het document.
            var functies = em.GetBuffer<FunctieAandeelBufferElement>(plan);
            functies.Add(new FunctieAandeelBufferElement { Functie = FunctieType.Detailhandel, MinPercentage = 0, MaxPercentage = 30, VerdiepingRestrictie = VerdiepingRestrictie.AlleenBeganeGrond });
            functies.Add(new FunctieAandeelBufferElement { Functie = FunctieType.Horeca, MinPercentage = 0, MaxPercentage = 20, VerdiepingRestrictie = VerdiepingRestrictie.AlleenBeganeGrond });
            functies.Add(new FunctieAandeelBufferElement { Functie = FunctieType.Wonen, MinPercentage = 50, MaxPercentage = 100, VerdiepingRestrictie = VerdiepingRestrictie.AlleenBoven });

            em.SetComponentData(plan, new BouwregelsData
            {
                BebouwingspercentageMax = 70f,
                BouwhoogteMax = 21f, // ~7 verdiepingen
                MinAfstandBuren = 3f,
                MinGroenPercentage = 10f,
                Parkeernorm = 1.2f,
                GeluidseisMaxDb = 55f,
                EnergielabelMin = Energielabel.B,
            });

            return plan;
        }

        static Entity[] MaakVoorbeeldKavels(EntityManager em, Entity plan)
        {
            var rng = new Unity.Mathematics.Random(555);

            // Stand-in for a Road entity until doc 05 (wegennetwerk) exists -- an empty entity
            // is enough to prove "Ontsluiting != Entity.Null" gates the Bouwkavel transition
            // correctly, without pretending this is an actual Road.
            Entity placeholderOntsluiting = em.CreateEntity();

            var statussen = new[]
            {
                KavelStatus.Natuur,
                KavelStatus.Landbouwgrond,
                KavelStatus.BouwrijpGemaakt,
                KavelStatus.Bouwkavel,
                KavelStatus.Bouwplaats,
                KavelStatus.Bebouwd,
            };

            var kavels = new Entity[statussen.Length];

            for (int i = 0; i < statussen.Length; i++)
            {
                Entity kavel = em.CreateEntity(
                    typeof(KavelCore),
                    typeof(KavelEigenaarData),
                    typeof(NutsvoorzieningenData),
                    typeof(OmgevingsfactorenData),
                    typeof(VoorzieningAfstandBufferElement),
                    typeof(KavelEventBufferElement),
                    typeof(KavelGeometriePunt),
                    typeof(KavelBouwvlakPunt));

                float x = i * 30f;
                var geometrie = em.GetBuffer<KavelGeometriePunt>(kavel);
                geometrie.Add(new KavelGeometriePunt { Punt = new float2(x, 0) });
                geometrie.Add(new KavelGeometriePunt { Punt = new float2(x + 20, 0) });
                geometrie.Add(new KavelGeometriePunt { Punt = new float2(x + 20, 25) });
                geometrie.Add(new KavelGeometriePunt { Punt = new float2(x, 25) });

                var status = statussen[i];
                bool heeftOntsluiting = status != KavelStatus.Natuur && status != KavelStatus.Landbouwgrond;

                em.SetComponentData(kavel, new KavelCore
                {
                    Id = new Hash128((uint)(i + 1), 0, 0, 0),
                    DistrictId = i % 2,
                    Oppervlakte = 0f, // KavelOppervlakteSystem berekent dit bij de eerste GeometrieDirty-pass
                    Marktwaarde = 0f,
                    BouwPeriode = BouwPeriode.Onbebouwd,
                    Bestemmingsplan = status >= KavelStatus.Bouwkavel ? plan : Entity.Null,
                    BebouwingspercentageMax = 70f,
                    BouwhoogteMax = 21f,
                    Status = status,
                    Gebouw = Entity.Null,
                    Ontsluiting = heeftOntsluiting ? placeholderOntsluiting : Entity.Null,
                });

                em.SetComponentData(kavel, new KavelEigenaarData { Type = EigenaarType.Geen, OwnerEntity = Entity.Null });
                em.SetComponentData(kavel, new NutsvoorzieningenData { Water = true, Elektriciteit = true, Riolering = true, Internet = false });
                em.SetComponentData(kavel, new OmgevingsfactorenData
                {
                    BereikbaarheidScore = 0f,
                    UitzichtScore = rng.NextFloat(0.2f, 0.8f),
                    GeluidsbelastingDb = 45f,
                    LuchtkwaliteitIndex = rng.NextFloat(0.5f, 1f),
                    OverstromingsrisicoScore = rng.NextFloat(0f, 0.2f),
                    Bodemkwaliteit = Bodemkwaliteit.Goed,
                });

                var voorzieningen = em.GetBuffer<VoorzieningAfstandBufferElement>(kavel);
                voorzieningen.Add(new VoorzieningAfstandBufferElement { Type = VoorzieningType.Supermarkt, AfstandMeter = rng.NextFloat(100f, 900f) });
                voorzieningen.Add(new VoorzieningAfstandBufferElement { Type = VoorzieningType.OvHalte, AfstandMeter = rng.NextFloat(50f, 500f) });

                em.AddComponent<GeometrieDirty>(kavel);
                kavels[i] = kavel;
            }

            return kavels;
        }
    }
}
