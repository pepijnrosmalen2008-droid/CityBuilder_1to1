using System.Collections.Generic;
using Unity.Entities;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;
using CityBuilder.Game.Visualisatie.Procedureel;

namespace CityBuilder.Game.Visualisatie
{
    /// Bouwt één wegvak als één mesh: verharding, verhoogde stoepen met betonbanden, bermen,
    /// Nederlandse belijning (3-9 rijstrookscheiding, 1-1 fietsstrook, kantstrepen), zebrapaden
    /// bij kruispunten, tramrails met bovenleiding, brugdek met leuning en pijlers, of een
    /// verdiepte tunnelbak met keerwanden en portaal. Straatbomen en lantaarnpalen komen als
    /// kinderen onder hetzelfde object, zodat ze meegaan bij splitsen of upgraden.
    public static class WegMeshBouwer
    {
        const float AsfaltY = 0.06f;
        const float OppervlakY = 0.075f;
        const float RailY = 0.09f;
        const float VerfY = 0.095f;
        const float StoepHoogte = 0.15f;
        const float BermHoogte = 0.12f;
        const float BandOnder = -0.35f;
        const float BovenleidingHoogte = 5.6f;
        const float Resample = 4f;

        public sealed class Lijn
        {
            public Vector3[] P;
            public Vector3[] Z;  // eenheidsvector naar rechts (in tekenrichting)
            public float[] S;    // horizontale booglengte
            public float Lengte => S[S.Length - 1];
        }

        struct Laan
        {
            public LaneType Type;
            public float Breedte;
            public float Midden;
        }

        public static GameObject Bouw(EntityManager em, Entity segment, Transform ouder)
        {
            var data = em.GetComponentData<WegSegmentData>(segment);
            var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
            var buffer = em.GetBuffer<LaneBufferElement>(segment);
            if (spline.Length < 2 || buffer.Length == 0)
                return null;

            float totaal = WegProfielUtility.TotaleBreedte(buffer);
            float hb = totaal * 0.5f;
            var lanes = new Laan[buffer.Length];
            float cursor = -hb;
            for (int i = 0; i < buffer.Length; i++)
            {
                lanes[i] = new Laan { Type = buffer[i].Type, Breedte = buffer[i].BreedteMeter, Midden = cursor + buffer[i].BreedteMeter * 0.5f };
                cursor += buffer[i].BreedteMeter;
            }

            var punten = new Vector3[spline.Length];
            for (int i = 0; i < spline.Length; i++)
                punten[i] = new Vector3(spline[i].Punt.x, spline[i].Punt.y, spline[i].Punt.z);

            var profiel = data.HoogteProfiel;
            var basis = MaakLijn(punten, profiel, true);
            if (basis == null)
                return null;
            float L = basis.Lengte;

            float trimVan = KruispuntStraal(em, data.VanNode);
            float trimNaar = KruispuntStraal(em, data.NaarNode);
            // De volle breedte stopt waar zijn hoeken de kruispuntcirkel raken (koorde), zodat er
            // geen gras tussen weg en kruispuntvulling zit; stoepen en belijning stoppen op de cirkel.
            float koordVan = trimVan > 0f ? Mathf.Sqrt(Mathf.Max(0f, trimVan * trimVan - hb * hb)) : 0f;
            float koordNaar = trimNaar > 0f ? Mathf.Sqrt(Mathf.Max(0f, trimNaar * trimNaar - hb * hb)) : 0f;
            var vlak = Knip(basis, koordVan, L - koordNaar) ?? basis;
            var vol = Knip(basis, trimVan, L - trimNaar) ?? vlak;

            bool heeftRijbaan = false, alleenGedeeld = true, heeftTrottoir = false;
            foreach (var l in lanes)
            {
                if (IsRijbaan(l.Type) || l.Type == LaneType.GedeeldeBaan || l.Type == LaneType.Tramrail)
                {
                    heeftRijbaan = true;
                    if (l.Type != LaneType.GedeeldeBaan) alleenGedeeld = false;
                }
                if (l.Type == LaneType.Trottoir) heeftTrottoir = true;
            }

            Material basisMat;
            float basisTegel;
            if (!heeftRijbaan)
            {
                bool fiets = lanes[0].Type == LaneType.Fietspad;
                basisMat = fiets ? Materialen.Fietsasfalt : Materialen.Stoeptegels;
                basisTegel = fiets ? 4f : 1.8f;
            }
            else if (alleenGedeeld)
            {
                basisMat = Materialen.Klinkers;
                basisTegel = 2.1f;
            }
            else
            {
                basisMat = Materialen.Asfalt;
                basisTegel = 4f;
            }

            var mb = new MeshBouwer();
            Strook(mb, basisMat, vlak, 0f, totaal, AsfaltY, basisTegel, Vector3.up);
            Rand(mb, Materialen.Beton, vlak, -hb, AsfaltY, BandOnder, -1f);
            Rand(mb, Materialen.Beton, vlak, hb, AsfaltY, BandOnder, 1f);

            float tramSom = 0f, tramBreedte = 0f;
            int tramAantal = 0;

            for (int i = 0; i < lanes.Length; i++)
            {
                var laan = lanes[i];
                switch (laan.Type)
                {
                    case LaneType.Fietspad:
                        if (heeftRijbaan) Strook(mb, Materialen.Fietsasfalt, vlak, laan.Midden, laan.Breedte, OppervlakY, 4f, Vector3.up);
                        break;
                    case LaneType.Autorijbaan:
                        if (data.HeeftBusoverlay) Strook(mb, Materialen.Busbaan, vlak, laan.Midden, laan.Breedte, OppervlakY, 4f, Vector3.up);
                        break;
                    case LaneType.Tramrail:
                        Strook(mb, Materialen.Rail, vol, laan.Midden - 0.7175f, 0.1f, RailY, 1f, Vector3.up);
                        Strook(mb, Materialen.Rail, vol, laan.Midden + 0.7175f, 0.1f, RailY, 1f, Vector3.up);
                        tramSom += laan.Midden;
                        tramBreedte += laan.Breedte;
                        tramAantal++;
                        break;
                    case LaneType.Trottoir:
                        if (heeftRijbaan) Verhoogd(mb, Materialen.Stoeptegels, Materialen.Beton, vol, laan.Midden, laan.Breedte, AsfaltY + StoepHoogte, BandOnder, 1.8f);
                        break;
                    case LaneType.Berm:
                        Verhoogd(mb, Materialen.Gras, Materialen.Beton, vol, laan.Midden, laan.Breedte, AsfaltY + BermHoogte, BandOnder, 6f);
                        break;
                    case LaneType.Middenberm:
                        Verhoogd(mb, Materialen.Gras, Materialen.Beton, vol, laan.Midden, laan.Breedte, AsfaltY + BermHoogte, BandOnder, 6f);
                        if (data.WegType == WegTypeId.Snelweg)
                            Verhoogd(mb, Materialen.Beton, Materialen.Beton, vol, laan.Midden, 0.6f, AsfaltY + 0.9f, AsfaltY, 2f);
                        break;
                }

                if (i < lanes.Length - 1)
                    Belijning(mb, vol, laan, lanes[i + 1]);
            }

            if (tramAantal > 0)
                Bovenleiding(mb, vol, tramSom / tramAantal, tramBreedte * 0.5f);

            if (heeftTrottoir && heeftRijbaan)
            {
                if (trimVan > 0f) Zebra(mb, basis, lanes, trimVan + 0.6f, trimVan + 4.6f);
                if (trimNaar > 0f) Zebra(mb, basis, lanes, L - trimNaar - 4.6f, L - trimNaar - 0.6f);
            }

            Lijn grond = null;
            if (profiel.Modus != HoogteProfielModus.OpMaaiveld)
                grond = MaakLijn(punten, profiel, false);

            if (profiel.Modus == HoogteProfielModus.Verhoogd && grond != null)
                Brug(mb, vlak, basis, grond, totaal);
            if (profiel.Modus == HoogteProfielModus.Tunnel && grond != null)
                Tunnelbak(mb, basis, grond, profiel, totaal);

            var go = mb.BouwObject("WegVisueel_" + segment.Index, ouder, Vector3.zero);

            if (profiel.Modus == HoogteProfielModus.OpMaaiveld && heeftRijbaan)
                Inrichting(go.transform, basis, lanes, trimVan + 4f, L - trimNaar - 4f, data.WegType, segment.Index);

            if (profiel.Modus == HoogteProfielModus.Tunnel && grond != null)
            {
                var ov = new MeshBouwer();
                Strook(ov, Materialen.Overlay("tunneloverzicht", new Color(0.2f, 0.8f, 1f, 0.55f), null), grond, 0f, totaal + 1f, 1.5f, 4f, Vector3.up);
                var ovGo = ov.BouwObject("TunnelOverzicht", go.transform, Vector3.zero, false);
                ovGo.SetActive(false);
            }

            if (BoomBeheer.Instance != null)
                BoomBeheer.Instance.WisLangsLijn(basis.P, hb + 1.5f);

            return go;
        }

        static bool IsRijbaan(LaneType t) => t == LaneType.Autorijbaan || t == LaneType.Busbaan;

        static float KruispuntStraal(EntityManager em, Entity knoop)
        {
            if (knoop == Entity.Null || !em.Exists(knoop) || !em.HasComponent<KnoopVisueelData>(knoop))
                return 0f;
            var k = em.GetComponentData<KnoopVisueelData>(knoop);
            return k.Graad >= 3 ? k.Straal : 0f;
        }

        // ═══════ MIDDENLIJN ═══════

        public static float ProfielOffset(in HoogteProfielData p, float s, float lengte)
        {
            if (p.Modus == HoogteProfielModus.OpMaaiveld || lengte < 0.01f)
                return 0f;
            float overgang = Mathf.Clamp(p.OvergangsLengte, 0.01f, lengte * 0.5f);
            float f = Mathf.Min(Mathf.Clamp01(s / overgang), Mathf.Clamp01((lengte - s) / overgang));
            f = Mathf.SmoothStep(0f, 1f, f);
            return (p.Modus == HoogteProfielModus.Verhoogd ? 1f : -1f) * p.HoogteOffset * f;
        }

        /// Middenlijn elke 4 m bemonsterd en op het terrein gelegd (plus brug/tunnel-profiel), met
        /// per punt een gedeelde zijwaartse richting (gemiddelde van in- en uitgaand), zodat
        /// stroken op een bocht één doorlopende band vormen.
        public static Lijn MaakLijn(Vector3[] spline, HoogteProfielData profiel, bool metProfiel)
        {
            var p = new List<Vector3>();
            for (int i = 0; i < spline.Length - 1; i++)
            {
                Vector3 a = spline[i], b = spline[i + 1];
                float d = Vector2.Distance(new Vector2(a.x, a.z), new Vector2(b.x, b.z));
                if (d < 0.01f) continue;
                int n = Mathf.Max(1, Mathf.CeilToInt(d / Resample));
                for (int k = 0; k < n; k++)
                    p.Add(Vector3.Lerp(a, b, (float)k / n));
            }
            p.Add(spline[spline.Length - 1]);

            int m = p.Count;
            if (m < 2)
                return null;

            var s = new float[m];
            for (int i = 1; i < m; i++)
                s[i] = s[i - 1] + Vector2.Distance(new Vector2(p[i - 1].x, p[i - 1].z), new Vector2(p[i].x, p[i].z));
            float lengte = s[m - 1];
            if (lengte < 0.5f)
                return null;

            var pos = new Vector3[m];
            for (int i = 0; i < m; i++)
            {
                float y = TerreinHoogte.Op(p[i].x, p[i].z) + (metProfiel ? ProfielOffset(profiel, s[i], lengte) : 0f);
                pos[i] = new Vector3(p[i].x, y, p[i].z);
            }

            var z = new Vector3[m];
            for (int i = 0; i < m; i++)
            {
                Vector3 d;
                if (i == 0) d = Horizontaal(pos[1] - pos[0]);
                else if (i == m - 1) d = Horizontaal(pos[m - 1] - pos[m - 2]);
                else d = Horizontaal(pos[i + 1] - pos[i]) + Horizontaal(pos[i] - pos[i - 1]);
                if (d.sqrMagnitude < 1e-6f) d = Horizontaal(pos[Mathf.Min(i + 1, m - 1)] - pos[Mathf.Max(i - 1, 0)]);
                if (d.sqrMagnitude < 1e-6f) d = Vector3.forward;
                z[i] = Vector3.Cross(Vector3.up, d.normalized);
            }

            return new Lijn { P = pos, Z = z, S = s };
        }

        static Vector3 Horizontaal(Vector3 v)
        {
            v.y = 0f;
            return v.sqrMagnitude > 1e-8f ? v.normalized : Vector3.zero;
        }

        public static void Interp(Lijn l, float s, out Vector3 p, out Vector3 z)
        {
            int n = l.P.Length;
            if (s <= l.S[0]) { p = l.P[0]; z = l.Z[0]; return; }
            if (s >= l.S[n - 1]) { p = l.P[n - 1]; z = l.Z[n - 1]; return; }
            for (int i = 0; i < n - 1; i++)
            {
                if (s <= l.S[i + 1])
                {
                    float seg = l.S[i + 1] - l.S[i];
                    float t = seg > 1e-5f ? (s - l.S[i]) / seg : 0f;
                    p = Vector3.Lerp(l.P[i], l.P[i + 1], t);
                    z = Vector3.Lerp(l.Z[i], l.Z[i + 1], t).normalized;
                    return;
                }
            }
            p = l.P[n - 1];
            z = l.Z[n - 1];
        }

        /// Deel van de lijn tussen booglengte `van` en `tot` (S blijft absoluut, zodat UV's en
        /// streeppatronen doorlopen). Null als er te weinig over is.
        static Lijn Knip(Lijn l, float van, float tot)
        {
            if (van <= 0.001f && tot >= l.Lengte - 0.001f)
                return l;
            if (tot - van < 0.5f)
                return null;

            var p = new List<Vector3>();
            var z = new List<Vector3>();
            var s = new List<float>();

            Interp(l, van, out var p0, out var z0);
            p.Add(p0); z.Add(z0); s.Add(van);
            for (int i = 0; i < l.P.Length; i++)
            {
                if (l.S[i] > van + 0.01f && l.S[i] < tot - 0.01f)
                {
                    p.Add(l.P[i]); z.Add(l.Z[i]); s.Add(l.S[i]);
                }
            }
            Interp(l, tot, out var p1, out var z1);
            p.Add(p1); z.Add(z1); s.Add(tot);

            return new Lijn { P = p.ToArray(), Z = z.ToArray(), S = s.ToArray() };
        }

        // ═══════ STROKEN ═══════

        static void Strook(MeshBouwer mb, Material m, Lijn l, float off, float w, float y, float tegel, Vector3 buiten)
        {
            float a = off - w * 0.5f, b = off + w * 0.5f;
            for (int i = 0; i < l.P.Length - 1; i++)
            {
                Vector3 p0 = l.P[i] + Vector3.up * y, p1 = l.P[i + 1] + Vector3.up * y;
                Vector3 a0 = p0 + l.Z[i] * a, b0 = p0 + l.Z[i] * b;
                Vector3 a1 = p1 + l.Z[i + 1] * a, b1 = p1 + l.Z[i + 1] * b;
                float v0 = l.S[i] / tegel, v1 = l.S[i + 1] / tegel;
                mb.Quad(m, a0, b0, b1, a1,
                    new Vector2(a / tegel, v0), new Vector2(b / tegel, v0), new Vector2(b / tegel, v1), new Vector2(a / tegel, v1),
                    buiten);
            }
        }

        /// Verticale rand op één zijwaartse positie (band langs de verharding, brugrand, keerwand).
        static void Rand(MeshBouwer mb, Material m, Lijn l, float off, float yBoven, float yOnder, float buitenZijde)
        {
            for (int i = 0; i < l.P.Length - 1; i++)
            {
                Vector3 t0 = l.P[i] + l.Z[i] * off + Vector3.up * yBoven, t1 = l.P[i + 1] + l.Z[i + 1] * off + Vector3.up * yBoven;
                Vector3 o0 = l.P[i] + l.Z[i] * off + Vector3.up * yOnder, o1 = l.P[i + 1] + l.Z[i + 1] * off + Vector3.up * yOnder;
                mb.Quad(m, t0, t1, o1, o0,
                    new Vector2(l.S[i] / 2f, yBoven / 2f), new Vector2(l.S[i + 1] / 2f, yBoven / 2f),
                    new Vector2(l.S[i + 1] / 2f, yOnder / 2f), new Vector2(l.S[i] / 2f, yOnder / 2f),
                    l.Z[i] * buitenZijde);
            }
        }

        static void Verhoogd(MeshBouwer mb, Material top, Material zij, Lijn l, float off, float w, float yTop, float yOnder, float tegelTop)
        {
            Strook(mb, top, l, off, w, yTop, tegelTop, Vector3.up);
            float a = off - w * 0.5f, b = off + w * 0.5f;
            Rand(mb, zij, l, a, yTop, yOnder, -1f);
            Rand(mb, zij, l, b, yTop, yOnder, 1f);

            int n = l.P.Length;
            Kap(mb, zij, l.P[0], l.Z[0], a, b, yTop, yOnder, -(l.P[1] - l.P[0]));
            Kap(mb, zij, l.P[n - 1], l.Z[n - 1], a, b, yTop, yOnder, l.P[n - 1] - l.P[n - 2]);
        }

        static void Kap(MeshBouwer mb, Material m, Vector3 p, Vector3 z, float a, float b, float yTop, float yOnder, Vector3 buiten)
        {
            mb.Quad(m, p + z * a + Vector3.up * yTop, p + z * b + Vector3.up * yTop, p + z * b + Vector3.up * yOnder, p + z * a + Vector3.up * yOnder,
                new Vector2(a / 2f, yTop / 2f), new Vector2(b / 2f, yTop / 2f), new Vector2(b / 2f, yOnder / 2f), new Vector2(a / 2f, yOnder / 2f),
                buiten);
        }

        // ═══════ BELIJNING ═══════

        static void Belijning(MeshBouwer mb, Lijn l, Laan a, Laan b)
        {
            float grens = a.Midden + a.Breedte * 0.5f;
            bool ra = IsRijbaan(a.Type), rb = IsRijbaan(b.Type);
            bool randA = ra || a.Type == LaneType.Vluchtstrook, randB = rb || b.Type == LaneType.Vluchtstrook;
            bool bermA = a.Type == LaneType.Berm || a.Type == LaneType.Middenberm;
            bool bermB = b.Type == LaneType.Berm || b.Type == LaneType.Middenberm;

            if (ra && rb)
                Gestippeld(mb, l, grens, 0.1f, 3f, 9f);                    // rijstrookscheiding / asstreep
            else if ((ra && b.Type == LaneType.Fietspad) || (rb && a.Type == LaneType.Fietspad))
                Gestippeld(mb, l, grens, 0.1f, 1f, 1f);                    // fietsstrook
            else if ((ra && b.Type == LaneType.Vluchtstrook) || (rb && a.Type == LaneType.Vluchtstrook))
                Streep(mb, l, grens, 0.2f, l.S[0], l.Lengte);              // doorgetrokken
            else if (randA && bermB)
                Streep(mb, l, grens - 0.35f, 0.15f, l.S[0], l.Lengte);     // kantstreep
            else if (randB && bermA)
                Streep(mb, l, grens + 0.35f, 0.15f, l.S[0], l.Lengte);
            else if ((ra && b.Type == LaneType.Tramrail) || (rb && a.Type == LaneType.Tramrail))
                Streep(mb, l, grens, 0.12f, l.S[0], l.Lengte);
        }

        static void Gestippeld(MeshBouwer mb, Lijn l, float off, float w, float streep, float gat)
        {
            float cyclus = streep + gat;
            float s = l.S[0], eind = l.Lengte;
            int veiligheid = 0;
            while (s < eind - 0.01f && veiligheid++ < 10000)
            {
                float fase = s - Mathf.Floor(s / cyclus) * cyclus;
                if (fase < streep)
                {
                    float s1 = Mathf.Min(eind, s + (streep - fase));
                    Streep(mb, l, off, w, s, s1);
                    s = s1 + 0.001f;
                }
                else
                {
                    s += cyclus - fase;
                }
            }
        }

        /// Verfstreep langs de lijn van booglengte s0 tot s1, die de bocht volgt.
        static void Streep(MeshBouwer mb, Lijn l, float off, float w, float s0, float s1)
        {
            if (s1 - s0 < 0.02f)
                return;
            var stops = new List<float> { s0 };
            for (int i = 0; i < l.S.Length; i++)
                if (l.S[i] > s0 + 0.01f && l.S[i] < s1 - 0.01f) stops.Add(l.S[i]);
            stops.Add(s1);

            float a = off - w * 0.5f, b = off + w * 0.5f;
            var mat = Materialen.Markering;
            for (int k = 0; k < stops.Count - 1; k++)
            {
                Interp(l, stops[k], out var p0, out var z0);
                Interp(l, stops[k + 1], out var p1, out var z1);
                Vector3 up = Vector3.up * VerfY;
                mb.Quad(mat, p0 + up + z0 * a, p0 + up + z0 * b, p1 + up + z1 * b, p1 + up + z1 * a,
                    Vector2.zero, Vector2.right, Vector2.one, Vector2.up, Vector3.up);
            }
        }

        static void Zebra(MeshBouwer mb, Lijn l, Laan[] lanes, float s0, float s1)
        {
            if (s0 < l.S[0] || s1 > l.Lengte || s1 <= s0)
                return;
            float hb = 0f;
            foreach (var laan in lanes) hb += laan.Breedte;
            hb *= 0.5f;

            for (float x = -hb + 0.5f; x < hb - 0.25f; x += 1f)
            {
                bool oversteekbaar = false;
                foreach (var laan in lanes)
                {
                    bool rijdbaar = IsRijbaan(laan.Type) || laan.Type == LaneType.Fietspad || laan.Type == LaneType.Tramrail;
                    if (rijdbaar && x - 0.25f >= laan.Midden - laan.Breedte * 0.5f && x + 0.25f <= laan.Midden + laan.Breedte * 0.5f)
                        oversteekbaar = true;
                }
                if (oversteekbaar)
                    Streep(mb, l, x, 0.5f, s0, s1);
            }
        }

        // ═══════ TRAM, BRUG, TUNNEL ═══════

        static void Bovenleiding(MeshBouwer mb, Lijn l, float midden, float halveTramBreedte)
        {
            float mastOff = midden + halveTramBreedte + 0.35f;
            for (int i = 0; i < l.P.Length - 1; i++)
            {
                Vector3 a = l.P[i] + l.Z[i] * midden + Vector3.up * BovenleidingHoogte;
                Vector3 b = l.P[i + 1] + l.Z[i + 1] * midden + Vector3.up * BovenleidingHoogte;
                Vector3 zz = l.Z[i] * 0.025f;
                mb.Quad(Materialen.Metaal, a - zz, a + zz, b + zz, b - zz, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, Vector3.down);
                mb.Quad(Materialen.Metaal, a - zz, a + zz, b + zz, b - zz, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, Vector3.up);
            }

            for (float s = l.S[0] + 10f; s < l.Lengte - 5f; s += 30f)
            {
                Interp(l, s, out var p, out var z);
                Vector3 voet = p + z * mastOff;
                Vector3 richting = Vector3.Cross(z, Vector3.up);
                mb.Blok(Materialen.Metaal, Materialen.Metaal, voet, richting, z, 0.22f, 0.22f, p.y + AsfaltY, p.y + BovenleidingHoogte + 0.5f, 1f);
                Vector3 arm = p + z * ((mastOff + midden) * 0.5f);
                mb.Blok(Materialen.Metaal, Materialen.Metaal, arm, richting, z, 0.08f, Mathf.Abs(mastOff - midden) + 0.3f,
                    p.y + BovenleidingHoogte + 0.1f, p.y + BovenleidingHoogte + 0.2f, 1f);
            }
        }

        static void Brug(MeshBouwer mb, Lijn vlak, Lijn basis, Lijn grond, float totaal)
        {
            float hb = totaal * 0.5f;
            Rand(mb, Materialen.Beton, vlak, -hb, AsfaltY, -1.1f, -1f);
            Rand(mb, Materialen.Beton, vlak, hb, AsfaltY, -1.1f, 1f);
            Strook(mb, Materialen.Beton, vlak, 0f, totaal, -1.1f, 2f, Vector3.down);
            Verhoogd(mb, Materialen.Beton, Materialen.Beton, vlak, -hb + 0.22f, 0.44f, AsfaltY + 1.05f, AsfaltY, 2f);
            Verhoogd(mb, Materialen.Beton, Materialen.Beton, vlak, hb - 0.22f, 0.44f, AsfaltY + 1.05f, AsfaltY, 2f);

            for (float s = 9f; s < basis.Lengte - 4f; s += 18f)
            {
                Interp(basis, s, out var dek, out var z);
                Interp(grond, s, out var maaiveld, out _);
                float hoogte = dek.y - maaiveld.y;
                if (hoogte < 2.5f) continue;
                Vector3 langs = Vector3.Cross(z, Vector3.up);
                mb.Blok(Materialen.Beton, Materialen.Beton, dek, langs, z, 1.3f, totaal * 0.55f, maaiveld.y - 0.6f, dek.y - 1.6f, 2f);
                mb.Blok(Materialen.Beton, Materialen.Beton, dek, langs, z, 1.8f, totaal * 0.85f, dek.y - 1.6f, dek.y - 1.1f, 2f);
            }
        }

        static void Tunnelbak(MeshBouwer mb, Lijn basis, Lijn grond, HoogteProfielData profiel, float totaal)
        {
            float hb = totaal * 0.5f;
            float L = basis.Lengte;
            float overgang = Mathf.Clamp(profiel.OvergangsLengte, 0.01f, L * 0.5f);
            var gatVoor = new List<Vector3>();
            var gatAchter = new List<Vector3>();

            for (int i = 0; i < basis.P.Length - 1; i++)
            {
                float sm = (basis.S[i] + basis.S[i + 1]) * 0.5f;
                bool open = sm < overgang || sm > L - overgang;
                if (!open) continue;

                for (int zijde = -1; zijde <= 1; zijde += 2)
                {
                    float off = zijde * (hb + 0.3f);
                    Vector3 w0 = basis.P[i] + basis.Z[i] * off, w1 = basis.P[i + 1] + basis.Z[i + 1] * off;
                    Vector3 g0 = grond.P[i] + grond.Z[i] * off, g1 = grond.P[i + 1] + grond.Z[i + 1] * off;
                    float top0 = g0.y + 0.6f, top1 = g1.y + 0.6f;
                    // Keerwand (binnenkant naar de weg toe) en dekrand erop.
                    mb.Quad(Materialen.Beton, new Vector3(w0.x, top0, w0.z), new Vector3(w1.x, top1, w1.z), new Vector3(w1.x, w1.y - 0.2f, w1.z), new Vector3(w0.x, w0.y - 0.2f, w0.z),
                        new Vector2(basis.S[i] / 2f, top0 / 2f), new Vector2(basis.S[i + 1] / 2f, top1 / 2f), new Vector2(basis.S[i + 1] / 2f, 0f), new Vector2(basis.S[i] / 2f, 0f),
                        -basis.Z[i] * zijde);
                    Vector3 b0 = basis.P[i] + basis.Z[i] * (off + zijde * 0.4f), b1 = basis.P[i + 1] + basis.Z[i + 1] * (off + zijde * 0.4f);
                    mb.Quad(Materialen.Beton, new Vector3(w0.x, top0, w0.z), new Vector3(w1.x, top1, w1.z), new Vector3(b1.x, top1, b1.z), new Vector3(b0.x, top0, b0.z),
                        Vector2.zero, Vector2.right, Vector2.one, Vector2.up, Vector3.up);
                    // Grasstrook over de rand van het terreingat.
                    Vector3 c0 = basis.P[i] + basis.Z[i] * (off + zijde * 3f), c1 = basis.P[i + 1] + basis.Z[i + 1] * (off + zijde * 3f);
                    mb.Quad(Materialen.Gras, new Vector3(b0.x, g0.y + 0.05f, b0.z), new Vector3(b1.x, g1.y + 0.05f, b1.z),
                        new Vector3(c1.x, g1.y + 0.05f, c1.z), new Vector3(c0.x, g0.y + 0.05f, c0.z),
                        new Vector2(b0.x, b0.z) / 6f, new Vector2(b1.x, b1.z) / 6f, new Vector2(c1.x, c1.z) / 6f, new Vector2(c0.x, c0.z) / 6f, Vector3.up);
                }

                if (basis.P[i].y < grond.P[i].y - 0.4f)
                    (sm < overgang ? gatVoor : gatAchter).Add(basis.P[i]);
            }

            // Elke tunnelbak apart, anders trekt de lijn een gat over het overdekte deel heen.
            if (gatVoor.Count > 0) TerreinGaten.Maak(gatVoor, hb + 0.5f);
            if (gatAchter.Count > 0) TerreinGaten.Maak(gatAchter, hb + 0.5f);

            Portaal(mb, basis, grond, overgang, hb, -1f);
            if (L - overgang > overgang + 0.01f)
                Portaal(mb, basis, grond, L - overgang, hb, 1f);
        }

        static void Portaal(MeshBouwer mb, Lijn basis, Lijn grond, float s, float hb, float bakZijde)
        {
            Interp(basis, s, out var weg, out var z);
            Interp(grond, s, out var maaiveld, out _);
            Vector3 langs = Vector3.Cross(z, Vector3.up);
            float onderLatei = Mathf.Max(weg.y + 4.6f, maaiveld.y + 0.2f);
            float boven = onderLatei + 1.1f;
            mb.Blok(Materialen.Beton, Materialen.Beton, weg + z * (hb + 0.7f), langs, z, 1.2f, 0.8f, weg.y - 0.3f, boven, 2f);
            mb.Blok(Materialen.Beton, Materialen.Beton, weg - z * (hb + 0.7f), langs, z, 1.2f, 0.8f, weg.y - 0.3f, boven, 2f);
            mb.Blok(Materialen.Beton, Materialen.Beton, weg, langs, z, 1.2f, hb * 2f + 2.2f, onderLatei, boven, 2f);
            mb.Quad(Materialen.DonkerTrim, weg - z * hb + Vector3.up * AsfaltY, weg + z * hb + Vector3.up * AsfaltY,
                weg + z * hb + Vector3.up * onderLatei, weg - z * hb + Vector3.up * onderLatei,
                Vector2.zero, Vector2.right, Vector2.one, Vector2.up, langs * bakZijde);
        }

        // ═══════ INRICHTING ═══════

        static void Inrichting(Transform ouder, Lijn l, Laan[] lanes, float sVan, float sTot, WegTypeId type, int seed)
        {
            if (sTot - sVan < 2f)
                return;
            var r = new System.Random(seed * 7919 + 13);
            var lantaarn = StraatMeubilair.Lantaarnpaal(out var lantaarnMat);
            float stoep = AsfaltY + StoepHoogte;

            foreach (var laan in lanes)
            {
                float zijde = laan.Midden >= 0f ? 1f : -1f;

                if (laan.Type == LaneType.Trottoir && laan.Breedte >= 1.8f)
                {
                    float boomOff = laan.Midden - zijde * (laan.Breedte * 0.5f - 0.6f);
                    float lampOff = laan.Midden - zijde * (laan.Breedte * 0.5f - 0.3f);
                    var bomen = new List<float>();
                    for (float s = sVan + (zijde > 0f ? 7.5f : 0f); s <= sTot; s += 15f)
                    {
                        bomen.Add(s);
                        Interp(l, s, out var p, out var z);
                        Boom(ouder, r, p + z * boomOff + Vector3.up * (stoep - 0.05f), r.NextDouble() < 0.6 ? BoomSoort.Plataan : BoomSoort.Linde, 0.85f);
                    }
                    for (float s = sVan + (zijde > 0f ? 15f : 2f); s <= sTot; s += 30f)
                    {
                        float sl = s;
                        foreach (float b in bomen)
                            if (Mathf.Abs(b - sl) < 2.5f) sl = b + 3f;
                        if (sl > sTot) break;
                        Interp(l, sl, out var p, out var z);
                        Plaats(ouder, "Lantaarnpaal", lantaarn, lantaarnMat, p + z * lampOff + Vector3.up * stoep, Quaternion.LookRotation(-z * zijde, Vector3.up), 1f);
                    }
                }
                else if (laan.Type == LaneType.Middenberm && laan.Breedte >= 3f && type != WegTypeId.Snelweg)
                {
                    for (float s = sVan + 4f; s <= sTot; s += 12f)
                    {
                        Interp(l, s, out var p, out var z);
                        Boom(ouder, r, p + z * laan.Midden + Vector3.up * (AsfaltY + BermHoogte - 0.05f), BoomSoort.Linde, 0.9f);
                    }
                }
                else if (laan.Type == LaneType.Berm && laan.Breedte >= 2.5f)
                {
                    for (float s = sVan + 6f; s <= sTot; s += 16f)
                    {
                        Interp(l, s, out var p, out var z);
                        Boom(ouder, r, p + z * laan.Midden + Vector3.up * (AsfaltY + BermHoogte - 0.05f), r.NextDouble() < 0.5 ? BoomSoort.Eik : BoomSoort.Linde, 0.9f);
                    }
                    for (float s = sVan + 14f; s <= sTot; s += 35f)
                    {
                        Interp(l, s, out var p, out var z);
                        Plaats(ouder, "Lantaarnpaal", lantaarn, lantaarnMat, p + z * laan.Midden + Vector3.up * (AsfaltY + BermHoogte), Quaternion.LookRotation(-z * zijde, Vector3.up), 1.2f);
                    }
                }
            }
        }

        static void Boom(Transform ouder, System.Random r, Vector3 positie, BoomSoort soort, float basisSchaal)
        {
            var mesh = BoomMeshes.Haal(soort, r.Next(BoomMeshes.Varianten));
            float schaal = basisSchaal * (0.85f + (float)r.NextDouble() * 0.25f);
            Plaats(ouder, "Straatboom", mesh, BoomMeshes.MaterialenVoor(soort), positie, Quaternion.Euler(0f, (float)r.NextDouble() * 360f, 0f), schaal);
        }

        static void Plaats(Transform ouder, string naam, Mesh mesh, Material[] materialen, Vector3 positie, Quaternion rotatie, float schaal)
        {
            var go = new GameObject(naam);
            go.transform.SetParent(ouder, false);
            go.transform.SetPositionAndRotation(positie, rotatie);
            go.transform.localScale = Vector3.one * schaal;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterials = materialen;
        }
    }

    /// Snijdt gaten in het (gekloonde) terrein, voor de open tunnelbakken.
    public static class TerreinGaten
    {
        public static void Maak(List<Vector3> middenlijn, float halveBreedte)
        {
            var t = Terrain.activeTerrain;
            if (t == null || !TerreinOpmaak.Gekloond || middenlijn.Count == 0)
                return;

            var data = t.terrainData;
            int res = data.holesResolution;
            Vector3 tp = t.transform.position, size = data.size;

            float minX = float.MaxValue, maxX = float.MinValue, minZ = float.MaxValue, maxZ = float.MinValue;
            foreach (var p in middenlijn)
            {
                minX = Mathf.Min(minX, p.x - halveBreedte); maxX = Mathf.Max(maxX, p.x + halveBreedte);
                minZ = Mathf.Min(minZ, p.z - halveBreedte); maxZ = Mathf.Max(maxZ, p.z + halveBreedte);
            }

            int x0 = Mathf.Clamp(Mathf.FloorToInt((minX - tp.x) / size.x * res), 0, res - 1);
            int x1 = Mathf.Clamp(Mathf.CeilToInt((maxX - tp.x) / size.x * res), 0, res - 1);
            int z0 = Mathf.Clamp(Mathf.FloorToInt((minZ - tp.z) / size.z * res), 0, res - 1);
            int z1 = Mathf.Clamp(Mathf.CeilToInt((maxZ - tp.z) / size.z * res), 0, res - 1);
            int w = x1 - x0 + 1, h = z1 - z0 + 1;
            if (w <= 0 || h <= 0)
                return;

            // Welke bool-waarde "vast terrein" betekent, lezen we af aan een hoek van de kaart waar
            // nooit een gat zit -- zo hangen we niet af van de conventie van de API.
            bool vast = data.GetHoles(0, 0, 1, 1)[0, 0];
            var gaten = data.GetHoles(x0, z0, w, h);
            bool gewijzigd = false;

            for (int j = 0; j < h; j++)
            {
                for (int i = 0; i < w; i++)
                {
                    float wx = tp.x + (x0 + i + 0.5f) / res * size.x;
                    float wz = tp.z + (z0 + j + 0.5f) / res * size.z;
                    if (AfstandTotLijn(middenlijn, wx, wz) < halveBreedte)
                    {
                        gaten[j, i] = !vast;
                        gewijzigd = true;
                    }
                }
            }

            if (gewijzigd)
                data.SetHoles(x0, z0, gaten);
        }

        static float AfstandTotLijn(List<Vector3> lijn, float x, float z)
        {
            var q = new Vector2(x, z);
            float best = float.MaxValue;
            if (lijn.Count == 1)
                return Vector2.Distance(q, new Vector2(lijn[0].x, lijn[0].z));
            for (int i = 0; i < lijn.Count - 1; i++)
            {
                var a = new Vector2(lijn[i].x, lijn[i].z);
                var b = new Vector2(lijn[i + 1].x, lijn[i + 1].z);
                var ab = b - a;
                float t = ab.sqrMagnitude > 1e-6f ? Mathf.Clamp01(Vector2.Dot(q - a, ab) / ab.sqrMagnitude) : 0f;
                best = Mathf.Min(best, Vector2.Distance(q, a + ab * t));
            }
            return best;
        }
    }
}
