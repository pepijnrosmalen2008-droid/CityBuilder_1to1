namespace CityBuilder.Game.Wegennetwerk
{
    /// Plain (non-ECS) data -- copied into a WegSegment's LaneBufferElement buffer at creation
    /// time, not referenced live, so a segment can later deviate from its catalog entry (the tram
    /// retrofit in section 5 does exactly that).
    public readonly struct LaneSpec
    {
        public readonly LaneType Type;
        public readonly LaneRichting Richting;
        public readonly float BreedteMeter;

        public LaneSpec(LaneType type, LaneRichting richting, float breedteMeter)
        {
            Type = type;
            Richting = richting;
            BreedteMeter = breedteMeter;
        }
    }

    /// Section 2's keuzemenu, as a startset ("uitbreidbaar" per the doc -- add an enum value in
    /// WegEnums.cs plus a case here for a new type). Widths are placeholder-realistic; retune
    /// once real cross-section references exist.
    public static class WegTypeCatalogus
    {
        public const float AutorijbaanBreedte = 3.25f;
        public const float GedeeldeBaanBreedte = 3.25f;
        public const float BusbaanBreedte = 3.5f;
        public const float TramrailBreedte = 3.0f;
        public const float FietspadBreedte = 2.0f;   // tweerichting
        public const float TrottoirBreedte = 2.0f;

        public static LaneSpec[] GetLanes(WegTypeId type) => type switch
        {
            WegTypeId.Voetpad => new[]
            {
                new LaneSpec(LaneType.Trottoir, LaneRichting.Tweerichting, TrottoirBreedte),
            },
            WegTypeId.Fietspad => new[]
            {
                new LaneSpec(LaneType.Fietspad, LaneRichting.Tweerichting, FietspadBreedte),
            },
            WegTypeId.Woonstraat => new[]
            {
                new LaneSpec(LaneType.GedeeldeBaan, LaneRichting.EenrichtingA, GedeeldeBaanBreedte),
                new LaneSpec(LaneType.GedeeldeBaan, LaneRichting.EenrichtingB, GedeeldeBaanBreedte),
                new LaneSpec(LaneType.Trottoir, LaneRichting.Tweerichting, TrottoirBreedte),
            },
            WegTypeId.Straat => new[]
            {
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Fietspad, LaneRichting.Tweerichting, FietspadBreedte),
                new LaneSpec(LaneType.Trottoir, LaneRichting.Tweerichting, TrottoirBreedte),
            },
            // Fysiek identiek aan Straat -- het verschil is het HeeftBusoverlay-vlag op het
            // WegSegment zodra er daadwerkelijk een buslijn overheen gerouteerd wordt, niet een
            // aparte lane (zie sectie 1: "geen aparte lane nodig, wel een vlag").
            WegTypeId.StraatMetBus => new[]
            {
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Fietspad, LaneRichting.Tweerichting, FietspadBreedte),
                new LaneSpec(LaneType.Trottoir, LaneRichting.Tweerichting, TrottoirBreedte),
            },
            // Middenberm is een visuele/ruimtelijke tussenruimte, geen Lane -- die komt bij de
            // mesh-generatie terug, niet in dit datamodel.
            WegTypeId.Avenue => new[]
            {
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Fietspad, LaneRichting.Tweerichting, FietspadBreedte),
                new LaneSpec(LaneType.Trottoir, LaneRichting.Tweerichting, TrottoirBreedte),
            },
            WegTypeId.Tramstraat => new[]
            {
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Tramrail, LaneRichting.EenrichtingA, TramrailBreedte),
                new LaneSpec(LaneType.Tramrail, LaneRichting.EenrichtingB, TramrailBreedte),
                new LaneSpec(LaneType.Fietspad, LaneRichting.Tweerichting, FietspadBreedte),
                new LaneSpec(LaneType.Trottoir, LaneRichting.Tweerichting, TrottoirBreedte),
            },
            // Baseline van de "4-6x"-range uit sectie 2; een bredere variant met 6 lanes kan later
            // via dezelfde catalogus-vorm toegevoegd worden zonder de rest te raken.
            WegTypeId.Gebiedsontsluitingsweg => new[]
            {
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
            },
            // Baseline van de "6-8x"-range uit sectie 2.
            WegTypeId.Snelweg => new[]
            {
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingA, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, LaneRichting.EenrichtingB, AutorijbaanBreedte),
            },
            _ => new LaneSpec[0],
        };

        public static int GetSnelheidslimiet(WegTypeId type) => type switch
        {
            WegTypeId.Voetpad => 0,
            WegTypeId.Fietspad => 20,
            WegTypeId.Woonstraat => 30,
            WegTypeId.Straat => 50,
            WegTypeId.StraatMetBus => 50,
            WegTypeId.Avenue => 50,
            WegTypeId.Tramstraat => 50,
            WegTypeId.Gebiedsontsluitingsweg => 70,
            WegTypeId.Snelweg => 100, // representatief voor de 100-120 range uit sectie 2
            _ => 50,
        };
    }
}
