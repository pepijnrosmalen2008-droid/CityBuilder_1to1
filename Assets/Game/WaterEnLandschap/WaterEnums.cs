namespace CityBuilder.Game.WaterEnLandschap
{
    public enum WaterLichaamType : byte
    {
        Zee,
        Meer,
        Rivier,
        Gracht,
        Vijver,
    }

    /// "SpelerGecreeerd" bewust zonder diakritisch teken (ë) gespeld -- functioneel identiek aan
    /// de spec, maar vermijdt niet-ASCII in identifiers.
    public enum WaterOorsprong : byte
    {
        KaartStandaard,
        SpelerGecreeerd,
    }

    public enum LandschapModus : byte
    {
        Verhogen,
        Verlagen,
        Nivelleren,
        Vloeiend,
        GrondtypeWijzigen,
    }

    public enum PenseelVorm : byte
    {
        Rond,
        Vierkant,
    }

    public enum TransportStatus : byte
    {
        Aangevraagd,
        Onderweg,
        Voltooid,
    }
}
