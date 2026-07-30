using Unity.Mathematics;

namespace CityBuilder.Game.WaterEnLandschap
{
    /// Section 2's "Gevolgen, via bestaande event-triggers" -- pure functies, expliciet NIET
    /// aangeroepen vanuit de al geshipte CityBuilder.Game.Kavellen-code in deze pass. Beide
    /// hebben echte data nodig die er nog niet is (terrein-heightmap-gradiënt resp. kavel<->
    /// waterlichaam ruimtelijke afstand); ze hier alvast neerzetten voorkomt dat de koppeling
    /// straks improviserend in KavelStatusTransitions/OmgevingsfactorenSystem belandt, zonder dat
    /// nu al een halfgetest verplicht extra argument aan die bestaande, werkende code toe te
    /// voegen.
    public static class LandschapGevolgenUtility
    {
        /// "Een kavel kan niet naar BouwrijpGemaakt als de helling na landscaping te steil is."
        /// Aanroeper levert de helling (bijv. uit Terrain-heightmap-gradiënt op de kavel-locatie).
        public static bool IsHellingTeSteil(float hellingGraden, float maxToegestaneHellingGraden)
        {
            return hellingGraden > maxToegestaneHellingGraden;
        }

        /// Ruwe, generieke afstand-op-basis-van-invloed-formule voor de bijdrage van een
        /// waterlichaam aan een nabije kavel's overstromingsrisico (Kavellen.OmgevingsfactorenData
        /// .OverstromingsrisicoScore). Peilstijging weegt zwaarder naarmate de kavel dichterbij
        /// ligt; buiten maxInvloedsAfstandMeter is de bijdrage nul.
        public static float BerekenOverstromingsrisicoBijdrage(float waterpeilStijgingMeter, float afstandTotKavelMeter, float maxInvloedsAfstandMeter)
        {
            if (afstandTotKavelMeter >= maxInvloedsAfstandMeter || waterpeilStijgingMeter <= 0f)
                return 0f;

            float nabijheidsFactor = 1f - (afstandTotKavelMeter / maxInvloedsAfstandMeter);
            return math.saturate(waterpeilStijgingMeter * nabijheidsFactor);
        }
    }
}
