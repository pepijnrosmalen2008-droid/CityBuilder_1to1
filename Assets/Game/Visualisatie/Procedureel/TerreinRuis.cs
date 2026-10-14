using UnityEngine;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    /// Ruis in wereldcoördinaten die zowel de terreinschildering als de bosaanplant gebruikt,
    /// zodat bomen precies op de donkere bosgrond staan.
    public static class TerreinRuis
    {
        static float Fbm(float x, float z, float schaal, int octaven, float seed)
        {
            float som = 0f, amp = 1f, norm = 0f, f = schaal;
            for (int o = 0; o < octaven; o++)
            {
                som += Mathf.PerlinNoise(x * f + seed + o * 17.3f, z * f + seed * 0.7f + o * 9.1f) * amp;
                norm += amp;
                amp *= 0.5f;
                f *= 2f;
            }
            return som / norm;
        }

        public static float Bos(float x, float z) => Fbm(x, z, 0.0045f, 4, 31.7f);
        public static float Weide(float x, float z) => Fbm(x, z, 0.012f, 3, 77.1f);
        public static float Soort(float x, float z) => Fbm(x, z, 0.02f, 2, 13.3f);

        /// 0 = open land, 1 = midden in een bos; zachte overgang aan de bosrand.
        public static float BosAandeel(float x, float z) =>
            Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.56f, 0.64f, Bos(x, z)));
    }
}
