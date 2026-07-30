using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Section 5's BepaalAantalBiedingen + section 4/7's Bod-generatie-en-filtering, placeholder-
    /// drempels/formule net als elders in dit cluster -- retune zodra er echte balans-tests zijn.
    public static class BiedingsFlowConstanten
    {
        public const float ReferentieMarktwaarde = 500000f; // "een zeer aantrekkelijke kavel" op deze schaal
        public const float LageDrempel = 0.3f;
        public const float GemiddeldeDrempel = 0.6f;
        public const float HogeDrempel = 1.0f;
        public const double StandaardVervaltermijnSeconden = 172800.0; // 48 (spel-)uur, placeholder
    }

    public static class BiedingsFlowUtility
    {
        /// Section 5's BepaalAantalBiedingen. `rng` wordt meegegeven zodat de 2-3/4-5-ranges
        /// deterministisch getest kunnen worden vanuit een test-bootstrap.
        public static int BepaalAantalBiedingen(EntityManager em, Entity kavel, ref Unity.Mathematics.Random rng)
        {
            var kavelCore = em.GetComponentData<KavelCore>(kavel);
            if (kavelCore.Bestemmingsplan == Entity.Null || !em.HasBuffer<FunctieAandeelBufferElement>(kavelCore.Bestemmingsplan))
                return 0;

            var functies = em.GetBuffer<FunctieAandeelBufferElement>(kavelCore.Bestemmingsplan);
            if (functies.Length == 0)
                return 0;

            var vraagAanbodQuery = em.CreateEntityQuery(typeof(VraagAanbodIndexData));
            var alleIndexen = vraagAanbodQuery.ToComponentDataArray<VraagAanbodIndexData>(Allocator.Temp);

            float somVerhouding = 0f;
            int aantalGevonden = 0;
            for (int i = 0; i < functies.Length; i++)
            {
                for (int j = 0; j < alleIndexen.Length; j++)
                {
                    if (alleIndexen[j].DistrictId == kavelCore.DistrictId && alleIndexen[j].Functie == functies[i].Functie)
                    {
                        somVerhouding += alleIndexen[j].Verhouding;
                        aantalGevonden++;
                        break;
                    }
                }
            }
            alleIndexen.Dispose();

            float gemVerhouding = aantalGevonden > 0 ? somVerhouding / aantalGevonden : 1f;
            float genormaliseerdeWaarde = math.saturate(kavelCore.Marktwaarde / BiedingsFlowConstanten.ReferentieMarktwaarde);
            float aantrekkelijkheid = genormaliseerdeWaarde * gemVerhouding;

            if (aantrekkelijkheid < BiedingsFlowConstanten.LageDrempel) return 0;
            if (aantrekkelijkheid < BiedingsFlowConstanten.GemiddeldeDrempel) return 1;
            if (aantrekkelijkheid < BiedingsFlowConstanten.HogeDrempel) return rng.NextInt(2, 4); // 2-3
            return rng.NextInt(4, 6); // 4-5
        }

        /// Section 4: "Een OntwikkelingsPlan dat buiten de geldende grenzen valt, wordt niet eens
        /// als geldig bod gegenereerd." Retourneert null bij een ongeldig plan i.p.v. een Bod met
        /// Status.Afgewezen aan te maken -- het plan bestaat dan simpelweg niet als kandidaat.
        public static Entity? GenereerBod(EntityManager em, Entity kavel, Entity ontwikkelaar, in EffectieveVoorwaarden voorwaarden,
            float voorgesteldeBouwhoogte, System.Collections.Generic.List<FunctieAandeelBufferElement> voorgesteldeFunctiemix,
            Energielabel voorgesteldEnergielabel, ParkeerOplossing parkeerOplossing, float geschatteBouwtijd, double huidigeTijd)
        {
            if (!ValideerPlan(voorwaarden, voorgesteldeBouwhoogte, voorgesteldeFunctiemix, voorgesteldEnergielabel))
                return null;

            var kavelCore = em.GetComponentData<KavelCore>(kavel);
            var ontwikkelaarData = em.GetComponentData<ProjectontwikkelaarData>(ontwikkelaar);

            // Vereenvoudigde plan-specifieke waardebepaling: schaalt de kavel's al berekende
            // Marktwaarde (GrondwaardeSystem) naar rato van hoe volledig het plan de toegestane
            // bouwhoogte benut, minus de rendementseis van deze ontwikkelaar. Geen volledige
            // herberekening van de residuele-grondwaarde-formule voor een hypothetisch plan --
            // de doc specificeert die exacte per-plan-herberekening niet verder dan "uit de
            // residuele grondwaarde-berekening".
            float hoogteFactor = voorwaarden.BouwhoogteMax > 0f ? math.saturate(voorgesteldeBouwhoogte / voorwaarden.BouwhoogteMax) : 1f;
            float bodbedrag = math.max(0f, kavelCore.Marktwaarde * hoogteFactor * (1f - ontwikkelaarData.MinRendementseisPercentage));

            Entity bod = em.CreateEntity(typeof(BodData), typeof(OntwikkelingsPlanData), typeof(FunctieAandeelBufferElement));
            em.SetComponentData(bod, new BodData
            {
                Id = new Unity.Entities.Hash128((uint)bod.Index, 7, 0, 0),
                Kavel = kavel,
                Ontwikkelaar = ontwikkelaar,
                Bodbedrag = bodbedrag,
                IngediendOpTijd = huidigeTijd,
                VervaltOpTijd = huidigeTijd + BiedingsFlowConstanten.StandaardVervaltermijnSeconden,
                Status = BodStatus.Ingediend,
            });
            em.SetComponentData(bod, new OntwikkelingsPlanData
            {
                Bouwhoogte = voorgesteldeBouwhoogte,
                Energielabel = voorgesteldEnergielabel,
                ParkeerOplossing = parkeerOplossing,
                GeschatteBouwtijd = geschatteBouwtijd,
            });

            var functiemixBuffer = em.GetBuffer<FunctieAandeelBufferElement>(bod);
            foreach (var f in voorgesteldeFunctiemix)
                functiemixBuffer.Add(f);

            return bod;
        }

        static bool ValideerPlan(in EffectieveVoorwaarden voorwaarden, float bouwhoogte,
            System.Collections.Generic.List<FunctieAandeelBufferElement> functiemix, Energielabel energielabel)
        {
            if (bouwhoogte > voorwaarden.BouwhoogteMax)
                return false;

            // Energielabel A=0 .. G=6 -- een hogere letter is een slechter label.
            if ((int)energielabel > (int)voorwaarden.EnergielabelMin)
                return false;

            foreach (var voorgesteld in functiemix)
            {
                bool toegestaan = false;
                foreach (var bereik in voorwaarden.EffectieveFunctiemix)
                {
                    if (bereik.Functie == voorgesteld.Functie)
                    {
                        // Een concreet plan draagt hier zijn voorgestelde percentage in MinPercentage
                        // (MinPercentage == MaxPercentage voor een enkel plan, in tegenstelling tot
                        // de bereik-vorm die het bestemmingsplan/richtlijnen gebruiken).
                        toegestaan = voorgesteld.MinPercentage >= bereik.MinPercentage && voorgesteld.MinPercentage <= bereik.MaxPercentage;
                        break;
                    }
                }
                if (!toegestaan)
                    return false;
            }
            return true;
        }
    }
}
