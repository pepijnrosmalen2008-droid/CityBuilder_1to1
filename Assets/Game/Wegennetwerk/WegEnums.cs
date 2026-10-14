namespace CityBuilder.Game.Wegennetwerk
{
    public enum NodeType : byte
    {
        Kruispunt,
        Stopplaats,
        StationOffMapConnector,
        Wissel,
    }

    public enum LaneType : byte
    {
        Autorijbaan,
        Busbaan,
        Tramrail,
        Fietspad,
        Trottoir,
        GedeeldeBaan,
        Berm,          // verhoogde grasstrook langs de rijbaan
        Middenberm,    // scheiding tussen de rijrichtingen (gras, bomen of geleiderail)
        Vluchtstrook,
    }

    public enum LaneRichting : byte
    {
        EenrichtingA,
        EenrichtingB,
        Tweerichting,
    }

    public enum HoogteProfielModus : byte
    {
        OpMaaiveld,
        Verhoogd,
        Tunnel,
    }

    /// Section 2's startset. "Uitbreidbaar" volgens de doc -- nieuwe waarden hier + een regel in
    /// WegTypeCatalogus.cs is genoeg om een nieuw type toe te voegen.
    public enum WegTypeId : byte
    {
        Voetpad,
        Fietspad,
        Woonstraat,
        Straat,
        StraatMetBus,
        Avenue,
        Tramstraat,
        Gebiedsontsluitingsweg,
        Snelweg,
    }

    public enum LijnType : byte
    {
        Bus,
        Tram,
        Trein,
    }

    public enum StopplaatsType : byte
    {
        Bushalte,
        Tramhalte,
        TreinStation,
    }

    public enum StationType : byte
    {
        Groot,
        Klein,
    }

    public enum TramAanlegStatus : byte
    {
        NietAanwezig,
        InAanleg,
        Gereed,
    }

    public enum WegVerbredingStatus : byte
    {
        Voorgesteld,
        Geaccepteerd,
        Geweigerd,
    }

    public enum Seizoen : byte
    {
        Lente,
        Zomer,
        Herfst,
        Winter,
    }

    public enum SneeuwRouteStrategie : byte
    {
        PrioriteitWegtype,
        VolledigNetwerk,
    }
}
