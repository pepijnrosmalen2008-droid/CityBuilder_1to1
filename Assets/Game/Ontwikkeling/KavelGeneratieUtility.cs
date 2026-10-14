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

    /// Section 1's GenereerKavelsLangsWeg. Kavels volgen de spline van het wegsegment (ook in een
    /// bocht): langs de booglengte wordt het segment in gelijke stukken van minstens
    /// MinFrontbreedte verdeeld, en elke kavel staat haaks op de lokale wegrichting.
    /// `AfstandTotEerstvolgendObstakelOfWeg(terrein)` bestaat niet -- diepte is altijd
    /// MaxDiepteVanafWeggrens; overlap met andere wegen en kavels ruimt KavelOpruimUtility op.
    public static class KavelGeneratieUtility
    {
        public static Entity[] GenereerKavelsLangsWeg(EntityManager em, Entity wegsegment, KavelGeneratieRegel regel, int districtId)
        {
            var spline = em.GetBuffer<WegSegmentSplinePunt>(wegsegment);
            if (spline.Length < 2 || regel.MinFrontbreedte <= 0f)
                return System.Array.Empty<Entity>();

            int n = spline.Length;
            var punten = new float3[n];
            var afstanden = new float[n];
            for (int i = 0; i < n; i++)
            {
                punten[i] = spline[i].Punt;
                if (i > 0)
                    afstanden[i] = afstanden[i - 1] + math.distance(punten[i - 1], punten[i]);
            }

            float lengte = afstanden[n - 1];
            int aantalPerRij = (int)math.floor(lengte / regel.MinFrontbreedte);
            if (aantalPerRij < 1)
                return System.Array.Empty<Entity>();

            // Gelijk verdelen zodat er geen restje aan het eind overblijft.
            var verdeeld = regel;
            verdeeld.MinFrontbreedte = lengte / aantalPerRij;

            var resultaten = new System.Collections.Generic.List<Entity>(aantalPerRij * 2);
            for (int i = 0; i < aantalPerRij; i++)
            {
                float s = (i + 0.5f) * verdeeld.MinFrontbreedte;
                PuntOpAfstand(punten, afstanden, s, out float3 frontMidden, out float3 richting);
                float3 zijkant = math.normalize(math.cross(new float3(0, 1, 0), richting));

                resultaten.Add(MaakKavel(em, frontMidden, richting, -zijkant, verdeeld, wegsegment, districtId));
                resultaten.Add(MaakKavel(em, frontMidden, richting, zijkant, verdeeld, wegsegment, districtId));
            }

            return resultaten.ToArray();
        }

        static void PuntOpAfstand(float3[] punten, float[] afstanden, float s, out float3 punt, out float3 richting)
        {
            int n = punten.Length;
            for (int i = 0; i < n - 1; i++)
            {
                float segLengte = afstanden[i + 1] - afstanden[i];
                if (segLengte < 0.0001f)
                    continue;
                if (s <= afstanden[i + 1] || i == n - 2)
                {
                    float t = math.saturate((s - afstanden[i]) / segLengte);
                    punt = math.lerp(punten[i], punten[i + 1], t);
                    float3 d = punten[i + 1] - punten[i];
                    d.y = 0f;
                    richting = math.normalizesafe(d, new float3(1, 0, 0));
                    return;
                }
            }

            punt = punten[0];
            richting = new float3(1, 0, 0);
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
