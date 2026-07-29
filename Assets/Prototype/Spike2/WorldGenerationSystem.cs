using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Prototype.Spike2
{
    /// Section 4, step 2: generates the whole synthetic world once, as Entities (not
    /// GameObjects -- that's the entire point of this spike). Runs in OnCreate, which the
    /// default world calls exactly once at startup, so no extra "have I run yet" bookkeeping
    /// is needed. Not Burst-compiled on purpose: this is one-off setup work using plain
    /// EntityManager calls, not a per-frame hot path.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateBefore(typeof(SimClockSystem))]
    public partial struct WorldGenerationSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;
            var rng = new Unity.Mathematics.Random(12345);

            GenerateClock(em);
            GenerateDistricts(em);
            GenerateRoadNetwork(em, ref rng);
            GenerateWaterBodies(em, ref rng);
            GenerateDevelopers(em, ref rng);
            GenerateKavels(em, ref rng);
        }

        static void GenerateClock(EntityManager em)
        {
            Entity clockEntity = em.CreateEntity(typeof(SimClockData));
            em.SetComponentData(clockEntity, new SimClockData
            {
                ElapsedRealSeconds = 0,
                HuidigeDag = 0,
                VolgendeTrafficTick = 0,
            });
        }

        static void GenerateDistricts(EntityManager em)
        {
            for (int d = 0; d < Spike2Config.DistrictCount; d++)
            {
                Entity district = em.CreateEntity(typeof(DistrictData));
                em.SetComponentData(district, new DistrictData
                {
                    DistrictId = d,
                    VraagAanbodIndex = 0.5f,
                    KavelCount = 0,
                });
            }
        }

        static void GenerateRoadNetwork(EntityManager em, ref Unity.Mathematics.Random rng)
        {
            int gridSize = (int)math.ceil(math.sqrt(Spike2Config.RoadNodeTarget));
            var nodes = new Entity[gridSize * gridSize];

            for (int z = 0; z < gridSize; z++)
            {
                for (int x = 0; x < gridSize; x++)
                {
                    int idx = z * gridSize + x;
                    Entity node = em.CreateEntity(typeof(WegNodeData), typeof(WegSegmentBuffer));
                    em.SetComponentData(node, new WegNodeData { Positie = new float3(x * 40f, 0f, z * 40f) });
                    nodes[idx] = node;
                }
            }

            for (int z = 0; z < gridSize; z++)
            {
                for (int x = 0; x < gridSize; x++)
                {
                    int idx = z * gridSize + x;
                    if (x + 1 < gridSize)
                        AddBidirectionalEdge(em, nodes, idx, idx + 1, ref rng);
                    if (z + 1 < gridSize)
                        AddBidirectionalEdge(em, nodes, idx, idx + gridSize, ref rng);
                }
            }
        }

        static void AddBidirectionalEdge(EntityManager em, Entity[] nodes, int aIdx, int bIdx, ref Unity.Mathematics.Random rng)
        {
            float capaciteit = rng.NextFloat(200f, 1000f);
            em.GetBuffer<WegSegmentBuffer>(nodes[aIdx]).Add(new WegSegmentBuffer { NaarNode = nodes[bIdx], Capaciteit = capaciteit, HuidigeFlow = 0f });
            em.GetBuffer<WegSegmentBuffer>(nodes[bIdx]).Add(new WegSegmentBuffer { NaarNode = nodes[aIdx], Capaciteit = capaciteit, HuidigeFlow = 0f });
        }

        static void GenerateWaterBodies(EntityManager em, ref Unity.Mathematics.Random rng)
        {
            for (int w = 0; w < Spike2Config.WaterBodyCount; w++)
            {
                Entity water = em.CreateEntity(typeof(WaterLichaamData), typeof(WaterDirty));
                float capaciteit = rng.NextFloat(500f, 2000f);
                em.SetComponentData(water, new WaterLichaamData
                {
                    Peil = capaciteit * 0.5f,
                    Capaciteit = capaciteit,
                    Inflow = rng.NextFloat(5f, 20f),
                    Outflow = rng.NextFloat(5f, 20f),
                });
            }
        }

        static void GenerateDevelopers(EntityManager em, ref Unity.Mathematics.Random rng)
        {
            for (int p = 0; p < Spike2Config.DeveloperCount; p++)
            {
                Entity dev = em.CreateEntity(typeof(ProjectontwikkelaarData));
                em.SetComponentData(dev, new ProjectontwikkelaarData
                {
                    Budget = rng.NextFloat(200000f, 5000000f),
                    RisicoProfiel = rng.NextFloat(0f, 1f),
                    ActieveBiedingen = 0,
                });
            }
        }

        static void GenerateKavels(EntityManager em, ref Unity.Mathematics.Random rng)
        {
            const int bestemmingCount = 5; // aantal Bestemmingsplan-waarden

            for (int k = 0; k < Spike2Config.KavelCount; k++)
            {
                Entity kavel = em.CreateEntity(typeof(KavelData));
                var status = rng.NextFloat() < 0.3f ? OntwikkelStatus.BeschikbaarVoorBod : OntwikkelStatus.Voltooid;

                em.SetComponentData(kavel, new KavelData
                {
                    DistrictId = rng.NextInt(0, Spike2Config.DistrictCount),
                    Bestemmingsplan = (Bestemmingsplan)rng.NextInt(0, bestemmingCount),
                    Status = status,
                    Oppervlakte = rng.NextFloat(150f, 2500f),
                    ResiduleGrondwaarde = rng.NextFloat(20000f, 800000f),
                    HuidigeEigenaarIndex = -1,
                });

                if (status == OntwikkelStatus.BeschikbaarVoorBod)
                    em.AddComponent<BiedingVereist>(kavel);
            }
        }

        public void OnUpdate(ref SystemState state) { }
    }
}
