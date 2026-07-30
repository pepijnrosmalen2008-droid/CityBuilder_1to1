using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Section 1: plain (non-ECS) config, not a persisted component -- deze regel geldt per
    /// aanroep van GenereerKavelsLangsWeg, niet per kavel opgeslagen.
    public struct KavelGeneratieRegel
    {
        public float MaxDiepteVanafWeggrens; // bijv. 40-60m
        public float MinFrontbreedte;
    }

    /// Section 1's GenereerKavelsLangsWeg. Twee bewuste vereenvoudigingen t.o.v. de pseudocode:
    /// - Gebruikt alleen het eerste en laatste splinepunt van het wegsegment (een rechte lijn),
    ///   geen per-subsegment generatie langs een gebogen spline.
    /// - `AfstandTotEerstvolgendObstakelOfWeg(terrein)` bestaat niet -- er is nog geen obstakel-
    ///   detectie via het terrein, dus diepte is altijd exact MaxDiepteVanafWeggrens. Omdat dit
    ///   nooit meer dan één rij kavels per wegzijde genereert, is de "resterende diepte >
    ///   max_diepte -> geen automatische kavel"-regel hierdoor al automatisch voldaan: er is
    ///   sowieso nooit een tweede rij die de suggestie "tweede ontsluitingsweg nodig" zou triggeren.
    public static class KavelGeneratieUtility
    {
        public static Entity[] GenereerKavelsLangsWeg(EntityManager em, Entity wegsegment, KavelGeneratieRegel regel, int districtId)
        {
            var spline = em.GetBuffer<WegSegmentSplinePunt>(wegsegment);
            if (spline.Length < 2 || regel.MinFrontbreedte <= 0f)
                return System.Array.Empty<Entity>();

            float3 van = spline[0].Punt;
            float3 naar = spline[spline.Length - 1].Punt;
            float lengte = math.distance(van, naar);
            if (lengte < regel.MinFrontbreedte)
                return System.Array.Empty<Entity>();

            float3 richting = math.normalize(naar - van);
            float3 zijkant = math.normalize(math.cross(new float3(0, 1, 0), richting));

            int aantalPerRij = (int)math.floor(lengte / regel.MinFrontbreedte);
            var resultaten = new System.Collections.Generic.List<Entity>(aantalPerRij * 2);

            foreach (float zijdeTeken in new[] { -1f, 1f })
            {
                for (int i = 0; i < aantalPerRij; i++)
                {
                    float3 frontMidden = van + richting * ((i + 0.5f) * regel.MinFrontbreedte);
                    resultaten.Add(MaakKavel(em, frontMidden, richting, zijkant * zijdeTeken, regel, wegsegment, districtId));
                }
            }

            return resultaten.ToArray();
        }

        static Entity MaakKavel(EntityManager em, float3 frontMidden, float3 richting, float3 naarBinnen,
            KavelGeneratieRegel regel, Entity wegsegment, int districtId)
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

            float halveBreedte = regel.MinFrontbreedte * 0.5f;
            float diepte = regel.MaxDiepteVanafWeggrens;

            float3 p0 = frontMidden - richting * halveBreedte;
            float3 p1 = frontMidden + richting * halveBreedte;
            float3 p2 = p1 + naarBinnen * diepte;
            float3 p3 = p0 + naarBinnen * diepte;

            var geometrie = em.GetBuffer<KavelGeometriePunt>(kavel);
            geometrie.Add(new KavelGeometriePunt { Punt = p0.xz });
            geometrie.Add(new KavelGeometriePunt { Punt = p1.xz });
            geometrie.Add(new KavelGeometriePunt { Punt = p2.xz });
            geometrie.Add(new KavelGeometriePunt { Punt = p3.xz });

            em.SetComponentData(kavel, new KavelCore
            {
                Id = new Unity.Entities.Hash128((uint)kavel.Index, 6, 0, 0),
                DistrictId = districtId,
                Oppervlakte = 0f, // KavelOppervlakteSystem berekent dit bij de GeometrieDirty-pass hieronder
                Marktwaarde = 0f,
                BouwPeriode = BouwPeriode.Onbebouwd,
                Bestemmingsplan = Entity.Null,
                BebouwingspercentageMax = 0f,
                BouwhoogteMax = 0f,
                Status = KavelStatus.Natuur,
                Gebouw = Entity.Null,
                Ontsluiting = wegsegment,
            });

            em.SetComponentData(kavel, new KavelEigenaarData { Type = EigenaarType.Geen, OwnerEntity = Entity.Null });
            em.SetComponentData(kavel, new NutsvoorzieningenData { Water = false, Elektriciteit = false, Riolering = false, Internet = false });
            em.SetComponentData(kavel, new OmgevingsfactorenData
            {
                BereikbaarheidScore = 0f,
                UitzichtScore = 0f,
                GeluidsbelastingDb = 45f,
                LuchtkwaliteitIndex = 1f,
                OverstromingsrisicoScore = 0f,
                Bodemkwaliteit = Bodemkwaliteit.Goed,
            });

            em.AddComponent<GeometrieDirty>(kavel);

            return kavel;
        }
    }
}
