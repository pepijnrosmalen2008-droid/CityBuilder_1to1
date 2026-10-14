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

    /// Dwarsprofielen, van links naar rechts gezien in de tekenrichting van het segment
    /// (EenrichtingA rijdt in die richting, rechts van de as -- Nederlands rechts rijden).
    /// Breedtes volgen de orde van grootte van de CROW-richtlijnen: rijstrook 3,0-3,5 m,
    /// fietsstrook 1,5-2,0 m, vrijliggend tweerichtingsfietspad 3,0 m, trottoir 1,8-3,0 m.
    /// Stoepen en fietsvoorzieningen liggen aan beide kanten, zoals in een echte straat.
    public static class WegTypeCatalogus
    {
        public const float AutorijbaanBreedte = 3.25f;
        public const float GedeeldeBaanBreedte = 2.75f;
        public const float BusbaanBreedte = 3.5f;
        public const float TramrailBreedte = 3.0f;
        public const float FietspadBreedte = 3.0f;   // vrijliggend, tweerichting
        public const float FietsstrookBreedte = 1.75f;
        public const float TrottoirBreedte = 2.0f;

        const LaneRichting A = LaneRichting.EenrichtingA;
        const LaneRichting B = LaneRichting.EenrichtingB;
        const LaneRichting T = LaneRichting.Tweerichting;

        public static LaneSpec[] GetLanes(WegTypeId type) => type switch
        {
            WegTypeId.Voetpad => new[]
            {
                new LaneSpec(LaneType.Trottoir, T, 2.5f),
            },
            WegTypeId.Fietspad => new[]
            {
                new LaneSpec(LaneType.Fietspad, T, FietspadBreedte),
            },
            // Erftoegangsweg in klinkers, auto te gast: geen belijning, smalle gedeelde rijbaan.
            WegTypeId.Woonstraat => new[]
            {
                new LaneSpec(LaneType.Trottoir, T, 1.8f),
                new LaneSpec(LaneType.GedeeldeBaan, B, GedeeldeBaanBreedte),
                new LaneSpec(LaneType.GedeeldeBaan, A, GedeeldeBaanBreedte),
                new LaneSpec(LaneType.Trottoir, T, 1.8f),
            },
            WegTypeId.Straat => new[]
            {
                new LaneSpec(LaneType.Trottoir, T, TrottoirBreedte),
                new LaneSpec(LaneType.Fietspad, B, FietsstrookBreedte),
                new LaneSpec(LaneType.Autorijbaan, B, 3.0f),
                new LaneSpec(LaneType.Autorijbaan, A, 3.0f),
                new LaneSpec(LaneType.Fietspad, A, FietsstrookBreedte),
                new LaneSpec(LaneType.Trottoir, T, TrottoirBreedte),
            },
            // Fysiek identiek aan Straat -- het verschil is het HeeftBusoverlay-vlag op het
            // WegSegment, niet een aparte lane (zie sectie 1: "geen aparte lane nodig, wel een vlag").
            WegTypeId.StraatMetBus => new[]
            {
                new LaneSpec(LaneType.Trottoir, T, TrottoirBreedte),
                new LaneSpec(LaneType.Fietspad, B, FietsstrookBreedte),
                new LaneSpec(LaneType.Autorijbaan, B, 3.25f),
                new LaneSpec(LaneType.Autorijbaan, A, 3.25f),
                new LaneSpec(LaneType.Fietspad, A, FietsstrookBreedte),
                new LaneSpec(LaneType.Trottoir, T, TrottoirBreedte),
            },
            // Stadslaan: brede stoepen, vrijliggende fietspaden, twee rijstroken per richting en
            // een middenberm met een bomenrij.
            WegTypeId.Avenue => new[]
            {
                new LaneSpec(LaneType.Trottoir, T, 3.0f),
                new LaneSpec(LaneType.Fietspad, B, 2.0f),
                new LaneSpec(LaneType.Berm, T, 1.0f),
                new LaneSpec(LaneType.Autorijbaan, B, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, B, AutorijbaanBreedte),
                new LaneSpec(LaneType.Middenberm, T, 3.5f),
                new LaneSpec(LaneType.Autorijbaan, A, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, A, AutorijbaanBreedte),
                new LaneSpec(LaneType.Berm, T, 1.0f),
                new LaneSpec(LaneType.Fietspad, A, 2.0f),
                new LaneSpec(LaneType.Trottoir, T, 3.0f),
            },
            WegTypeId.Tramstraat => new[]
            {
                new LaneSpec(LaneType.Trottoir, T, 2.5f),
                new LaneSpec(LaneType.Fietspad, B, FietsstrookBreedte),
                new LaneSpec(LaneType.Autorijbaan, B, 3.0f),
                new LaneSpec(LaneType.Tramrail, B, TramrailBreedte),
                new LaneSpec(LaneType.Tramrail, A, TramrailBreedte),
                new LaneSpec(LaneType.Autorijbaan, A, 3.0f),
                new LaneSpec(LaneType.Fietspad, A, FietsstrookBreedte),
                new LaneSpec(LaneType.Trottoir, T, 2.5f),
            },
            // 50/70 km/u-weg: geen erftoegang, vrijliggende fietspaden achter een grasberm.
            WegTypeId.Gebiedsontsluitingsweg => new[]
            {
                new LaneSpec(LaneType.Fietspad, B, 2.5f),
                new LaneSpec(LaneType.Berm, T, 2.5f),
                new LaneSpec(LaneType.Autorijbaan, B, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, B, AutorijbaanBreedte),
                new LaneSpec(LaneType.Middenberm, T, 3.0f),
                new LaneSpec(LaneType.Autorijbaan, A, AutorijbaanBreedte),
                new LaneSpec(LaneType.Autorijbaan, A, AutorijbaanBreedte),
                new LaneSpec(LaneType.Berm, T, 2.5f),
                new LaneSpec(LaneType.Fietspad, A, 2.5f),
            },
            // Autosnelweg 2x3 met vluchtstroken en een middenberm met geleiderail.
            WegTypeId.Snelweg => new[]
            {
                new LaneSpec(LaneType.Berm, T, 1.5f),
                new LaneSpec(LaneType.Vluchtstrook, B, 3.5f),
                new LaneSpec(LaneType.Autorijbaan, B, 3.5f),
                new LaneSpec(LaneType.Autorijbaan, B, 3.5f),
                new LaneSpec(LaneType.Autorijbaan, B, 3.5f),
                new LaneSpec(LaneType.Middenberm, T, 4.0f),
                new LaneSpec(LaneType.Autorijbaan, A, 3.5f),
                new LaneSpec(LaneType.Autorijbaan, A, 3.5f),
                new LaneSpec(LaneType.Autorijbaan, A, 3.5f),
                new LaneSpec(LaneType.Vluchtstrook, A, 3.5f),
                new LaneSpec(LaneType.Berm, T, 1.5f),
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

        /// Mogen er kavels (en dus gebouwen) direct aan deze weg liggen? Gebiedsontsluitings-
        /// wegen en snelwegen hebben in Nederland juist géén erftoegang; fiets- en voetpaden
        /// ontsluiten geen bebouwing voor auto's.
        public static bool HeeftErfOntsluiting(WegTypeId type) => type switch
        {
            WegTypeId.Woonstraat => true,
            WegTypeId.Straat => true,
            WegTypeId.StraatMetBus => true,
            WegTypeId.Avenue => true,
            WegTypeId.Tramstraat => true,
            _ => false,
        };
    }
}
