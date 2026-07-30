namespace CityBuilder.Game.Ontwikkeling
{
    public enum RisicoProfiel : byte
    {
        Conservatief,
        Gemiddeld,
        Speculatief,
    }

    public enum ParkeerOplossing : byte
    {
        OpEigenTerrein,
        Ondergronds,
        GeenNodig,
    }

    public enum BodStatus : byte
    {
        Ingediend,
        GeaccepteerdDoorSpeler,
        Afgewezen,
        Verlopen,
    }

    public enum ScopeType : byte
    {
        Kavel,
        Straat,
        Gebied,
    }

    /// De doc noemt "Reference<Welstandsniveau>" zonder de niveaus zelf te specificeren --
    /// dit is dus een placeholder-set, geen letterlijke doc-tabel zoals bij de andere enums.
    public enum Welstandsniveau : byte
    {
        Vrij,
        Regulier,
        Bijzonder,
        Streng,
    }

    public enum AcceptatieBeleid : byte
    {
        HandmatigKiezen,
        AutoHoogsteBod,
        AutoBesteFunctiemixVoorStad,
    }
}
