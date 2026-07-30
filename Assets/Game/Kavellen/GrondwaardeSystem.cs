using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Kavellen
{
    /// Section 4's residual land value method:
    ///   Grondwaarde = Opbrengstwaarde(bestemmingsplan, bouwregels)
    ///                 - Bouwkosten(geschat)
    ///                 - Bijkomende kosten
    ///                 - Rendementseis ontwikkelaar (%)
    /// The doc deliberately doesn't specify the actual price-per-m2 / cost-per-m2 numbers (that's
    /// real-estate-appraisal detail, out of scope for a technical spec) -- GrondwaardeConstanten
    /// below is a first-pass, clearly-labelled placeholder set so the *shape* of the formula is
    /// right and the actual numbers are trivial to retune once real ones exist.
    public static class GrondwaardeConstanten
    {
        // Prijs per m2 vloeroppervlak, per functie. Volledig gokwerk -- retune zodra er echte
        // grondprijs-/huurwaarde-referenties zijn.
        public static float BasisPrijsPerM2(FunctieType functie) => functie switch
        {
            FunctieType.Wonen => 2500f,
            FunctieType.Detailhandel => 3000f,
            FunctieType.Kantoor => 2200f,
            FunctieType.Horeca => 2000f,
            FunctieType.Industrie => 800f,
            FunctieType.Maatschappelijk => 1000f,
            _ => 1000f,
        };

        public const float BouwkostenPerM2Basis = 1200f;
        public const float BouwkostenHoogtePremiePerLaag = 0.05f;  // hoogbouw is duurder per m2
        public const float VergunningKostenVast = 5000f;
        public const float VergunningKostenPercentageBouwkosten = 0.02f;
        public const float SaneringskostenPerM2Vervuild = 150f;
        public const float RendementseisPercentage = 0.15f;        // 15% van de opbrengstwaarde
        public const float GemiddeldeVerdiepingshoogteMeter = 3.2f;
    }

    /// Event-driven op GrondwaardeDirty, net als de andere systemen in dit cluster -- grondwaarde
    /// hoeft niet elk frame herrekend, alleen als status/bestemmingsplan/omgevingsfactoren
    /// veranderen (KavelOppervlakteSystem en OmgevingsfactorenSystem zetten deze tag zelf).
    public partial struct GrondwaardeSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var functieAandelenLookup = SystemAPI.GetBufferLookup<FunctieAandeelBufferElement>(true);
            var bouwregelsLookup = SystemAPI.GetComponentLookup<BouwregelsData>(true);

            var toClear = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, omgeving, entity) in SystemAPI.Query<RefRW<KavelCore>, RefRO<OmgevingsfactorenData>>()
                         .WithAll<GrondwaardeDirty>().WithEntityAccess())
            {
                float grondwaarde = 0f;

                if (kavel.ValueRO.Bestemmingsplan != Entity.Null
                    && functieAandelenLookup.HasBuffer(kavel.ValueRO.Bestemmingsplan)
                    && bouwregelsLookup.HasComponent(kavel.ValueRO.Bestemmingsplan))
                {
                    var functies = functieAandelenLookup[kavel.ValueRO.Bestemmingsplan];
                    var bouwregels = bouwregelsLookup[kavel.ValueRO.Bestemmingsplan];
                    grondwaarde = BerekenGrondwaarde(kavel.ValueRO, omgeving.ValueRO, functies, bouwregels);
                }

                kavel.ValueRW.Marktwaarde = grondwaarde;
                toClear.Add(entity);
            }

            foreach (var e in toClear)
                state.EntityManager.RemoveComponent<GrondwaardeDirty>(e);

            toClear.Dispose();
        }

        static float BerekenGrondwaarde(in KavelCore kavel, in OmgevingsfactorenData omgeving,
            DynamicBuffer<FunctieAandeelBufferElement> functies, in BouwregelsData bouwregels)
        {
            float bebouwbaarOppervlak = kavel.Oppervlakte * (kavel.BebouwingspercentageMax / 100f);
            int aantalLagen = math.max(1, (int)math.floor(kavel.BouwhoogteMax / GrondwaardeConstanten.GemiddeldeVerdiepingshoogteMeter));
            float vloeroppervlak = bebouwbaarOppervlak * aantalLagen;

            float gewogenPrijsPerM2 = GewogenPrijsPerM2(functies);
            float omgevingsfactor = OmgevingsfactorMultiplier(omgeving);

            float opbrengstwaarde = vloeroppervlak * gewogenPrijsPerM2 * omgevingsfactor;

            float bouwkostenPerM2 = GrondwaardeConstanten.BouwkostenPerM2Basis
                * (1f + aantalLagen * GrondwaardeConstanten.BouwkostenHoogtePremiePerLaag);
            float bouwkosten = vloeroppervlak * bouwkostenPerM2;

            float saneringskosten = omgeving.Bodemkwaliteit == Bodemkwaliteit.Vervuild
                ? kavel.Oppervlakte * GrondwaardeConstanten.SaneringskostenPerM2Vervuild
                : 0f;
            float vergunningkosten = GrondwaardeConstanten.VergunningKostenVast
                + bouwkosten * GrondwaardeConstanten.VergunningKostenPercentageBouwkosten;
            float bijkomendeKosten = saneringskosten + vergunningkosten;

            float rendementseis = opbrengstwaarde * GrondwaardeConstanten.RendementseisPercentage;

            return opbrengstwaarde - bouwkosten - bijkomendeKosten - rendementseis;
        }

        static float GewogenPrijsPerM2(DynamicBuffer<FunctieAandeelBufferElement> functies)
        {
            if (functies.Length == 0)
                return GrondwaardeConstanten.BasisPrijsPerM2(FunctieType.Wonen);

            float totaalGewicht = 0f;
            float totaalPrijs = 0f;
            for (int i = 0; i < functies.Length; i++)
            {
                var f = functies[i];
                float gewicht = (f.MinPercentage + f.MaxPercentage) * 0.5f;
                totaalGewicht += gewicht;
                totaalPrijs += gewicht * GrondwaardeConstanten.BasisPrijsPerM2(f.Functie);
            }

            return totaalGewicht > 0f ? totaalPrijs / totaalGewicht : GrondwaardeConstanten.BasisPrijsPerM2(FunctieType.Wonen);
        }

        /// Section 4: "een kavel met dezelfde bestemming is meer waard bij goede bereikbaarheid
        /// en weinig overlast". Assumes BereikbaarheidScore/UitzichtScore/OverstromingsrisicoScore
        /// are roughly 0-1 and GeluidsbelastingDb is roughly 30-90.
        static float OmgevingsfactorMultiplier(in OmgevingsfactorenData omgeving)
        {
            float factor = 1f
                + omgeving.BereikbaarheidScore * 0.3f
                + omgeving.UitzichtScore * 0.2f
                - (omgeving.GeluidsbelastingDb / 90f) * 0.25f
                - omgeving.OverstromingsrisicoScore * 0.3f;
            return math.clamp(factor, 0.4f, 2f);
        }
    }
}
