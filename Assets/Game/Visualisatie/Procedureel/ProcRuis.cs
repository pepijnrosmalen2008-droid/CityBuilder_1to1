using UnityEngine;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    /// Tegelbare (periodieke) ruis voor texturen: Perlin, fBm en Worley/cellen. Mathf.PerlinNoise
    /// is niet periodiek, dus een textuur die je herhaalt krijgt dan zichtbare naden -- deze
    /// varianten wikkelen het rooster rond op een gehele periode, zodat de rand naadloos aansluit.
    /// Coördinaten u,v lopen van 0 tot 1 over de textuur.
    public static class ProcRuis
    {
        static readonly int[] P = MaakPermutatie(1337);

        static int[] MaakPermutatie(int seed)
        {
            var r = new System.Random(seed);
            var basis = new int[256];
            for (int i = 0; i < 256; i++) basis[i] = i;
            for (int i = 255; i > 0; i--)
            {
                int j = r.Next(i + 1);
                (basis[i], basis[j]) = (basis[j], basis[i]);
            }
            var p = new int[512];
            for (int i = 0; i < 512; i++) p[i] = basis[i & 255];
            return p;
        }

        static int Mod(int a, int m)
        {
            int r = a % m;
            return r < 0 ? r + m : r;
        }

        static int Hash(int x, int y) => P[P[x & 255] + (y & 255)];

        static float Fade(float t) => t * t * t * (t * (t * 6f - 15f) + 10f);

        static float Grad(int h, float x, float y)
        {
            switch (h & 7)
            {
                case 0: return x + y;
                case 1: return -x + y;
                case 2: return x - y;
                case 3: return -x - y;
                case 4: return x;
                case 5: return -x;
                case 6: return y;
                default: return -y;
            }
        }

        /// Periodieke Perlin-ruis, ongeveer in [-1, 1]. `periode` in roostercellen (max 256).
        public static float Perlin(float x, float y, int periode)
        {
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float xf = x - xi, yf = y - yi;
            int x0 = Mod(xi, periode), x1 = Mod(xi + 1, periode);
            int y0 = Mod(yi, periode), y1 = Mod(yi + 1, periode);
            float u = Fade(xf), v = Fade(yf);

            float n00 = Grad(Hash(x0, y0), xf, yf);
            float n10 = Grad(Hash(x1, y0), xf - 1f, yf);
            float n01 = Grad(Hash(x0, y1), xf, yf - 1f);
            float n11 = Grad(Hash(x1, y1), xf - 1f, yf - 1f);
            return Mathf.Lerp(Mathf.Lerp(n00, n10, u), Mathf.Lerp(n01, n11, u), v);
        }

        /// Tegelbare fBm in [0, 1]. `seed` verschuift het rooster met gehele stappen, zodat
        /// verschillende lagen ongecorreleerd zijn maar wel periodiek blijven.
        public static float Fbm(float u, float v, int basisPeriode, int octaven, int seed = 0, float persistentie = 0.5f)
        {
            float som = 0f, amp = 1f, norm = 0f;
            int periode = basisPeriode;
            for (int o = 0; o < octaven; o++)
            {
                int verschuiving = (seed + o * 13) * 17;
                som += Perlin(u * periode + verschuiving, v * periode + verschuiving, periode) * amp;
                norm += amp;
                amp *= persistentie;
                periode = Mathf.Min(periode * 2, 256);
            }
            return Mathf.Clamp01(0.5f + som / norm * 0.85f);
        }

        /// Tegelbare celruis (Worley). Geeft de afstand tot het dichtstbijzijnde celpunt (f1), de
        /// tweede afstand (f2, voor randen tussen cellen: f2 - f1) en een hash per cel (voor een
        /// eigen kleur per steentje/blad).
        public static float Worley(float u, float v, int cellen, int seed, out float f2, out float celWaarde)
        {
            float x = u * cellen, y = v * cellen;
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float d1 = 99f, d2 = 99f;
            celWaarde = 0f;

            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    int cx = xi + dx, cy = yi + dy;
                    int wx = Mod(cx, cellen), wy = Mod(cy, cellen);
                    float jx = Hash01(wx, wy, seed);
                    float jy = Hash01(wx, wy, seed + 101);
                    float px = cx + jx, py = cy + jy;
                    float d = (px - x) * (px - x) + (py - y) * (py - y);
                    if (d < d1)
                    {
                        d2 = d1;
                        d1 = d;
                        celWaarde = Hash01(wx, wy, seed + 202);
                    }
                    else if (d < d2)
                    {
                        d2 = d;
                    }
                }
            }

            f2 = Mathf.Sqrt(d2);
            return Mathf.Sqrt(d1);
        }

        /// Witte ruis per (x, y, seed), in [0, 1].
        public static float Hash01(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 982451653);
                h = (h ^ (h >> 13)) * 1274126177u;
                h ^= h >> 16;
                return (h & 0xFFFFFF) / 16777215f;
            }
        }
    }
}
