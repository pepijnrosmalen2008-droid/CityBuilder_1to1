using Unity.Entities;

namespace CityBuilder.Game.Kavellen
{
    /// Section 3's ontwikkelcyclus, enforced as a static gate rather than a per-frame system --
    /// transitions are event-driven (player/AI actions), not tick-driven. This is the datamodel-
    /// level enforcement section 1 asks for: "een kavel zonder ontsluiting kan nooit van status
    /// wisselen naar Bouwkavel" is structurally impossible to bypass here, since Bouwkavel is
    /// only reachable via the one switch case that checks Ontsluiting != Entity.Null.
    ///
    /// Costs, permits, and bidding acceptance are caller-supplied facts (via TransitionOptions)
    /// rather than something this utility decides -- section 7 leaves "how is a developer's
    /// accepted bid modelled" an open question, so this only checks that an owner has already
    /// been assigned by whatever system ends up answering that question.
    public static class KavelStatusTransitions
    {
        public struct TransitionOptions
        {
            public bool VergunningAfgegeven;
            public bool BouwtijdVerstreken;
        }

        public static bool TryTransition(EntityManager em, Entity kavel, KavelStatus naarStatus, in TransitionOptions opties, double huidigeTijd)
        {
            var core = em.GetComponentData<KavelCore>(kavel);
            if (!IsToegestaneTransitie(em, kavel, core, naarStatus, opties))
                return false;

            core.Status = naarStatus;
            em.SetComponentData(kavel, core);

            if (em.HasBuffer<KavelEventBufferElement>(kavel))
            {
                var historie = em.GetBuffer<KavelEventBufferElement>(kavel);
                historie.Add(new KavelEventBufferElement { Type = KavelEventType.StatusGewijzigd, Tijdstip = huidigeTijd });
            }

            if (!em.HasComponent<GrondwaardeDirty>(kavel))
                em.AddComponent<GrondwaardeDirty>(kavel);

            return true;
        }

        static bool IsToegestaneTransitie(EntityManager em, Entity kavel, in KavelCore core, KavelStatus naar, in TransitionOptions opties)
        {
            return (core.Status, naar) switch
            {
                (KavelStatus.Natuur, KavelStatus.Landbouwgrond) => true,
                (KavelStatus.Landbouwgrond, KavelStatus.BouwrijpGemaakt) => true,
                (KavelStatus.BouwrijpGemaakt, KavelStatus.Bouwkavel) =>
                    core.Ontsluiting != Entity.Null && core.Bestemmingsplan != Entity.Null,
                (KavelStatus.Bouwkavel, KavelStatus.Bouwplaats) =>
                    opties.VergunningAfgegeven && HeeftGeaccepteerdBod(em, kavel),
                (KavelStatus.Bouwplaats, KavelStatus.Bebouwd) => opties.BouwtijdVerstreken,
                (KavelStatus.Bebouwd, KavelStatus.InHerontwikkeling) => true,
                (KavelStatus.InHerontwikkeling, KavelStatus.Bebouwd) => true,
                _ => false,
            };
        }

        static bool HeeftGeaccepteerdBod(EntityManager em, Entity kavel)
        {
            if (!em.HasComponent<KavelEigenaarData>(kavel))
                return false;

            return em.GetComponentData<KavelEigenaarData>(kavel).Type == EigenaarType.Projectontwikkelaar;
        }
    }
}
