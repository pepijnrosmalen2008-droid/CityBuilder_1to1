using Unity.Mathematics;

namespace CityBuilder.Game.WaterEnLandschap
{
    /// Plain result struct (geen ECS-component) -- section 2's LandschapActie. `bewerkt_gebied`
    /// (de polygon) hoort bij de daadwerkelijke penseel-tool (nog niet gebouwd, zie de
    /// scope-toelichting), dus alleen de kosten-relevante velden staan hier.
    public struct LandschapActieResultaat
    {
        public LandschapModus Modus;
        public float VolumeDeltaM3; // positief = grond nodig (ophogen), negatief = grond vrijgekomen (afgraven)
        public float Kosten;
    }

    /// Section 2's grondvolume-balans, exact de beschreven regel: bij Verhogen eerst putten uit
    /// voorraad, tekort automatisch bijkopen; bij Verlagen gaat vrijgekomen grond de voorraad in
    /// (verkoop is een aparte, optionele vervolgstap, geen automatisme).
    public static class LandschapKostenUtility
    {
        public const float StandaardAankoopprijsPerM3 = 18f;
        public const float StandaardVerkoopprijsPerM3 = 10f; // lager dan aankoop, normale marktmarge

        public static LandschapActieResultaat VoerVerhogingUit(ref float huidigeVoorraad, float benodigdVolumeM3,
            float aankoopprijsPerM3 = StandaardAankoopprijsPerM3)
        {
            float uitVoorraad = math.min(huidigeVoorraad, benodigdVolumeM3);
            float tekort = benodigdVolumeM3 - uitVoorraad;
            huidigeVoorraad -= uitVoorraad;

            return new LandschapActieResultaat
            {
                Modus = LandschapModus.Verhogen,
                VolumeDeltaM3 = benodigdVolumeM3,
                Kosten = tekort * aankoopprijsPerM3,
            };
        }

        public static LandschapActieResultaat VoerVerlagingUit(ref float huidigeVoorraad, float vrijgekomenVolumeM3)
        {
            huidigeVoorraad += vrijgekomenVolumeM3;

            return new LandschapActieResultaat
            {
                Modus = LandschapModus.Verlagen,
                VolumeDeltaM3 = -vrijgekomenVolumeM3,
                Kosten = 0f,
            };
        }

        /// Aparte, expliciete actie -- Verlagen zelf verkoopt niets automatisch.
        public static float VerkoopUitVoorraad(ref float huidigeVoorraad, float volumeM3,
            float verkoopprijsPerM3 = StandaardVerkoopprijsPerM3)
        {
            float teVerkopen = math.min(huidigeVoorraad, volumeM3);
            huidigeVoorraad -= teVerkopen;
            return teVerkopen * verkoopprijsPerM3;
        }
    }
}
