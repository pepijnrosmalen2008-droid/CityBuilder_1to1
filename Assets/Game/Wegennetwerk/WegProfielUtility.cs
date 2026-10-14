using Unity.Entities;

namespace CityBuilder.Game.Wegennetwerk
{
    public static class WegProfielUtility
    {
        public static float TotaleBreedte(DynamicBuffer<LaneBufferElement> lanes)
        {
            float totaal = 0f;
            for (int i = 0; i < lanes.Length; i++)
                totaal += lanes[i].BreedteMeter;
            return totaal;
        }

        /// Halve breedte van het hele dwarsprofiel (inclusief stoepen), of `standaard` als het
        /// segment niet (meer) bestaat -- bijvoorbeeld een kavel waarvan de weg net gesplitst is.
        public static float HalveBreedte(EntityManager em, Entity segment, float standaard = 6f)
        {
            if (segment == Entity.Null || !em.Exists(segment) || !em.HasBuffer<LaneBufferElement>(segment))
                return standaard;
            return TotaleBreedte(em.GetBuffer<LaneBufferElement>(segment)) * 0.5f;
        }
    }
}
