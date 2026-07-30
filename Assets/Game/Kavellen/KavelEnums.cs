namespace CityBuilder.Game.Kavellen
{
    public enum BouwPeriode : byte
    {
        Onbebouwd,
        Jaren30,
        Wederopbouw,
        Vinex,
        Modern,
    }

    /// Section 1 lists 6 status values (no "Bouwplaats"), but section 3's ontwikkelcyclus table
    /// explicitly transitions Bouwkavel -> Bouwplaats -> Bebouwd. That's an inconsistency in the
    /// source doc; this enum follows section 3 (the status-machine table) since it's the more
    /// specific of the two and the one KavelStatusTransitions.cs actually enforces.
    public enum KavelStatus : byte
    {
        Natuur,
        Landbouwgrond,
        BouwrijpGemaakt,
        Bouwkavel,
        Bouwplaats,
        Bebouwd,
        InHerontwikkeling,
    }

    /// Section 7 leaves "hoe wordt eigenaarschap gemodelleerd" explicitly open (AI-ontwikkelaars
    /// met voorkeursprofielen vs. abstracter vraag/aanbod-model). This enum only distinguishes
    /// the four owner kinds section 1 names; it deliberately doesn't assume an answer to that
    /// open question.
    public enum EigenaarType : byte
    {
        Geen,
        Speler,
        Gemeente,
        Projectontwikkelaar,
        Particulier,
    }

    public enum VoorzieningType : byte
    {
        Basisschool,
        Supermarkt,
        OvHalte,
        Park,
        Ziekenhuis,
    }

    public enum FunctieType : byte
    {
        Wonen,
        Detailhandel,
        Kantoor,
        Horeca,
        Industrie,
        Maatschappelijk,
    }

    public enum VerdiepingRestrictie : byte
    {
        Geen,
        AlleenBeganeGrond,
        AlleenBoven,
    }

    public enum Energielabel : byte
    {
        A,
        B,
        C,
        D,
        E,
        F,
        G,
    }

    public enum Bodemkwaliteit : byte
    {
        Goed,
        Matig,
        Vervuild,
    }

    public enum KavelEventType : byte
    {
        StatusGewijzigd,
        BestemmingsplanToegewezen,
        OntsluitingGewijzigd,
        GrondwaardeHerberekend,
    }
}
