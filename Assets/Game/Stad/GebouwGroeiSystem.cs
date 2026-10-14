using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Stad
{
    /// Laat de stad groeien zoals in Cities: Skylines: op gezoneerde bouwkavels met
    /// wegontsluiting starten bouwprojecten, met een kans die afhangt van de vraag naar die zone.
    /// Een gebouw doorloopt de statusmachine van doc 04 (Bouwkavel -> Bouwplaats -> Bebouwd);
    /// daarna loopt de bezetting op (mensen trekken erin, bedrijven nemen personeel aan).
    ///
    /// Vereenvoudiging t.o.v. doc 07: de ontwikkelaar is hier anoniem (EigenaarType
    /// Projectontwikkelaar zonder OwnerEntity). De biedingsronde met echte ontwikkelaarsprofielen
    /// kan deze plek later overnemen zonder dat de rest verandert.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct GebouwGroeiSystem : ISystem
    {
        float _startAccumulator;
        uint _teller;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<SimTijdData>();
            state.RequireForUpdate<StadVraagData>();
            _teller = 1;
        }

        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;

            var tijd = SystemAPI.GetSingleton<SimTijdData>();
            float dt = SystemAPI.Time.DeltaTime * tijd.Snelheid;
            if (dt <= 0f)
                return;
            tijd.Dagen += dt / SimTijdConstanten.SecondenPerDag;
            SystemAPI.SetSingleton(tijd);
            double dagen = tijd.Dagen;

            var vraag = SystemAPI.GetSingleton<StadVraagData>();

            // 1. Bouwvoortgang en bezetting.
            var opgeleverd = new NativeList<Entity>(Allocator.Temp);
            foreach (var gebouw in SystemAPI.Query<RefRW<GebouwData>>())
            {
                if (!gebouw.ValueRO.Klaar)
                {
                    float bouwduur = 8f + 1.6f * gebouw.ValueRO.Verdiepingen;
                    float voortgang = math.min(1f, gebouw.ValueRO.BouwVoortgang + dt / bouwduur);
                    gebouw.ValueRW.BouwVoortgang = voortgang;
                    if (voortgang >= 1f)
                    {
                        gebouw.ValueRW.Klaar = true;
                        opgeleverd.Add(gebouw.ValueRO.Kavel);
                    }
                }
                else if (gebouw.ValueRO.Bezetting < 1f)
                {
                    float v = vraag.VoorZone(gebouw.ValueRO.Zone);
                    gebouw.ValueRW.Bezetting = math.min(1f, gebouw.ValueRO.Bezetting + dt * 0.035f * (0.35f + v));
                }
            }

            var bouwKlaar = new KavelStatusTransitions.TransitionOptions { BouwtijdVerstreken = true };
            for (int i = 0; i < opgeleverd.Length; i++)
            {
                if (em.Exists(opgeleverd[i]))
                    KavelStatusTransitions.TryTransition(em, opgeleverd[i], KavelStatus.Bebouwd, bouwKlaar, dagen);
            }
            opgeleverd.Dispose();

            // 2. Nieuwe bouwprojecten, een paar keer per spelseconde.
            _startAccumulator += dt;
            if (_startAccumulator < 0.3f)
                return;
            _startAccumulator = 0f;

            var kandidaten = new NativeList<Entity>(Allocator.Temp);
            var kandidaatZones = new NativeList<ZoneType>(Allocator.Temp);
            foreach (var (core, zone, entity) in SystemAPI.Query<RefRO<KavelCore>, RefRO<KavelZoneData>>().WithEntityAccess())
            {
                if (zone.ValueRO.Zone == ZoneType.Geen) continue;
                if (core.ValueRO.Status != KavelStatus.Bouwkavel) continue;
                if (core.ValueRO.Gebouw != Entity.Null) continue;
                if (core.ValueRO.Ontsluiting == Entity.Null) continue;
                kandidaten.Add(entity);
                kandidaatZones.Add(zone.ValueRO.Zone);
            }

            if (kandidaten.Length > 0)
            {
                _teller++;
                var rng = new Random(math.max(1u, _teller * 7919u + 17u));
                int pogingen = math.min(3, kandidaten.Length);
                for (int p = 0; p < pogingen && kandidaten.Length > 0; p++)
                {
                    int idx = rng.NextInt(0, kandidaten.Length);
                    Entity kavel = kandidaten[idx];
                    ZoneType zone = kandidaatZones[idx];
                    kandidaten.RemoveAtSwapBack(idx);
                    kandidaatZones.RemoveAtSwapBack(idx);

                    if (rng.NextFloat() > vraag.VoorZone(zone))
                        continue;

                    StartBouw(em, kavel, zone, rng.NextUInt(), dagen);
                }
            }

            kandidaten.Dispose();
            kandidaatZones.Dispose();
        }

        static void StartBouw(EntityManager em, Entity kavel, ZoneType zone, uint seed, double dagen)
        {
            Entity gebouw = GebouwOntwerpUtility.MaakGebouw(em, kavel, zone, seed);
            if (gebouw == Entity.Null)
                return;

            var eigenaar = new KavelEigenaarData { Type = EigenaarType.Projectontwikkelaar, OwnerEntity = Entity.Null };
            if (em.HasComponent<KavelEigenaarData>(kavel))
                em.SetComponentData(kavel, eigenaar);
            else
                em.AddComponentData(kavel, eigenaar);

            var vergunning = new KavelStatusTransitions.TransitionOptions { VergunningAfgegeven = true };
            if (!KavelStatusTransitions.TryTransition(em, kavel, KavelStatus.Bouwplaats, vergunning, dagen))
            {
                em.DestroyEntity(gebouw);
                return;
            }

            var core = em.GetComponentData<KavelCore>(kavel);
            core.Gebouw = gebouw;
            core.BouwPeriode = BouwPeriode.Modern;
            em.SetComponentData(kavel, core);
        }
    }
}
