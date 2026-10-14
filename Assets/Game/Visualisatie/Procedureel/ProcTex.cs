using System.Collections.Generic;
using UnityEngine;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    public sealed class PbrSet
    {
        public Texture2D Albedo;
        public Texture2D Normaal;     // null = geen normal map
        public Texture2D MetaalGlad;  // R = metallic, A = smoothness; null = vaste waarden
    }

    public enum GevelStijl : byte
    {
        BaksteenRood,
        BaksteenBruin,
        BaksteenGeel,
        Stuc,
        ModernDonker,
        Vliesgevel,
        BetonBand,
        Golfplaat,
    }

    public enum BladSoort : byte
    {
        Eik,
        Linde,
        Berk,
        Den,
    }

    /// Werkbuffer voor één textuur: kleur, hoogte (voor de normal map), gladheid, metaalheid en
    /// (optioneel) alfa. Indexering wikkelt rond, zodat de normal map aan de randen naadloos is.
    sealed class Doek
    {
        public readonly int W, H;
        public readonly Color[] Kleur;
        public readonly float[] Hoogte;
        public readonly float[] Glad;
        public readonly float[] Metaal;
        public float[] Alfa;

        public Doek(int w, int h)
        {
            W = w;
            H = h;
            Kleur = new Color[w * h];
            Hoogte = new float[w * h];
            Glad = new float[w * h];
            Metaal = new float[w * h];
        }

        public int I(int x, int y) => ((y % H + H) % H) * W + ((x % W + W) % W);

        public void Zet(int x, int y, Color k, float hoogte, float glad, float metaal = 0f)
        {
            int i = y * W + x;
            Kleur[i] = k;
            Hoogte[i] = hoogte;
            Glad[i] = glad;
            Metaal[i] = metaal;
        }

        public PbrSet NaarPbr(string naam, float normaalSterkte, bool metGlansKaart)
        {
            var set = new PbrSet();

            var kleur = new Color32[W * H];
            for (int i = 0; i < kleur.Length; i++)
            {
                Color k = Kleur[i];
                k.a = Alfa != null ? Alfa[i] : 1f;
                kleur[i] = k;
            }
            set.Albedo = Maak(kleur, false, naam + "_Kleur");

            if (normaalSterkte > 0f)
            {
                var normaal = new Color32[W * H];
                for (int y = 0; y < H; y++)
                {
                    for (int x = 0; x < W; x++)
                    {
                        float dx = (Hoogte[I(x + 1, y)] - Hoogte[I(x - 1, y)]) * normaalSterkte;
                        float dy = (Hoogte[I(x, y + 1)] - Hoogte[I(x, y - 1)]) * normaalSterkte;
                        var n = new Vector3(-dx, -dy, 1f).normalized;
                        normaal[y * W + x] = new Color32(
                            (byte)Mathf.Clamp(Mathf.RoundToInt((n.x * 0.5f + 0.5f) * 255f), 0, 255),
                            (byte)Mathf.Clamp(Mathf.RoundToInt((n.y * 0.5f + 0.5f) * 255f), 0, 255),
                            (byte)Mathf.Clamp(Mathf.RoundToInt((n.z * 0.5f + 0.5f) * 255f), 0, 255),
                            255);
                    }
                }
                set.Normaal = Maak(normaal, true, naam + "_Normaal");
            }

            if (metGlansKaart)
            {
                var mg = new Color32[W * H];
                for (int i = 0; i < mg.Length; i++)
                {
                    mg[i] = new Color32(
                        (byte)Mathf.Clamp(Mathf.RoundToInt(Metaal[i] * 255f), 0, 255), 0, 0,
                        (byte)Mathf.Clamp(Mathf.RoundToInt(Glad[i] * 255f), 0, 255));
                }
                set.MetaalGlad = Maak(mg, true, naam + "_MetaalGlad");
            }

            return set;
        }

        Texture2D Maak(Color32[] pixels, bool lineair, string naam)
        {
            var t = new Texture2D(W, H, TextureFormat.RGBA32, true, lineair)
            {
                name = naam,
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Trilinear,
                anisoLevel = 8,
            };
            t.SetPixels32(pixels);
            t.Apply(true, true);
            return t;
        }
    }

    /// Alle texturen van de wereld, procedureel gegenereerd (geen externe assets nodig) en
    /// gecachet. Elke functie noemt in commentaar hoeveel meter één herhaling van de textuur
    /// voorstelt -- de meshes zetten hun UV's in die maat.
    public static class ProcTex
    {
        static readonly Dictionary<string, PbrSet> _cache = new Dictionary<string, PbrSet>();
        static Texture2D _zoneRaster;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset()
        {
            _cache.Clear();
            _zoneRaster = null;
        }

        static PbrSet Haal(string sleutel, System.Func<PbrSet> maak)
        {
            if (_cache.TryGetValue(sleutel, out var set) && set.Albedo != null)
                return set;
            set = maak();
            _cache[sleutel] = set;
            return set;
        }

        static Color K(float r, float g, float b) => new Color(r, g, b, 1f);
        static float Frac(float x) => x - Mathf.Floor(x);
        static float Glad01(float a, float b, float x) => Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(a, b, x));
        static int Wikkel(int a, int m) => (a % m + m) % m;

        // ═══════ ONDERGROND ═══════

        /// Gras (gazon) of weide (ruiger, geler, met bloemetjes). Eén herhaling = 6 m.
        public static PbrSet Gras(bool weide) => Haal(weide ? "weide" : "gras", () => MaakGras(weide));

        static PbrSet MaakGras(bool weide)
        {
            const int N = 512;
            var d = new Doek(N, N);
            int s = weide ? 10 : 0;
            Color donker = weide ? K(0.23f, 0.33f, 0.11f) : K(0.14f, 0.28f, 0.08f);
            Color licht = weide ? K(0.45f, 0.53f, 0.20f) : K(0.29f, 0.47f, 0.14f);
            Color droog = weide ? K(0.60f, 0.56f, 0.30f) : K(0.44f, 0.49f, 0.22f);

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float vlek = ProcRuis.Fbm(u, v, 3, 4, s + 1);
                    float mid = ProcRuis.Fbm(u, v, 12, 3, s + 2);
                    float pluk = ProcRuis.Fbm(u, v, 48, 2, s + 3);
                    float spriet = ProcRuis.Hash01(x, y, s + 4);

                    Color k = Color.Lerp(donker, licht, mid * 0.7f + pluk * 0.3f);
                    k = Color.Lerp(k, droog, Glad01(0.45f, 0.85f, vlek) * (weide ? 0.7f : 0.45f));
                    k *= 0.82f + 0.32f * spriet;

                    if (weide)
                    {
                        float bloem = ProcRuis.Hash01(x >> 1, y >> 1, 77);
                        if (bloem > 0.9965f)
                            k = bloem > 0.9985f ? K(0.95f, 0.93f, 0.80f) : K(0.93f, 0.80f, 0.25f);
                    }

                    d.Zet(x, y, k, 0.55f * spriet + 0.45f * pluk, 0.08f);
                }
            }
            return d.NaarPbr(weide ? "Weide" : "Gras", 3f, false);
        }

        /// Bosgrond: bladafval, aarde en mos. Eén herhaling = 5 m.
        public static PbrSet Bosgrond() => Haal("bosgrond", MaakBosgrond);

        static PbrSet MaakBosgrond()
        {
            const int N = 512;
            var d = new Doek(N, N);
            Color aarde = K(0.19f, 0.13f, 0.08f);
            Color mos = K(0.18f, 0.29f, 0.09f);

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float f1 = ProcRuis.Worley(u, v, 26, 31, out float f2, out float cel);
                    float rand = Mathf.Clamp01((f2 - f1) * 4f);
                    float korrel = ProcRuis.Hash01(x, y, 33);

                    Color blad = Color.Lerp(K(0.36f, 0.20f, 0.08f), K(0.56f, 0.34f, 0.12f), cel);
                    if (cel > 0.82f) blad = K(0.30f, 0.27f, 0.13f);
                    float mosAandeel = Glad01(0.55f, 0.75f, ProcRuis.Fbm(u, v, 4, 3, 32));

                    Color k = Color.Lerp(aarde, blad, rand * 0.9f);
                    k = Color.Lerp(k, mos, mosAandeel * 0.6f);
                    k *= 0.85f + 0.3f * korrel;
                    d.Zet(x, y, k, rand * 0.7f + korrel * 0.3f, 0.1f);
                }
            }
            return d.NaarPbr("Bosgrond", 4f, false);
        }

        /// Zand met fijne korrel en windribbels. Eén herhaling = 6 m.
        public static PbrSet Zand() => Haal("zand", MaakZand);

        static PbrSet MaakZand()
        {
            const int N = 512;
            var d = new Doek(N, N);
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float korrel = ProcRuis.Hash01(x, y, 41);
                    float ribbel = Mathf.Sin((v * 10f + ProcRuis.Fbm(u, v, 4, 2, 42) * 1.5f) * Mathf.PI * 2f) * 0.5f + 0.5f;
                    float vlek = ProcRuis.Fbm(u, v, 3, 3, 43);
                    Color k = Color.Lerp(K(0.70f, 0.62f, 0.45f), K(0.82f, 0.74f, 0.56f), vlek);
                    k *= (0.9f + 0.15f * korrel) * (0.95f + 0.06f * ribbel);
                    d.Zet(x, y, k, 0.5f * ribbel + 0.5f * korrel, 0.05f);
                }
            }
            return d.NaarPbr("Zand", 2f, false);
        }

        // ═══════ VERHARDING ═══════

        /// Asfalt (grijs) of rood fietsasfalt. Eén herhaling = 4 m.
        public static PbrSet Asfalt(bool rood) => Haal(rood ? "fietsasfalt" : "asfalt", () => MaakAsfalt(rood));

        static PbrSet MaakAsfalt(bool rood)
        {
            const int N = 512;
            var d = new Doek(N, N);
            Color basis = rood ? K(0.43f, 0.16f, 0.13f) : K(0.20f, 0.20f, 0.21f);
            Color steen = rood ? K(0.56f, 0.34f, 0.29f) : K(0.43f, 0.42f, 0.41f);
            int s = rood ? 60 : 50;

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float h = ProcRuis.Hash01(x, y, s + 1);
                    float h2 = ProcRuis.Hash01(x >> 1, y >> 1, s + 2);
                    float vlek = ProcRuis.Fbm(u, v, 4, 4, s + 3);
                    float slijt = ProcRuis.Fbm(u, v, 16, 3, s + 4);
                    float teer = Glad01(0.64f, 0.74f, ProcRuis.Fbm(u, v, 6, 3, s + 5));

                    Color k = basis * (0.86f + 0.28f * vlek);
                    if (h2 > 0.82f) k = Color.Lerp(k, steen, 0.6f);
                    else if (h2 < 0.12f) k *= 0.72f;
                    k *= 0.92f + 0.12f * h;
                    if (!rood) k = Color.Lerp(k, k * 0.72f, teer * 0.6f);

                    d.Zet(x, y, k, h2 * 0.6f + h * 0.4f, 0.10f + 0.20f * teer + 0.05f * slijt);
                }
            }
            return d.NaarPbr(rood ? "Fietsasfalt" : "Asfalt", 2.5f, true);
        }

        /// Gebakken klinkers in halfsteensverband (woonerf). Eén herhaling = 2,1 m (10 x 20 stenen).
        public static PbrSet Klinkers() => Haal("klinkers", MaakKlinkers);

        static PbrSet MaakKlinkers()
        {
            const int N = 512;
            var d = new Doek(N, N);
            Color[] tinten =
            {
                K(0.45f, 0.22f, 0.14f), K(0.38f, 0.18f, 0.12f), K(0.52f, 0.28f, 0.17f), K(0.31f, 0.17f, 0.12f), K(0.47f, 0.25f, 0.18f),
            };
            Color voeg = K(0.32f, 0.29f, 0.24f);

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float sv = v * 20f;
                    int rij = Mathf.FloorToInt(sv);
                    float lu = u * 10f + ((rij & 1) == 1 ? 0.5f : 0f);
                    int kol = Mathf.FloorToInt(lu);
                    float fx = lu - kol, fy = sv - rij;
                    float rand = Mathf.Min(Mathf.Min(fx, 1f - fx) * 0.21f, Mathf.Min(fy, 1f - fy) * 0.105f);

                    if (rand < 0.004f)
                    {
                        d.Zet(x, y, voeg * (0.9f + 0.2f * ProcRuis.Hash01(x, y, 64)), 0.1f, 0.05f);
                        continue;
                    }

                    float steenHash = ProcRuis.Hash01(Wikkel(kol, 10), Wikkel(rij, 20), 61);
                    Color k = tinten[Mathf.Min(tinten.Length - 1, (int)(steenHash * tinten.Length))];
                    k *= (0.9f + 0.15f * ProcRuis.Fbm(u, v, 32, 2, 62)) * (0.93f + 0.1f * ProcRuis.Hash01(x, y, 63));
                    float afschuining = Glad01(0.004f, 0.016f, rand);
                    d.Zet(x, y, k, 0.4f + 0.6f * afschuining, 0.18f);
                }
            }
            return d.NaarPbr("Klinkers", 5f, true);
        }

        /// Grijze betonnen stoeptegels 30x30. Eén herhaling = 1,8 m (6 x 6 tegels).
        public static PbrSet Stoeptegels() => Haal("stoeptegels", MaakStoeptegels);

        static PbrSet MaakStoeptegels()
        {
            const int N = 512;
            var d = new Doek(N, N);
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float su = u * 6f, sv = v * 6f;
                    int kol = Mathf.FloorToInt(su), rij = Mathf.FloorToInt(sv);
                    float fx = su - kol, fy = sv - rij;
                    float rand = Mathf.Min(Mathf.Min(fx, 1f - fx), Mathf.Min(fy, 1f - fy)) * 0.3f;

                    if (rand < 0.003f)
                    {
                        d.Zet(x, y, K(0.30f, 0.30f, 0.29f), 0.1f, 0.05f);
                        continue;
                    }

                    float g = 0.56f + (ProcRuis.Hash01(Wikkel(kol, 6), Wikkel(rij, 6), 71) - 0.5f) * 0.09f;
                    Color k = K(g, g, g * 0.97f);
                    k *= 0.93f + 0.1f * ProcRuis.Hash01(x, y, 72) + 0.07f * ProcRuis.Fbm(u, v, 24, 2, 73);
                    k *= 1f - 0.12f * Glad01(0.6f, 0.8f, ProcRuis.Fbm(u, v, 3, 3, 74));
                    d.Zet(x, y, k, 0.4f + 0.6f * Glad01(0.003f, 0.012f, rand), 0.15f);
                }
            }
            return d.NaarPbr("Stoeptegels", 4f, true);
        }

        /// Beton (banden, brugdekken, pijlers, portalen). Eén herhaling = 2 m.
        public static PbrSet Beton() => Haal("beton", MaakBeton);

        static PbrSet MaakBeton()
        {
            const int N = 256;
            var d = new Doek(N, N);
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float vlek = ProcRuis.Fbm(u, v, 4, 4, 81);
                    float por = ProcRuis.Hash01(x, y, 82);
                    Color k = K(0.62f, 0.61f, 0.58f) * (0.86f + 0.22f * vlek) * (0.95f + 0.08f * por);
                    float h = 0.6f + 0.2f * vlek;
                    if (por > 0.996f) { k *= 0.6f; h = 0.3f; }
                    if (Frac(v * 2f) < 0.008f) { k *= 0.85f; h = 0.45f; } // bekistingsnaad
                    d.Zet(x, y, k, h, 0.2f);
                }
            }
            return d.NaarPbr("Beton", 2f, true);
        }

        // ═══════ GEVELS ═══════

        struct GevelParameters
        {
            public Color Muur, Voeg, Kozijn, Dorpel;
            public float RaamBreedte, RaamHoogte, Borstwering, KozijnDikte, Variatie;
            public bool Baksteen, Paneel, Roede, Bovenlicht, Rollaag, Vuilstrepen;
        }

        /// Gevel van 2 traveeën (2 x 3 m) bij 2 verdiepingen (2 x 3 m): één herhaling = 6 x 6 m.
        /// De meshes mappen per verdieping een halve textuur in v en per travee een halve in u,
        /// zodat de vier ramen in de textuur onderling verschillen (gordijnen, lamellen, licht).
        public static PbrSet Gevel(GevelStijl stijl) => Haal("gevel_" + stijl, () => MaakGevel(stijl, true));

        /// Hetzelfde metselwerk/materiaal zonder ramen: kopgevels, borstweringen, blinde zijmuren.
        /// Eén herhaling = 6 x 6 m.
        public static PbrSet Muurwerk(GevelStijl stijl) => Haal("muurwerk_" + stijl, () => MaakGevel(stijl, false));

        static GevelParameters ParametersVoor(GevelStijl stijl)
        {
            var p = new GevelParameters
            {
                Voeg = K(0.72f, 0.70f, 0.66f),
                Kozijn = K(0.92f, 0.92f, 0.90f),
                Dorpel = K(0.74f, 0.73f, 0.70f),
                RaamBreedte = 1.5f,
                RaamHoogte = 1.6f,
                Borstwering = 0.85f,
                KozijnDikte = 0.07f,
                Variatie = 0.07f,
            };

            switch (stijl)
            {
                case GevelStijl.BaksteenRood:
                    p.Muur = K(0.50f, 0.22f, 0.15f);
                    p.Baksteen = p.Roede = p.Bovenlicht = p.Rollaag = true;
                    break;
                case GevelStijl.BaksteenBruin:
                    p.Muur = K(0.34f, 0.20f, 0.14f);
                    p.Voeg = K(0.55f, 0.52f, 0.48f);
                    p.Kozijn = K(0.13f, 0.24f, 0.17f); // Amsterdams groen
                    p.RaamBreedte = 1.4f;
                    p.RaamHoogte = 1.75f;
                    p.Baksteen = p.Roede = p.Rollaag = true;
                    break;
                case GevelStijl.BaksteenGeel:
                    p.Muur = K(0.72f, 0.60f, 0.38f);
                    p.Voeg = K(0.76f, 0.74f, 0.69f);
                    p.RaamBreedte = 1.6f;
                    p.RaamHoogte = 1.5f;
                    p.Borstwering = 0.9f;
                    p.Variatie = 0.05f;
                    p.Baksteen = p.Bovenlicht = true;
                    break;
                case GevelStijl.Stuc:
                    p.Muur = K(0.87f, 0.85f, 0.79f);
                    p.Kozijn = K(0.18f, 0.19f, 0.20f);
                    p.Dorpel = K(0.30f, 0.31f, 0.32f);
                    p.RaamBreedte = 1.8f;
                    p.RaamHoogte = 1.9f;
                    p.Borstwering = 0.6f;
                    p.KozijnDikte = 0.05f;
                    p.Vuilstrepen = true;
                    break;
                case GevelStijl.ModernDonker:
                    p.Muur = K(0.20f, 0.21f, 0.22f);
                    p.Kozijn = K(0.11f, 0.11f, 0.12f);
                    p.Dorpel = K(0.11f, 0.11f, 0.12f);
                    p.RaamBreedte = 2.3f;
                    p.RaamHoogte = 2.45f;
                    p.Borstwering = 0.15f;
                    p.KozijnDikte = 0.05f;
                    p.Paneel = true;
                    break;
                default:
                    p.Muur = K(0.66f, 0.65f, 0.61f);
                    break;
            }
            return p;
        }

        static PbrSet MaakGevel(GevelStijl stijl, bool ramen)
        {
            const int N = 512;
            var d = new Doek(N, N);
            var p = ParametersVoor(stijl);
            int s = 100 + (int)stijl * 10;

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float mx = u * 6f, my = v * 6f;
                    int travee = mx < 3f ? 0 : 1;
                    int vloer = my < 3f ? 0 : 1;
                    float bx = mx - travee * 3f, by = my - vloer * 3f;
                    int raamId = travee + vloer * 2;

                    switch (stijl)
                    {
                        case GevelStijl.Vliesgevel:
                            Vliesgevel(d, x, y, u, v, mx, bx, ramen ? by : 0.1f, raamId, s);
                            continue;
                        case GevelStijl.BetonBand:
                            BetonBand(d, x, y, u, v, mx, bx, ramen ? by : 0.5f, raamId, s);
                            continue;
                        case GevelStijl.Golfplaat:
                            Golfplaat(d, x, y, u, v, mx, by);
                            continue;
                    }

                    // Muur.
                    Color k;
                    float h, glad;
                    if (p.Baksteen)
                        Baksteen(p.Muur, p.Voeg, p.Variatie, x, y, mx, my, s, out k, out h, out glad);
                    else if (p.Paneel)
                    {
                        k = p.Muur * (0.95f + 0.08f * ProcRuis.Fbm(u, v, 8, 3, s + 1));
                        h = 0.8f;
                        glad = 0.25f;
                        if (Frac(mx / 0.75f) * 0.75f < 0.012f || by < 0.02f) { k *= 0.55f; h = 0.6f; }
                    }
                    else
                    {
                        k = p.Muur * (0.94f + 0.1f * ProcRuis.Fbm(u, v, 8, 3, s + 1));
                        h = 0.8f + 0.04f * ProcRuis.Fbm(u, v, 32, 2, s + 2);
                        glad = 0.15f;
                    }

                    float rx0 = (3f - p.RaamBreedte) * 0.5f, rx1 = rx0 + p.RaamBreedte;
                    float ry0 = p.Borstwering, ry1 = p.Borstwering + p.RaamHoogte;

                    if (!ramen)
                    {
                        d.Zet(x, y, k, h, glad);
                        continue;
                    }

                    // Vuilstrepen onder de ramen (regenwater langs de dorpel).
                    if (p.Vuilstrepen && bx > rx0 && bx < rx1 && by < ry0)
                    {
                        float streep = ProcRuis.Fbm(u * 1f, v, 64, 2, s + 3);
                        float afname = 1f - Mathf.Clamp01((ry0 - by) / ry0);
                        k *= 1f - 0.18f * afname * Glad01(0.45f, 0.7f, streep);
                    }

                    // Rollaag (staande stenen) boven het raam.
                    if (p.Rollaag && by > ry1 && by < ry1 + 0.2f && bx > rx0 - 0.1f && bx < rx1 + 0.1f)
                    {
                        bool voeg = Frac(mx / 0.065f) < 0.15f || by - ry1 < 0.01f;
                        k = voeg ? p.Voeg : p.Muur * (0.85f + 0.2f * ProcRuis.Hash01(Mathf.FloorToInt(mx / 0.065f), vloer, s + 4));
                        h = voeg ? 0.55f : 0.88f;
                        glad = 0.1f;
                    }

                    // Dorpel onder het raam.
                    if (by > ry0 - 0.07f && by <= ry0 && bx > rx0 - 0.05f && bx < rx1 + 0.05f)
                    {
                        k = p.Dorpel * (0.95f + 0.08f * ProcRuis.Hash01(x, y, s + 5));
                        h = 0.97f;
                        glad = 0.3f;
                    }

                    // Raam.
                    if (bx >= rx0 && bx <= rx1 && by >= ry0 && by <= ry1)
                    {
                        float lx = bx - rx0, ly = by - ry0;
                        float t = p.KozijnDikte;
                        bool kozijn = lx < t || lx > p.RaamBreedte - t || ly < t || ly > p.RaamHoogte - t
                            || (p.Roede && Mathf.Abs(lx - p.RaamBreedte * 0.5f) < t * 0.5f)
                            || (p.Bovenlicht && Mathf.Abs(ly - p.RaamHoogte * 0.72f) < t * 0.5f);

                        if (kozijn)
                        {
                            k = p.Kozijn;
                            h = 0.7f;
                            glad = 0.45f;
                        }
                        else
                        {
                            k = Glas(u, v, lx, ly, p.RaamBreedte, p.RaamHoogte, raamId, s);
                            h = 0.1f;
                            glad = 0.93f;
                        }
                    }

                    d.Zet(x, y, k, h, glad);
                }
            }
            return d.NaarPbr((ramen ? "Gevel_" : "Muurwerk_") + stijl, 6f, true);
        }

        static void Baksteen(Color muur, Color voegKleur, float variatie, int x, int y, float mx, float my, int s,
            out Color k, out float h, out float glad)
        {
            // 96 lagen van 6,25 cm en 28 stenen per 6 m: tegelt exact.
            float lagen = my / 0.0625f;
            int rij = Mathf.FloorToInt(lagen);
            float fy = lagen - rij;
            float stenen = mx / (6f / 28f) + ((rij & 1) == 1 ? 0.5f : 0f);
            int kol = Mathf.FloorToInt(stenen);
            float fx = stenen - kol;

            bool voeg = fy < 0.16f || fx < 0.05f;
            if (voeg)
            {
                k = voegKleur * (0.92f + 0.12f * ProcRuis.Hash01(x, y, s + 6));
                h = 0.55f;
                glad = 0.05f;
                return;
            }

            float steenHash = ProcRuis.Hash01(Wikkel(kol, 28), Wikkel(rij, 96), s + 7);
            k = muur * (1f + (steenHash - 0.5f) * 2f * variatie);
            if (ProcRuis.Hash01(Wikkel(kol, 28), Wikkel(rij, 96), s + 8) > 0.93f)
                k *= 0.78f;
            k *= 0.93f + 0.1f * ProcRuis.Hash01(x, y, s + 9);
            h = 0.85f + 0.05f * ProcRuis.Hash01(x, y, s + 10);
            glad = 0.12f;
        }

        /// Glas met een zweem lucht-reflectie (lichter naar boven) en per raam een eigen
        /// interieur: gordijnen, lamellen, licht aan of gewoon spiegelend.
        static Color Glas(float u, float v, float lx, float ly, float rb, float rh, int raamId, int s)
        {
            Color glas = Color.Lerp(K(0.09f, 0.12f, 0.16f), K(0.33f, 0.41f, 0.49f), Mathf.Clamp01(ly / rh) * 0.85f);
            float r = ProcRuis.Hash01(raamId, s, 7);
            if (r < 0.3f)
            {
                if (lx < rb * 0.2f || lx > rb * 0.8f)
                {
                    float kleurKeuze = ProcRuis.Hash01(raamId, s, 8);
                    Color gordijn = kleurKeuze < 0.33f ? K(0.62f, 0.55f, 0.44f) : kleurKeuze < 0.66f ? K(0.45f, 0.45f, 0.46f) : K(0.48f, 0.22f, 0.18f);
                    float plooi = 0.8f + 0.2f * Mathf.Sin(lx * 60f);
                    glas = Color.Lerp(glas, gordijn * plooi, 0.75f);
                }
            }
            else if (r < 0.5f)
            {
                if (ly > rh * 0.45f && Frac(ly / 0.04f) < 0.55f)
                    glas = Color.Lerp(glas, K(0.74f, 0.73f, 0.70f), 0.7f);
            }
            else if (r < 0.62f)
            {
                glas = Color.Lerp(glas, K(0.58f, 0.47f, 0.33f), 0.45f);
            }

            glas *= 0.9f + 0.2f * ProcRuis.Fbm(u, v, 16, 2, s + 11);
            if (ly > rh - 0.12f) glas *= 0.6f;   // schaduw van de latei
            if (lx < 0.08f) glas *= 0.75f;       // schaduw van de dagkant
            return glas;
        }

        static void Vliesgevel(Doek d, int x, int y, float u, float v, float mx, float bx, float by, int raamId, int s)
        {
            bool stijl = Frac(mx / 1.5f) * 1.5f < 0.05f;
            bool regel = (by > 0.88f && by < 0.93f) || by > 2.95f;
            if (stijl || regel)
            {
                d.Zet(x, y, K(0.55f, 0.56f, 0.58f), 0.85f, 0.6f, 0.6f);
                return;
            }
            if (by < 0.88f)
            {
                d.Zet(x, y, K(0.11f, 0.13f, 0.16f) * (0.95f + 0.1f * ProcRuis.Fbm(u, v, 8, 2, s + 1)), 0.5f, 0.82f);
                return;
            }

            int paneel = Mathf.FloorToInt(mx / 1.5f) + raamId * 7;
            Color glas = Color.Lerp(K(0.13f, 0.19f, 0.25f), K(0.42f, 0.52f, 0.62f), Mathf.Clamp01((by - 0.9f) / 2.05f));
            glas *= 0.92f + 0.12f * ProcRuis.Hash01(paneel, 3, s);
            if (ProcRuis.Hash01(paneel, 4, s) > 0.75f)
                glas = Color.Lerp(glas, K(0.55f, 0.52f, 0.45f), 0.35f);
            d.Zet(x, y, glas, 0.3f, 0.95f, 0.1f);
        }

        static void BetonBand(Doek d, int x, int y, float u, float v, float mx, float bx, float by, int raamId, int s)
        {
            if (by < 1.0f || by > 2.65f)
            {
                Color k = K(0.68f, 0.67f, 0.63f) * (0.88f + 0.2f * ProcRuis.Fbm(u, v, 6, 3, s + 1));
                float h = 0.85f;
                if (bx < 0.015f || Mathf.Abs(by - 1.0f) < 0.015f) { k *= 0.6f; h = 0.6f; }
                d.Zet(x, y, k, h, 0.2f);
                return;
            }
            if (Frac(mx / 1.2f) * 1.2f < 0.05f || by < 1.04f || by > 2.61f)
            {
                d.Zet(x, y, K(0.16f, 0.16f, 0.17f), 0.7f, 0.45f);
                return;
            }
            d.Zet(x, y, Glas(u, v, Frac(mx / 1.2f) * 1.2f, by - 1.0f, 1.2f, 1.65f, raamId * 5 + Mathf.FloorToInt(mx / 1.2f), s), 0.1f, 0.93f);
        }

        static void Golfplaat(Doek d, int x, int y, float u, float v, float mx, float by)
        {
            float rib = Mathf.Sin(mx / 0.2f * Mathf.PI * 2f) * 0.5f + 0.5f;
            Color k = K(0.78f, 0.79f, 0.80f) * (0.80f + 0.25f * rib) * (0.95f + 0.07f * ProcRuis.Fbm(u, v, 6, 3, 191));
            if (by < 0.03f) k *= 0.7f; // naad tussen platen
            d.Zet(x, y, k, rib, 0.35f, 0.45f);
        }

        /// Winkelpui: plint, etalage met schappen, deur, reclamebord met letters, lijst erboven.
        /// Twee traveeën (6 m) bij 4,5 m hoog. Variant 0-5 bepaalt de huiskleur van de winkel.
        public static PbrSet Winkelpui(int variant) => Haal("winkelpui_" + variant, () => MaakWinkelpui(variant));

        static readonly Color[] WinkelKleuren =
        {
            new Color(0.55f, 0.10f, 0.10f), new Color(0.08f, 0.25f, 0.15f), new Color(0.08f, 0.12f, 0.30f),
            new Color(0.10f, 0.10f, 0.10f), new Color(0.75f, 0.40f, 0.10f), new Color(0.86f, 0.86f, 0.83f),
        };

        static PbrSet MaakWinkelpui(int variant)
        {
            const int W = 512, H = 384;
            var d = new Doek(W, H);
            int s = 300 + variant * 10;
            Color huis = WinkelKleuren[Wikkel(variant, WinkelKleuren.Length)];
            Color letter = variant == 5 ? K(0.1f, 0.1f, 0.1f) : K(0.95f, 0.93f, 0.85f);
            int deurTravee = variant & 1;

            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W, v = (y + 0.5f) / H;
                    float mx = u * 6f, my = v * 4.5f;
                    int travee = mx < 3f ? 0 : 1;
                    float bx = mx - travee * 3f;

                    if (my < 0.35f)
                    {
                        d.Zet(x, y, K(0.16f, 0.16f, 0.17f) * (0.92f + 0.12f * ProcRuis.Hash01(x, y, s)), 0.9f, 0.4f);
                        continue;
                    }

                    if (my < 3.05f)
                    {
                        bool kader = bx < 0.08f || bx > 2.92f || my < 0.43f || my > 2.97f;
                        bool deur = travee == deurTravee && bx > 1.0f && bx < 2.0f && my < 2.6f;
                        if (deur)
                            kader = kader || bx < 1.06f || bx > 1.94f || my > 2.54f || (Mathf.Abs(bx - 1.85f) < 0.02f && Mathf.Abs(my - 1.3f) < 0.25f);

                        if (kader)
                        {
                            d.Zet(x, y, K(0.12f, 0.12f, 0.13f), 0.8f, 0.5f, 0.4f);
                            continue;
                        }

                        // Interieur: schappen met producten, warm verlicht, met reflectie erover.
                        Color binnen = K(0.62f, 0.55f, 0.45f);
                        if (!deur && my > 0.6f && my < 2.6f)
                        {
                            float plank = Frac((my - 0.6f) / 0.4f);
                            if (plank < 0.08f)
                                binnen = K(0.50f, 0.50f, 0.50f);
                            else
                            {
                                float product = ProcRuis.Hash01(Mathf.FloorToInt(mx / 0.12f), Mathf.FloorToInt((my - 0.6f) / 0.4f), s + 1);
                                binnen = Color.HSVToRGB(product, 0.45f, 0.75f) * (0.7f + 0.3f * plank);
                            }
                        }
                        Color reflectie = Color.Lerp(K(0.12f, 0.15f, 0.19f), K(0.42f, 0.50f, 0.58f), Mathf.Clamp01((my - 0.4f) / 2.6f));
                        Color glas = Color.Lerp(binnen, reflectie, 0.4f);
                        d.Zet(x, y, glas, 0.2f, 0.92f);
                        continue;
                    }

                    if (my < 3.75f)
                    {
                        Color k = huis * (0.93f + 0.08f * ProcRuis.Fbm(u, v, 12, 2, s + 2));
                        float h = 0.85f;
                        bool letterVak = bx > 0.6f && bx < 2.4f && my > 3.25f && my < 3.55f;
                        if (letterVak && ProcRuis.Hash01(Mathf.FloorToInt(mx / 0.12f), travee, s + 3) > 0.3f && Frac(mx / 0.12f) < 0.72f)
                        {
                            k = letter;
                            h = 0.95f;
                        }
                        if (my < 3.09f || my > 3.71f) { k *= 0.6f; h = 0.7f; }
                        d.Zet(x, y, k, h, 0.45f);
                        continue;
                    }

                    Color steen = K(0.30f, 0.28f, 0.27f) * (0.9f + 0.15f * ProcRuis.Fbm(u, v, 16, 3, s + 4));
                    float hh = 0.8f;
                    if (my < 3.82f) { steen = K(0.78f, 0.77f, 0.73f); hh = 1f; }
                    d.Zet(x, y, steen, hh, 0.2f);
                }
            }
            return d.NaarPbr("Winkelpui_" + variant, 5f, true);
        }

        // ═══════ DAKEN ═══════

        /// Keramische dakpannen (rood of geglazuurd antraciet). Eén herhaling = 2 x 2 m.
        public static PbrSet Dakpannen(bool antraciet) => Haal(antraciet ? "pannen_antraciet" : "pannen_rood", () => MaakDakpannen(antraciet));

        static PbrSet MaakDakpannen(bool antraciet)
        {
            const int N = 256;
            var d = new Doek(N, N);
            Color basis = antraciet ? K(0.17f, 0.17f, 0.18f) : K(0.55f, 0.22f, 0.14f);
            Color donker = antraciet ? K(0.12f, 0.12f, 0.13f) : K(0.42f, 0.17f, 0.11f);
            int s = antraciet ? 410 : 400;

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float sv = v * 6f, su = u * 8f;
                    int rij = Mathf.FloorToInt(sv), kol = Mathf.FloorToInt(su);
                    float fy = sv - rij, fx = su - kol;
                    float golf = Mathf.Sin(fx * Mathf.PI * 2f) * 0.5f + 0.5f;

                    float pan = ProcRuis.Hash01(Wikkel(kol, 8), Wikkel(rij, 6), s);
                    Color k = Color.Lerp(basis, donker, pan > 0.85f ? 0.8f : pan * 0.35f);
                    k *= 0.82f + 0.18f * golf;
                    if (fy > 0.88f) k *= 0.55f; // schaduw onder de overlap van de volgende rij
                    k *= 0.94f + 0.08f * ProcRuis.Hash01(x, y, s + 1);

                    float h = 0.35f + 0.35f * golf + (1f - fy) * 0.3f;
                    d.Zet(x, y, k, h, antraciet ? 0.5f : 0.25f);
                }
            }
            return d.NaarPbr(antraciet ? "Dakpannen_Antraciet" : "Dakpannen_Rood", 5f, true);
        }

        /// Plat dak: bitumen met grind. Eén herhaling = 3 m.
        public static PbrSet Dakgrind() => Haal("dakgrind", MaakDakgrind);

        static PbrSet MaakDakgrind()
        {
            const int N = 256;
            var d = new Doek(N, N);
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float f1 = ProcRuis.Worley(u, v, 40, 501, out float f2, out float cel);
                    float g = 0.40f + 0.2f * cel;
                    Color steen = K(g, g * 0.98f, g * 0.95f);
                    Color k = Color.Lerp(K(0.14f, 0.14f, 0.15f), steen, Glad01(0f, 0.25f, f2 - f1));
                    k *= 0.9f + 0.15f * ProcRuis.Fbm(u, v, 4, 3, 502);
                    d.Zet(x, y, k, 1f - f1, 0.1f);
                }
            }
            return d.NaarPbr("Dakgrind", 3f, true);
        }

        // ═══════ BOUWPLAATS ═══════

        /// Steigerwerk: buizen, leuning, kantplank en schoren met alfa (uitgesneden).
        /// Eén herhaling = 2 x 2 m.
        public static PbrSet Steiger() => Haal("steiger", MaakSteiger);

        static PbrSet MaakSteiger()
        {
            const int N = 256;
            var d = new Doek(N, N) { Alfa = new float[N * N] };
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float mx = (x + 0.5f) / N * 2f, my = (y + 0.5f) / N * 2f;
                    bool staander = mx < 0.05f;
                    bool ligger = my < 0.05f || (my > 1.0f && my < 1.045f);
                    bool plank = my > 0.05f && my < 0.2f;
                    bool schoor = Mathf.Abs(mx - my) < 0.03f;
                    int i = y * N + x;

                    if (plank)
                    {
                        d.Zet(x, y, K(0.62f, 0.48f, 0.28f) * (0.85f + 0.2f * ProcRuis.Hash01(x, y >> 2, 601)), 0.8f, 0.2f);
                        d.Alfa[i] = 1f;
                    }
                    else if (staander || ligger || schoor)
                    {
                        d.Zet(x, y, K(0.62f, 0.63f, 0.65f), 1f, 0.5f, 0.7f);
                        d.Alfa[i] = 1f;
                    }
                    else
                    {
                        d.Zet(x, y, K(0.5f, 0.5f, 0.5f), 0f, 0f);
                        d.Alfa[i] = 0f;
                    }
                }
            }
            return d.NaarPbr("Steiger", 3f, true);
        }

        // ═══════ BOMEN ═══════

        /// Boomschors: groeven (loofboom/den) of witte berkenbast. u = rondom de stam, v = hoogte.
        public static PbrSet Schors(bool berk) => Haal(berk ? "schors_berk" : "schors", () => MaakSchors(berk));

        static PbrSet MaakSchors(bool berk)
        {
            const int W = 128, H = 256;
            var d = new Doek(W, H);
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    float u = (x + 0.5f) / W, v = (y + 0.5f) / H;
                    if (berk)
                    {
                        Color k = K(0.86f, 0.85f, 0.80f) * (0.92f + 0.1f * ProcRuis.Hash01(x, y, 701));
                        float h = 0.7f;
                        bool lenticel = ProcRuis.Hash01(Mathf.FloorToInt(u * 16f), Mathf.FloorToInt(v * 64f), 702) > 0.8f && Frac(v * 64f) < 0.35f;
                        float vlek = Glad01(0.68f, 0.78f, ProcRuis.Fbm(u, v, 4, 3, 703));
                        if (lenticel) { k = K(0.16f, 0.14f, 0.13f); h = 0.4f; }
                        k = Color.Lerp(k, K(0.12f, 0.11f, 0.10f), vlek * 0.85f);
                        d.Zet(x, y, k, h, 0.2f);
                    }
                    else
                    {
                        float groef = Mathf.Abs(Mathf.Sin((u * 6f + (ProcRuis.Fbm(u, v, 4, 3, 711) - 0.5f) * 1.2f) * Mathf.PI));
                        Color k = K(0.29f, 0.23f, 0.18f) * (0.6f + 0.5f * groef) * (0.9f + 0.2f * ProcRuis.Hash01(x, y, 712));
                        d.Zet(x, y, k, groef, 0.12f);
                    }
                }
            }
            return d.NaarPbr(berk ? "Schors_Berk" : "Schors", 4f, true);
        }

        /// Bladerdek: plukken blad met lichte kernen en donkere openingen; v = hoogte in de kruin,
        /// dus de onderkant is donkerder (zelfschaduw) en de bovenkant vangt licht.
        public static PbrSet Blad(BladSoort soort) => Haal("blad_" + soort, () => MaakBlad(soort));

        static PbrSet MaakBlad(BladSoort soort)
        {
            const int N = 256;
            var d = new Doek(N, N);
            Color donker, licht;
            int cellen = 12;
            switch (soort)
            {
                case BladSoort.Linde: donker = K(0.20f, 0.35f, 0.11f); licht = K(0.40f, 0.56f, 0.18f); break;
                case BladSoort.Berk: donker = K(0.28f, 0.42f, 0.14f); licht = K(0.52f, 0.64f, 0.23f); cellen = 16; break;
                case BladSoort.Den: donker = K(0.08f, 0.18f, 0.10f); licht = K(0.17f, 0.31f, 0.15f); cellen = 28; break;
                default: donker = K(0.15f, 0.27f, 0.08f); licht = K(0.32f, 0.46f, 0.14f); break;
            }
            int s = 800 + (int)soort * 10;

            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N, v = (y + 0.5f) / N;
                    float f1 = ProcRuis.Worley(u, v, cellen, s, out float f2, out float cel);
                    float pluk = 1f - Glad01(0f, 0.75f, f1);
                    float opening = Glad01(0f, 0.15f, f2 - f1);
                    float blaadjes = ProcRuis.Fbm(u, v, 32, 2, s + 1);
                    float fijn = ProcRuis.Hash01(x, y, s + 2);

                    Color k = Color.Lerp(donker, licht, pluk * 0.65f + blaadjes * 0.25f + cel * 0.1f);
                    k *= (0.55f + 0.45f * opening) * (0.88f + 0.24f * fijn);
                    k *= Mathf.Lerp(0.6f, 1.12f, v);
                    d.Zet(x, y, k, pluk * 0.7f + fijn * 0.3f, 0.25f);
                }
            }
            return d.NaarPbr("Blad_" + soort, 3f, true);
        }

        // ═══════ OVERLAYS ═══════

        /// Witte rand met doorschijnend binnenvlak, voor de zone-overlay (getint per zone).
        public static Texture2D ZoneRaster()
        {
            if (_zoneRaster != null)
                return _zoneRaster;

            const int N = 128;
            var px = new Color32[N * N];
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    int rand = Mathf.Min(Mathf.Min(x, N - 1 - x), Mathf.Min(y, N - 1 - y));
                    byte a = rand < 3 ? (byte)235 : (byte)90;
                    px[y * N + x] = new Color32(255, 255, 255, a);
                }
            }
            _zoneRaster = new Texture2D(N, N, TextureFormat.RGBA32, true, false)
            {
                name = "ZoneRaster",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };
            _zoneRaster.SetPixels32(px);
            _zoneRaster.Apply(true, true);
            return _zoneRaster;
        }
    }
}
