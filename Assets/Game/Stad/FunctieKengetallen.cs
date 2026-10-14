using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Stad
{
    /// Kengetallen waarmee een gebouw van vloeroppervlak naar mensen gaat. Orde van grootte voor
    /// Nederland (CBS/vastgoedpraktijk), geen officiële norm -- bewust op één plek zodat ze
    /// makkelijk bij te stellen zijn. Alles in bruto vloeroppervlak (bvo).
    public static class FunctieKengetallen
    {
        /// Deel van de inwoners dat tot de beroepsbevolking hoort (werkend of werkzoekend).
        public const float BeroepsbevolkingAandeel = 0.52f;

        /// Gemiddelde woninggrootte in m² bvo per gebouwvorm.
        public static float WoningBvo(GebouwVorm vorm) => vorm switch
        {
            GebouwVorm.Rijwoningen => 125f,
            GebouwVorm.WinkelsMetWonen => 85f,
            _ => 80f,
        };

        /// Personen per huishouden: gezinnen in rijwoningen, kleinere huishoudens in appartementen.
        /// Gewogen komt dit uit rond het landelijk gemiddelde van ~2,1.
        public static float Huishoudgrootte(GebouwVorm vorm) => vorm switch
        {
            GebouwVorm.Rijwoningen => 2.6f,
            GebouwVorm.WinkelsMetWonen => 1.7f,
            _ => 1.8f,
        };

        /// m² bvo per arbeidsplaats.
        public static float BvoPerArbeidsplaats(FunctieType f) => f switch
        {
            FunctieType.Detailhandel => 45f,
            FunctieType.Horeca => 30f,
            FunctieType.Kantoor => 24f,
            FunctieType.Industrie => 95f,
            FunctieType.Maatschappelijk => 40f,
            _ => 0f,
        };

        /// Verdiepingshoogte (vloer tot vloer) in meters.
        public static float VerdiepingHoogte(FunctieType f, bool beganeGrond) => f switch
        {
            FunctieType.Wonen => beganeGrond ? 3.0f : 2.9f,
            FunctieType.Detailhandel => 4.4f,
            FunctieType.Horeca => 4.2f,
            FunctieType.Kantoor => beganeGrond ? 4.8f : 3.7f,
            FunctieType.Industrie => 9.0f,
            FunctieType.Maatschappelijk => 3.8f,
            _ => 3.0f,
        };

        public static GebouwCapaciteitData Bereken(GebouwVorm vorm, float footprintM2, DynamicBuffer<VerdiepingBufferElement> lagen, int eenheden)
        {
            var c = new GebouwCapaciteitData();
            int wonenLagen = 0;

            for (int i = 0; i < lagen.Length; i++)
            {
                var functie = lagen[i].Functie;
                c.Vloeroppervlak += footprintM2;

                if (functie == FunctieType.Wonen)
                {
                    wonenLagen++;
                    continue;
                }

                float perBaan = BvoPerArbeidsplaats(functie);
                int banen = perBaan > 0f ? (int)math.round(footprintM2 / perBaan) : 0;
                switch (functie)
                {
                    case FunctieType.Detailhandel: c.BanenDetailhandel += banen; break;
                    case FunctieType.Horeca: c.BanenHoreca += banen; break;
                    case FunctieType.Kantoor: c.BanenKantoor += banen; break;
                    case FunctieType.Industrie: c.BanenIndustrie += banen; break;
                    default: c.BanenOverig += banen; break;
                }
            }

            if (wonenLagen > 0)
            {
                // Rijwoningen: één woning per eenheid, over alle verdiepingen heen.
                c.Woningen = vorm == GebouwVorm.Rijwoningen
                    ? math.max(1, eenheden)
                    : math.max(1, (int)math.floor(footprintM2 * wonenLagen / WoningBvo(vorm)));
                c.Bewoners = (int)math.round(c.Woningen * Huishoudgrootte(vorm));
            }

            return c;
        }
    }
}
