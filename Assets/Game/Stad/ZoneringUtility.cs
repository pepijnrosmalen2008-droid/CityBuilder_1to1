using Unity.Entities;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Stad
{
    public static class ZoneringUtility
    {
        /// Kleurt een kavel in met een zone: koppelt het bijbehorende bestemmingsplan en maakt de
        /// kavel via de statusmachine van doc 04 bouwrijp (Natuur -> Landbouwgrond ->
        /// BouwrijpGemaakt -> Bouwkavel). Kavels met een gebouw (of in aanbouw) zijn niet
        /// her-te-zoneren, net als in CS: eerst slopen.
        public static bool ZetZone(EntityManager em, Entity kavel, ZoneType zone)
        {
            if (!em.Exists(kavel) || !em.HasComponent<KavelCore>(kavel))
                return false;

            var core = em.GetComponentData<KavelCore>(kavel);
            if (core.Status == KavelStatus.Bouwplaats || core.Status == KavelStatus.Bebouwd || core.Status == KavelStatus.InHerontwikkeling)
                return false;

            bool heeftZone = em.HasComponent<KavelZoneData>(kavel);
            ZoneType huidig = heeftZone ? em.GetComponentData<KavelZoneData>(kavel).Zone : ZoneType.Geen;
            if (huidig == zone)
                return false;

            if (heeftZone)
                em.SetComponentData(kavel, new KavelZoneData { Zone = zone });
            else
                em.AddComponentData(kavel, new KavelZoneData { Zone = zone });

            Entity plan = Entity.Null;
            var plannenQuery = em.CreateEntityQuery(typeof(ZonePlannenData));
            if (zone != ZoneType.Geen && plannenQuery.CalculateEntityCount() == 1)
                plan = plannenQuery.GetSingleton<ZonePlannenData>().Voor(zone);

            core.Bestemmingsplan = plan;
            if (plan != Entity.Null && em.HasComponent<BouwregelsData>(plan))
            {
                var regels = em.GetComponentData<BouwregelsData>(plan);
                core.BebouwingspercentageMax = regels.BebouwingspercentageMax;
                core.BouwhoogteMax = regels.BouwhoogteMax;
            }
            else
            {
                core.BebouwingspercentageMax = 0f;
                core.BouwhoogteMax = 0f;
            }
            em.SetComponentData(kavel, core);

            if (zone != ZoneType.Geen)
            {
                KavelStatusTransitions.TryTransition(em, kavel, KavelStatus.Landbouwgrond, default, 0);
                KavelStatusTransitions.TryTransition(em, kavel, KavelStatus.BouwrijpGemaakt, default, 0);
                KavelStatusTransitions.TryTransition(em, kavel, KavelStatus.Bouwkavel, default, 0);
            }

            if (!em.HasComponent<ZoneVisueelDirty>(kavel))
                em.AddComponent<ZoneVisueelDirty>(kavel);
            if (!em.HasComponent<GrondwaardeDirty>(kavel))
                em.AddComponent<GrondwaardeDirty>(kavel);

            return true;
        }
    }
}
