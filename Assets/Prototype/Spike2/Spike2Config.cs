namespace CityBuilder.Prototype.Spike2
{
    /// Shared constants so the world generator and the systems that read its output
    /// (district count in particular) can't drift out of sync with each other.
    public static class Spike2Config
    {
        public const int KavelCount = 750;      // section 1: 500-1000 kavels
        public const int DistrictCount = 12;
        public const int DeveloperCount = 15;    // section 1: 10-20 ontwikkelaars
        public const int WaterBodyCount = 8;
        public const int RoadNodeTarget = 40;     // grid is rounded up to the next square

        public const double SecondenPerDag = 60.0;   // 1 in-game dag per 60 realtime seconden, snel genoeg om meerdere dagen te zien
        public const double TrafficTickInterval = 1.5; // section 2: elke 1-2 seconden
        public const int MaxBiedingenPerTick = 20;      // section 3: batch-verwerking limiet
    }
}
