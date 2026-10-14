namespace CityBuilder.Game
{
    /// De vier *TestBootstrap-systemen bouwen kleine testopstellingen (testwegen, gekleurde
    /// testkavels, een testmeer) rond de oorsprong om de datamodellen te verifiëren. In het echte
    /// spel staan ze in de weg, dus standaard uit. Zet op true om de verificatie-logs weer te zien.
    public static class TestModus
    {
        public static bool BootstrapsAan = false;
    }
}
