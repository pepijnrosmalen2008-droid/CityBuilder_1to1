using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Stad
{
    /// Bepaalt wat er op een kavel komt te staan: vorm, footprint, verdiepingen en functie per
    /// verdieping. Maten volgen gangbare Nederlandse bouw: rijwoning ~5,4 m breed en ~9,5 m diep,
    /// galerij-/portiekflat ~14 m diep, kantoor ~20 m diep (daglicht tot de kern), bedrijfshal
    /// ~30 m diep.
    public static class GebouwOntwerpUtility
    {
        public static Entity MaakGebouw(EntityManager em, Entity kavel, ZoneType zone, uint seed)
        {
            if (!em.HasBuffer<KavelGeometriePunt>(kavel))
                return Entity.Null;

            var geo = em.GetBuffer<KavelGeometriePunt>(kavel);
            if (geo.Length < 4)
                return Entity.Null;

            float2 p0 = geo[0].Punt, p1 = geo[1].Punt, p3 = geo[3].Punt;
            float2 langs = p1 - p0;
            float kavelBreedte = math.length(langs);
            float2 naarBinnen = p3 - p0;
            float kavelDiepte = math.length(naarBinnen);
            if (kavelBreedte < 4f || kavelDiepte < 8f)
                return Entity.Null;
            naarBinnen /= kavelDiepte;
            float2 frontMidden = (p0 + p1) * 0.5f;

            var core = em.GetComponentData<KavelCore>(kavel);
            float wegHalf = WegProfielUtility.HalveBreedte(em, core.Ontsluiting);

            var rng = new Random(seed == 0 ? 1u : seed);
            GebouwVorm vorm;
            float breedte, diepte, terugligging;
            int lagen;
            int eenheden = 1;

            switch (zone)
            {
                case ZoneType.WonenLaag:
                    vorm = GebouwVorm.Rijwoningen;
                    lagen = rng.NextFloat() < 0.65f ? 2 : 3;
                    eenheden = math.max(2, (int)math.round(kavelBreedte / 5.4f));
                    breedte = kavelBreedte - 0.1f;
                    diepte = rng.NextFloat(9f, 10.5f);
                    terugligging = rng.NextFloat(3f, 5f);
                    break;
                case ZoneType.WonenHoog:
                    vorm = GebouwVorm.Appartementen;
                    lagen = rng.NextInt(4, 10);
                    breedte = kavelBreedte - 3f;
                    diepte = rng.NextFloat(12f, 15f);
                    terugligging = rng.NextFloat(4f, 6f);
                    break;
                case ZoneType.Gemengd:
                    vorm = GebouwVorm.WinkelsMetWonen;
                    lagen = rng.NextInt(3, 6);
                    breedte = kavelBreedte - 0.1f;
                    diepte = rng.NextFloat(12f, 15f);
                    terugligging = 0.3f;
                    break;
                case ZoneType.Kantoor:
                    vorm = GebouwVorm.Kantoortoren;
                    lagen = rng.NextInt(6, 15);
                    breedte = kavelBreedte - 3f;
                    diepte = rng.NextFloat(17f, 22f);
                    terugligging = rng.NextFloat(4f, 6f);
                    break;
                case ZoneType.Industrie:
                    vorm = GebouwVorm.Bedrijfshal;
                    lagen = 1;
                    breedte = kavelBreedte - 3f;
                    diepte = rng.NextFloat(24f, 32f);
                    terugligging = rng.NextFloat(6f, 9f);
                    break;
                default:
                    return Entity.Null;
            }

            float beschikbaar = kavelDiepte - wegHalf - terugligging - 2f;
            if (beschikbaar < 6f)
                return Entity.Null;
            diepte = math.min(diepte, beschikbaar);

            Entity gebouw = em.CreateEntity(typeof(GebouwData), typeof(VerdiepingBufferElement), typeof(GebouwCapaciteitData));
            var verdiepingen = em.GetBuffer<VerdiepingBufferElement>(gebouw);
            VulVerdiepingen(verdiepingen, vorm, lagen, ref rng);

            // Bouwhoogte uit het bestemmingsplan respecteren: verdiepingen eraf tot het past.
            if (core.BouwhoogteMax > 0.5f)
            {
                while (verdiepingen.Length > 1 && TotaleHoogte(verdiepingen) > core.BouwhoogteMax)
                    verdiepingen.RemoveAt(verdiepingen.Length - 1);
            }

            var capaciteit = FunctieKengetallen.Bereken(vorm, breedte * diepte, verdiepingen, eenheden);
            int aantalLagen = verdiepingen.Length;

            float2 centrum = frontMidden + naarBinnen * (wegHalf + terugligging + diepte * 0.5f);

            em.SetComponentData(gebouw, capaciteit);
            em.SetComponentData(gebouw, new GebouwData
            {
                Kavel = kavel,
                Zone = zone,
                Vorm = vorm,
                Centrum = centrum,
                Voor = -naarBinnen,
                Breedte = breedte,
                Diepte = diepte,
                Verdiepingen = aantalLagen,
                Eenheden = eenheden,
                Seed = rng.NextUInt(),
                BouwVoortgang = 0f,
                Bezetting = 0f,
                Klaar = false,
            });

            return gebouw;
        }

        static void VulVerdiepingen(DynamicBuffer<VerdiepingBufferElement> buffer, GebouwVorm vorm, int lagen, ref Random rng)
        {
            for (int i = 0; i < lagen; i++)
            {
                bool bg = i == 0;
                FunctieType functie = vorm switch
                {
                    GebouwVorm.WinkelsMetWonen => bg ? (rng.NextFloat() < 0.25f ? FunctieType.Horeca : FunctieType.Detailhandel) : FunctieType.Wonen,
                    GebouwVorm.Kantoortoren => FunctieType.Kantoor,
                    GebouwVorm.Bedrijfshal => FunctieType.Industrie,
                    _ => FunctieType.Wonen,
                };
                buffer.Add(new VerdiepingBufferElement { Functie = functie, Hoogte = FunctieKengetallen.VerdiepingHoogte(functie, bg) });
            }
        }

        public static float TotaleHoogte(DynamicBuffer<VerdiepingBufferElement> verdiepingen)
        {
            float h = 0f;
            for (int i = 0; i < verdiepingen.Length; i++)
                h += verdiepingen[i].Hoogte;
            return h;
        }
    }
}
