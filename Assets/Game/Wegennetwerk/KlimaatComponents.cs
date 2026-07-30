using Unity.Entities;

namespace CityBuilder.Game.Wegennetwerk
{
    public enum KlimaatType : byte
    {
        Zeeklimaat,
        Landklimaat,
        Alpien,
    }

    /// Section 7. `seizoen_temperatuur: Map<Seizoen, TemperatuurRange>` wordt hier vier losse
    /// velden (er zijn maar 4 seizoenen, een Map is overkill en niet ECS-vriendelijk).
    /// `sneeuwlijn_hoogte: float?` wordt `HeeftSneeuwlijn` + `SneeuwlijnHoogteMeter` -- ECS heeft
    /// geen nullable primitives.
    public struct KaartKlimaatData : IComponentData
    {
        public KlimaatType Type;
        public float LenteTemperatuurC;
        public float ZomerTemperatuurC;
        public float HerfstTemperatuurC;
        public float WinterTemperatuurC;
        public bool HeeftSneeuwlijn;
        public float SneeuwlijnHoogteMeter; // alleen betekenisvol als HeeftSneeuwlijn
    }

    public static class KlimaatUtility
    {
        const float VriespuntC = 0f;

        /// Exact de pseudocode uit sectie 7: hoogte-gebaseerd (permanente sneeuw boven de
        /// sneeuwlijn, ongeacht seizoen), anders puur seizoensgebonden. Een kavel/berg die de
        /// sneeuwlijn overschrijdt via landscaping (doc 06) krijgt hierdoor automatisch
        /// permanente sneeuw, zonder dat dit systeem iets hoeft te weten van hoe die hoogte
        /// tot stand kwam.
        public static bool SneeuwStatus(float locatieHoogteMeter, Seizoen huidigSeizoen, in KaartKlimaatData klimaat)
        {
            if (klimaat.HeeftSneeuwlijn && locatieHoogteMeter >= klimaat.SneeuwlijnHoogteMeter)
                return true;

            if (huidigSeizoen != Seizoen.Winter)
                return false;

            return klimaat.WinterTemperatuurC <= VriespuntC;
        }
    }
}
