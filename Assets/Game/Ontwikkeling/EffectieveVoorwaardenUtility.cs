using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Plain result struct (geen ECS-component) van ResolveEffectieveVoorwaarden. Draagt alle
    /// Bouwregels-velden over (ook de velden die OntwikkelrichtlijnData niet kan overschrijven --
    /// section 6 noemt alleen bouwstijl/max_hoogte/functiemix/min_energielabel/sociale-woningbouw/
    /// esthetische_eis/acceptatiebeleid als overschrijfbaar), plus de nieuwe doc-07-only velden.
    public struct EffectieveVoorwaarden
    {
        public float BebouwingspercentageMax;
        public float BouwhoogteMax;
        public float MinAfstandBuren;
        public float MinGroenPercentage;
        public float Parkeernorm;
        public float GeluidseisMaxDb;
        public Energielabel EnergielabelMin;

        public bool HeeftBouwstijl;
        public BouwPeriode Bouwstijl;
        public float VerplichtPercentageSocialeWoningbouw;
        public bool HeeftEsthetischeEis;
        public Welstandsniveau EsthetischeEis;
        public bool HeeftAcceptatiebeleid;
        public AcceptatieBeleid Acceptatiebeleid;

        /// Meest specifieke richtlijn met een ingevulde verplichte functiemix, anders het
        /// bestemmingsplan's eigen functies. Managed List is prima hier -- dit is geen component.
        public System.Collections.Generic.List<FunctieAandeelBufferElement> EffectieveFunctiemix;
    }

    /// Section 6's overervingsregel: specifieker wint (Gebied -> Straat -> Kavel), altijd
    /// startend vanaf het bestemmingsplan als wettelijke ondergrens. Elke numerieke overschrijving
    /// kan de regel alleen verstrengen, nooit verruimen -- vandaar math.min/math.max per veld
    /// naargelang welke richting "strenger" betekent voor dat specifieke veld.
    public static class EffectieveVoorwaardenUtility
    {
        public static EffectieveVoorwaarden ResolveEffectieveVoorwaarden(EntityManager em, Entity kavel)
        {
            var kavelCore = em.GetComponentData<KavelCore>(kavel);
            var bouwregels = em.HasComponent<BouwregelsData>(kavelCore.Bestemmingsplan)
                ? em.GetComponentData<BouwregelsData>(kavelCore.Bestemmingsplan)
                : default;

            var effectief = new EffectieveVoorwaarden
            {
                BebouwingspercentageMax = bouwregels.BebouwingspercentageMax,
                BouwhoogteMax = bouwregels.BouwhoogteMax,
                MinAfstandBuren = bouwregels.MinAfstandBuren,
                MinGroenPercentage = bouwregels.MinGroenPercentage,
                Parkeernorm = bouwregels.Parkeernorm,
                GeluidseisMaxDb = bouwregels.GeluidseisMaxDb,
                EnergielabelMin = bouwregels.EnergielabelMin,
                VerplichtPercentageSocialeWoningbouw = 0f,
                EffectieveFunctiemix = em.HasBuffer<FunctieAandeelBufferElement>(kavelCore.Bestemmingsplan)
                    ? KopieerNaarLijst(em.GetBuffer<FunctieAandeelBufferElement>(kavelCore.Bestemmingsplan))
                    : new System.Collections.Generic.List<FunctieAandeelBufferElement>(),
            };

            var richtlijnenQuery = em.CreateEntityQuery(typeof(OntwikkelrichtlijnData));
            var alleRichtlijnen = richtlijnenQuery.ToComponentDataArray<OntwikkelrichtlijnData>(Allocator.Temp);
            var richtlijnEntiteiten = richtlijnenQuery.ToEntityArray(Allocator.Temp);

            OntwikkelrichtlijnData? gebied = null;
            OntwikkelrichtlijnData? straat = null;
            OntwikkelrichtlijnData? kavelRichtlijn = null;
            Entity gebiedEntiteit = Entity.Null, straatEntiteit = Entity.Null, kavelRichtlijnEntiteit = Entity.Null;

            for (int i = 0; i < alleRichtlijnen.Length; i++)
            {
                var r = alleRichtlijnen[i];
                switch (r.ScopeType)
                {
                    case ScopeType.Gebied:
                        if (em.HasComponent<DistrictData>(r.ScopeReferentie)
                            && em.GetComponentData<DistrictData>(r.ScopeReferentie).DistrictId == kavelCore.DistrictId)
                        {
                            gebied = r;
                            gebiedEntiteit = richtlijnEntiteiten[i];
                        }
                        break;
                    case ScopeType.Straat:
                        if (r.ScopeReferentie == kavelCore.Ontsluiting)
                        {
                            straat = r;
                            straatEntiteit = richtlijnEntiteiten[i];
                        }
                        break;
                    case ScopeType.Kavel:
                        if (r.ScopeReferentie == kavel)
                        {
                            kavelRichtlijn = r;
                            kavelRichtlijnEntiteit = richtlijnEntiteiten[i];
                        }
                        break;
                }
            }

            if (gebied.HasValue) OverschrijfWaarIngevuld(em, ref effectief, gebied.Value, gebiedEntiteit);
            if (straat.HasValue) OverschrijfWaarIngevuld(em, ref effectief, straat.Value, straatEntiteit);
            if (kavelRichtlijn.HasValue) OverschrijfWaarIngevuld(em, ref effectief, kavelRichtlijn.Value, kavelRichtlijnEntiteit);

            alleRichtlijnen.Dispose();
            richtlijnEntiteiten.Dispose();

            return effectief;
        }

        static void OverschrijfWaarIngevuld(EntityManager em, ref EffectieveVoorwaarden effectief, in OntwikkelrichtlijnData richtlijn, Entity richtlijnEntiteit)
        {
            if (richtlijn.HeeftMaxHoogte)
                effectief.BouwhoogteMax = math.min(effectief.BouwhoogteMax, richtlijn.MaxHoogte);

            if (richtlijn.HeeftMinEnergielabel)
                effectief.EnergielabelMin = (Energielabel)math.min((int)effectief.EnergielabelMin, (int)richtlijn.MinEnergielabel);

            if (richtlijn.HeeftSocialeWoningbouwEis)
                effectief.VerplichtPercentageSocialeWoningbouw = math.max(effectief.VerplichtPercentageSocialeWoningbouw, richtlijn.VerplichtPercentageSocialeWoningbouw);

            if (richtlijn.HeeftBouwstijl)
            {
                effectief.HeeftBouwstijl = true;
                effectief.Bouwstijl = richtlijn.Bouwstijl;
            }

            if (richtlijn.HeeftEsthetischeEis)
            {
                effectief.HeeftEsthetischeEis = true;
                effectief.EsthetischeEis = richtlijn.EsthetischeEis;
            }

            if (richtlijn.HeeftAcceptatiebeleid)
            {
                effectief.HeeftAcceptatiebeleid = true;
                effectief.Acceptatiebeleid = richtlijn.Acceptatiebeleid;
            }

            if (em.HasBuffer<FunctieAandeelBufferElement>(richtlijnEntiteit))
            {
                var functiemix = em.GetBuffer<FunctieAandeelBufferElement>(richtlijnEntiteit);
                if (functiemix.Length > 0)
                    effectief.EffectieveFunctiemix = KopieerNaarLijst(functiemix);
            }
        }

        static System.Collections.Generic.List<FunctieAandeelBufferElement> KopieerNaarLijst(DynamicBuffer<FunctieAandeelBufferElement> buffer)
        {
            var lijst = new System.Collections.Generic.List<FunctieAandeelBufferElement>(buffer.Length);
            for (int i = 0; i < buffer.Length; i++)
                lijst.Add(buffer[i]);
            return lijst;
        }
    }
}
