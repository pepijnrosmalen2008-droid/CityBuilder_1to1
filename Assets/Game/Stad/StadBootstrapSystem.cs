using Unity.Collections;
using Unity.Entities;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Stad
{
    /// Zet de singletons neer die het echte spel nodig heeft (i.p.v. de testbootstraps): tick-
    /// timers, district 0, één bestemmingsplan per zone, stadstatistiek, vraag en speltijd.
    /// Draait in de eerste OnUpdate (na alle OnCreate's), zodat er nooit dubbele singletons
    /// ontstaan als TestModus.BootstrapsAan toch aan staat.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct StadBootstrapSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;

            if (em.CreateEntityQuery(typeof(NetwerkTickData)).IsEmpty)
            {
                var e = em.CreateEntity(typeof(NetwerkTickData));
                em.SetComponentData(e, new NetwerkTickData { VolgendeTick = 0, TickIntervalSeconden = 1.5 });
            }

            if (em.CreateEntityQuery(typeof(OmgevingstickData)).IsEmpty)
            {
                var e = em.CreateEntity(typeof(OmgevingstickData));
                em.SetComponentData(e, new OmgevingstickData { VolgendeTick = 0, TickIntervalSeconden = 5.0 });
            }

            if (em.CreateEntityQuery(typeof(DistrictData)).IsEmpty)
            {
                var e = em.CreateEntity(typeof(DistrictData));
                em.SetComponentData(e, new DistrictData { DistrictId = 0, BebouwingsgraadBasis = 0f, IndustrieAandeelBasis = 0f });
            }

            if (em.CreateEntityQuery(typeof(ZonePlannenData)).IsEmpty)
            {
                var plannen = new ZonePlannenData
                {
                    WonenLaag = MaakPlan(em, "Wonen - laagbouw", 45f, 12f,
                        (FunctieType.Wonen, 100f, 100f, VerdiepingRestrictie.Geen)),
                    WonenHoog = MaakPlan(em, "Wonen - gestapeld", 55f, 36f,
                        (FunctieType.Wonen, 90f, 100f, VerdiepingRestrictie.Geen),
                        (FunctieType.Maatschappelijk, 0f, 10f, VerdiepingRestrictie.AlleenBeganeGrond)),
                    Gemengd = MaakPlan(em, "Gemengd - centrum", 75f, 22f,
                        (FunctieType.Detailhandel, 15f, 35f, VerdiepingRestrictie.AlleenBeganeGrond),
                        (FunctieType.Horeca, 0f, 15f, VerdiepingRestrictie.AlleenBeganeGrond),
                        (FunctieType.Wonen, 60f, 85f, VerdiepingRestrictie.AlleenBoven)),
                    Kantoor = MaakPlan(em, "Kantoren", 60f, 60f,
                        (FunctieType.Kantoor, 90f, 100f, VerdiepingRestrictie.Geen),
                        (FunctieType.Horeca, 0f, 10f, VerdiepingRestrictie.AlleenBeganeGrond)),
                    Industrie = MaakPlan(em, "Bedrijventerrein", 70f, 16f,
                        (FunctieType.Industrie, 90f, 100f, VerdiepingRestrictie.Geen),
                        (FunctieType.Kantoor, 0f, 10f, VerdiepingRestrictie.Geen)),
                };
                var e = em.CreateEntity(typeof(ZonePlannenData));
                em.SetComponentData(e, plannen);
            }

            if (em.CreateEntityQuery(typeof(StadStatistiekData)).IsEmpty)
                em.CreateEntity(typeof(StadStatistiekData));

            if (em.CreateEntityQuery(typeof(StadVraagData)).IsEmpty)
            {
                var e = em.CreateEntity(typeof(StadVraagData));
                em.SetComponentData(e, new StadVraagData { Wonen = 0.6f, Detailhandel = 0.1f, Kantoor = 0.05f, Industrie = 0.15f });
            }

            if (em.CreateEntityQuery(typeof(SimTijdData)).IsEmpty)
            {
                var e = em.CreateEntity(typeof(SimTijdData));
                em.SetComponentData(e, new SimTijdData { Snelheid = 1f, Dagen = 0 });
            }

            state.Enabled = false;
        }

        static Entity MaakPlan(EntityManager em, string naam, float bebouwingspercentage, float bouwhoogte,
            params (FunctieType functie, float min, float max, VerdiepingRestrictie restrictie)[] functies)
        {
            var plan = em.CreateEntity(typeof(BestemmingsplanData), typeof(BouwregelsData), typeof(FunctieAandeelBufferElement));
            em.SetComponentData(plan, new BestemmingsplanData
            {
                Naam = new FixedString64Bytes(naam),
                HeeftLooptijd = false,
            });
            em.SetComponentData(plan, new BouwregelsData
            {
                BebouwingspercentageMax = bebouwingspercentage,
                BouwhoogteMax = bouwhoogte,
                MinAfstandBuren = 0f,
                MinGroenPercentage = 10f,
                Parkeernorm = 1f,
                GeluidseisMaxDb = 55f,
                EnergielabelMin = Energielabel.A,
            });

            var buffer = em.GetBuffer<FunctieAandeelBufferElement>(plan);
            foreach (var f in functies)
            {
                buffer.Add(new FunctieAandeelBufferElement
                {
                    Functie = f.functie,
                    MinPercentage = f.min,
                    MaxPercentage = f.max,
                    VerdiepingRestrictie = f.restrictie,
                });
            }
            return plan;
        }
    }
}
