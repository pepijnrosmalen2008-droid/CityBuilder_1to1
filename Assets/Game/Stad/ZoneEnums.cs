namespace CityBuilder.Game.Stad
{
    /// Wat de speler op een kavel "inkleurt", net als de zones in Cities: Skylines. Een zone wordt
    /// vertaald naar een echt bestemmingsplan (zie StadBootstrapSystem), dus grondwaarde en
    /// bouwregels uit doc 04 blijven gewoon werken.
    public enum ZoneType : byte
    {
        Geen,
        WonenLaag,   // rijwoningen met kap
        WonenHoog,   // appartementen
        Gemengd,     // winkels op de begane grond, wonen erboven
        Kantoor,
        Industrie,
    }

    public enum GebouwVorm : byte
    {
        Rijwoningen,
        Appartementen,
        WinkelsMetWonen,
        Kantoortoren,
        Bedrijfshal,
    }
}
