using UnityEngine;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Stad;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    /// Bouwt de geometrie van een gebouw uit GebouwData + de verdiepingen. Elke vorm heeft zijn
    /// eigen Nederlandse typologie: rijwoningen met kap, dakkapellen en voordeuren; flats met
    /// balkons en een trappenhuis op het dak; winkels met een pui, luifels en een lijst; een
    /// kantoortoren met lobby en luifel; een bedrijfshal met laaddeuren, lichtstraten en een
    /// kantoorkop. Lokaal assenstelsel: X langs de straat, Z naar de straat toe, y = 0 op maaiveld.
    public static class GebouwMeshBouwer
    {
        struct Frame
        {
            public Vector3 X, Z;
            public Vector3 P(float x, float y, float z) => X * x + Vector3.up * y + Z * z;
        }

        enum UvSoort { Travee, Pui, Metrisch }

        static readonly GevelStijl[] WoonStijlen =
        {
            GevelStijl.BaksteenRood, GevelStijl.BaksteenRood, GevelStijl.BaksteenBruin, GevelStijl.BaksteenBruin,
            GevelStijl.BaksteenGeel, GevelStijl.Stuc, GevelStijl.ModernDonker,
        };

        static readonly GevelStijl[] FlatStijlen =
        {
            GevelStijl.BaksteenRood, GevelStijl.BaksteenBruin, GevelStijl.BaksteenGeel, GevelStijl.Stuc,
            GevelStijl.ModernDonker, GevelStijl.BetonBand, GevelStijl.BetonBand,
        };

        static readonly GevelStijl[] WinkelStijlen =
        {
            GevelStijl.BaksteenRood, GevelStijl.BaksteenBruin, GevelStijl.BaksteenGeel, GevelStijl.Stuc,
        };

        static readonly GevelStijl[] KantoorStijlen =
        {
            GevelStijl.Vliesgevel, GevelStijl.Vliesgevel, GevelStijl.Vliesgevel, GevelStijl.BetonBand, GevelStijl.ModernDonker,
        };

        static readonly Color[] HalKleuren =
        {
            new Color(0.75f, 0.78f, 0.82f), new Color(0.50f, 0.60f, 0.72f), new Color(0.60f, 0.67f, 0.57f),
            new Color(0.82f, 0.79f, 0.72f), new Color(0.93f, 0.93f, 0.92f), new Color(0.45f, 0.47f, 0.50f),
        };

        static readonly Color[] DeurKleuren =
        {
            new Color(0.10f, 0.22f, 0.15f), new Color(0.10f, 0.14f, 0.30f), new Color(0.45f, 0.10f, 0.09f),
            new Color(0.09f, 0.09f, 0.10f), new Color(0.88f, 0.88f, 0.85f), new Color(0.30f, 0.20f, 0.12f),
        };

        static T Kies<T>(System.Random r, T[] lijst) => lijst[r.Next(lijst.Length)];

        static Frame MaakFrame(in GebouwData g)
        {
            var voor = new Vector3(g.Voor.x, 0f, g.Voor.y).normalized;
            return new Frame { Z = voor, X = Vector3.Cross(Vector3.up, voor) };
        }

        /// Laagste maaiveldpunt onder de footprint, zodat het gebouw nergens zweeft; de plint
        /// loopt een stuk de grond in om hellingen op te vangen.
        public static Vector3 Oorsprong(in GebouwData g)
        {
            var f = MaakFrame(g);
            var c = new Vector3(g.Centrum.x, 0f, g.Centrum.y);
            float hb = g.Breedte * 0.5f, hd = g.Diepte * 0.5f;
            float y = TerreinHoogte.Op(c.x, c.z);
            for (int sx = -1; sx <= 1; sx += 2)
            {
                for (int sz = -1; sz <= 1; sz += 2)
                {
                    var p = c + f.X * (hb * sx) + f.Z * (hd * sz);
                    y = Mathf.Min(y, TerreinHoogte.Op(p.x, p.z));
                }
            }
            return new Vector3(c.x, y, c.z);
        }

        public static float TotaleHoogte(VerdiepingBufferElement[] lagen)
        {
            float h = 0f;
            foreach (var l in lagen) h += l.Hoogte;
            return h;
        }

        public static GameObject BouwGebouw(in GebouwData g, VerdiepingBufferElement[] lagen, Transform ouder)
        {
            var f = MaakFrame(g);
            var mb = new MeshBouwer();
            var r = new System.Random((int)(g.Seed & 0x7fffffff));

            switch (g.Vorm)
            {
                case GebouwVorm.Rijwoningen: Rijwoningen(mb, f, g, lagen, r); break;
                case GebouwVorm.Appartementen: Appartementen(mb, f, g, lagen, r); break;
                case GebouwVorm.WinkelsMetWonen: WinkelsMetWonen(mb, f, g, lagen, r); break;
                case GebouwVorm.Kantoortoren: Kantoortoren(mb, f, g, lagen, r); break;
                default: Bedrijfshal(mb, f, g, lagen, r); break;
            }

            return mb.BouwObject("Gebouw", ouder, Oorsprong(g));
        }

        // ═══════ BOUWSTENEN ═══════

        static void Wand(MeshBouwer mb, Material m, Frame f, float xa, float za, float xb, float zb, float y0, float y1,
            Vector3 buiten, UvSoort soort, int laag = 0, float tegel = 6f)
        {
            Vector3 pa = f.P(xa, 0f, za), pb = f.P(xb, 0f, zb);
            float lengte = Mathf.Sqrt((xb - xa) * (xb - xa) + (zb - za) * (zb - za));
            float h = Mathf.Max(0.01f, y1 - y0);
            int traveeen = Mathf.Max(1, Mathf.RoundToInt(lengte / 3f));

            switch (soort)
            {
                case UvSoort.Travee:
                    mb.Muur(m, pa, pb, y0, y1, buiten, lengte / (traveeen * 0.5f), h / 0.5f, 0f, (laag % 2) * 0.5f);
                    break;
                case UvSoort.Pui:
                    mb.Muur(m, pa, pb, y0, y1, buiten, lengte / (traveeen * 0.5f), h, 0f, 0f);
                    break;
                default:
                    mb.Muur(m, pa, pb, y0, y1, buiten, tegel, tegel, 0f, y0 / tegel);
                    break;
            }
        }

        /// Vier gevels van een rechthoekig volume voor één verdieping.
        static void Rondom(MeshBouwer mb, Frame f, float b, float d, float y0, float y1,
            Material voor, Material achter, Material zij, UvSoort voorSoort, UvSoort zijSoort, int laag)
        {
            float hb = b * 0.5f, hd = d * 0.5f;
            Wand(mb, voor, f, -hb, hd, hb, hd, y0, y1, f.Z, voorSoort, laag);
            Wand(mb, achter, f, hb, -hd, -hb, -hd, y0, y1, -f.Z, voorSoort == UvSoort.Pui ? UvSoort.Travee : voorSoort, laag);
            Wand(mb, zij, f, hb, hd, hb, -hd, y0, y1, f.X, zijSoort, laag);
            Wand(mb, zij, f, -hb, -hd, -hb, hd, y0, y1, -f.X, zijSoort, laag);
        }

        static void Blok(MeshBouwer mb, Material zij, Material top, Frame f, float cx, float cz, float b, float d, float y0, float y1, float tegel = 2f)
        {
            mb.Blok(zij, top, f.P(cx, 0f, cz), f.X, f.Z, b, d, y0, y1, tegel);
        }

        /// Ring van vier balken langs de rand: dakrand, borstwering of lijst. `uit` = hoeveel de
        /// ring buiten de gevel steekt, `dikte` = totale breedte van de balk.
        static void Ring(MeshBouwer mb, Material m, Frame f, float b, float d, float y0, float y1, float uit, float dikte)
        {
            float hb = b * 0.5f + uit, hd = d * 0.5f + uit;
            float midden = dikte * 0.5f;
            Blok(mb, m, m, f, 0f, hd - midden, hb * 2f, dikte, y0, y1);
            Blok(mb, m, m, f, 0f, -hd + midden, hb * 2f, dikte, y0, y1);
            Blok(mb, m, m, f, hb - midden, 0f, dikte, hd * 2f - dikte * 2f, y0, y1);
            Blok(mb, m, m, f, -hb + midden, 0f, dikte, hd * 2f - dikte * 2f, y0, y1);
        }

        static void PlatDak(MeshBouwer mb, Frame f, float b, float d, float h, Material rand, float randHoogte, System.Random r, bool installaties)
        {
            const float dikte = 0.3f;
            Ring(mb, rand, f, b, d, h, h + randHoogte, 0.02f, dikte);
            float hb = b * 0.5f - dikte, hd = d * 0.5f - dikte;
            mb.Vlak(Materialen.Dakgrind, f.P(-hb, 0f, -hd), f.P(hb, 0f, -hd), f.P(hb, 0f, hd), f.P(-hb, 0f, hd), h + 0.03f, Vector3.up, 3f);

            if (!installaties)
                return;

            int aantal = 1 + r.Next(3);
            for (int i = 0; i < aantal; i++)
            {
                float w = 1.2f + (float)r.NextDouble() * 1.8f, dd = 1f + (float)r.NextDouble() * 1.2f;
                float cx = ((float)r.NextDouble() - 0.5f) * Mathf.Max(0f, b - w - 2f);
                float cz = ((float)r.NextDouble() - 0.5f) * Mathf.Max(0f, d - dd - 2f);
                Blok(mb, Materialen.Gegalvaniseerd, Materialen.Gegalvaniseerd, f, cx, cz, w, dd, h, h + 0.9f + (float)r.NextDouble() * 0.6f, 1f);
            }
        }

        static void Plint(MeshBouwer mb, Frame f, float b, float d)
        {
            Blok(mb, Materialen.DonkerTrim, null, f, 0f, 0f, b + 0.06f, d + 0.06f, -1.5f, 0.35f);
        }

        // ═══════ RIJWONINGEN ═══════

        static void Rijwoningen(MeshBouwer mb, Frame f, in GebouwData g, VerdiepingBufferElement[] lagen, System.Random r)
        {
            int n = Mathf.Max(1, g.Eenheden);
            float b = g.Breedte, d = g.Diepte, w = b / n;
            float h = TotaleHoogte(lagen);
            bool zelfdeStijl = r.NextDouble() < 0.7;
            var basisStijl = Kies(r, WoonStijlen);
            bool antraciet = r.NextDouble() < 0.4;
            bool plat = r.NextDouble() < 0.18;
            var pannen = Materialen.Dakpannen(antraciet);

            for (int i = 0; i < n; i++)
            {
                var stijl = zelfdeStijl ? basisStijl : Kies(r, WoonStijlen);
                var gevel = Materialen.Gevel(stijl);
                var blind = Materialen.Muurwerk(stijl);
                float x0 = -b * 0.5f + i * w, x1 = x0 + w;
                bool eerste = i == 0, laatste = i == n - 1;

                float y = 0f;
                for (int k = 0; k < lagen.Length; k++)
                {
                    float y1 = y + lagen[k].Hoogte;
                    Wand(mb, gevel, f, x0, d * 0.5f, x1, d * 0.5f, y, y1, f.Z, UvSoort.Travee, k);
                    Wand(mb, gevel, f, x1, -d * 0.5f, x0, -d * 0.5f, y, y1, -f.Z, UvSoort.Travee, k);
                    if (eerste) Wand(mb, blind, f, x0, -d * 0.5f, x0, d * 0.5f, y, y1, -f.X, UvSoort.Metrisch);
                    if (laatste) Wand(mb, blind, f, x1, d * 0.5f, x1, -d * 0.5f, y, y1, f.X, UvSoort.Metrisch);
                    y = y1;
                }

                // Voordeur met stoepje.
                float xd = x0 + w * 0.72f;
                int deurKleur = r.Next(DeurKleuren.Length);
                var deur = Materialen.Kleur("deur_" + deurKleur, DeurKleuren[deurKleur], 0.45f);
                mb.Quad(deur, f.P(xd - 0.5f, 0.2f, d * 0.5f + 0.03f), f.P(xd + 0.5f, 0.2f, d * 0.5f + 0.03f),
                    f.P(xd + 0.5f, 2.35f, d * 0.5f + 0.03f), f.P(xd - 0.5f, 2.35f, d * 0.5f + 0.03f),
                    Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z);
                Blok(mb, Materialen.Beton, Materialen.Beton, f, xd, d * 0.5f + 0.35f, 1.5f, 0.7f, -0.3f, 0.2f, 1f);

                if (plat)
                {
                    Ring(mb, blind, f, w, d, h, h + 0.5f, 0.02f, 0.3f);
                    mb.Vlak(Materialen.Dakgrind, f.P(x0, 0f, -d * 0.5f), f.P(x1, 0f, -d * 0.5f), f.P(x1, 0f, d * 0.5f), f.P(x0, 0f, d * 0.5f), h + 0.03f, Vector3.up, 3f);
                }
                else
                {
                    Zadeldak(mb, f, x0, x1, d, h, pannen, blind, eerste, laatste);
                    if (r.NextDouble() < 0.55 && w > 3.6f)
                        Dakkapel(mb, f, (x0 + x1) * 0.5f, Mathf.Min(2.4f, w - 1.2f), d, h, gevel);
                }
            }

            Plint(mb, f, b, d);
        }

        const float DakOverstek = 0.35f;
        const float DakHelling = 0.9f; // tan(~42 graden)

        static void Zadeldak(MeshBouwer mb, Frame f, float x0, float x1, float d, float h, Material pannen, Material kopgevel, bool eerste, bool laatste)
        {
            float o = DakOverstek;
            float goot = h - 0.15f;
            float zv = d * 0.5f + o;
            float stijging = zv * DakHelling;
            float nok = goot + stijging;
            float hellingLengte = Mathf.Sqrt(zv * zv + stijging * stijging);
            float xs0 = x0 - (eerste ? 0.15f : 0f), xs1 = x1 + (laatste ? 0.15f : 0f);

            // Dakvlakken voor en achter, met pannen-UV's in meters / 2.
            mb.Quad(pannen, f.P(xs0, goot, zv), f.P(xs1, goot, zv), f.P(xs1, nok, 0f), f.P(xs0, nok, 0f),
                new Vector2(xs0 / 2f, 0f), new Vector2(xs1 / 2f, 0f), new Vector2(xs1 / 2f, hellingLengte / 2f), new Vector2(xs0 / 2f, hellingLengte / 2f),
                f.Z + Vector3.up);
            mb.Quad(pannen, f.P(xs1, goot, -zv), f.P(xs0, goot, -zv), f.P(xs0, nok, 0f), f.P(xs1, nok, 0f),
                new Vector2(xs1 / 2f, 0f), new Vector2(xs0 / 2f, 0f), new Vector2(xs0 / 2f, hellingLengte / 2f), new Vector2(xs1 / 2f, hellingLengte / 2f),
                -f.Z + Vector3.up);

            // Overstek van onderen en een witte boeiboord langs de goot.
            float yMuur = goot + o * DakHelling;
            foreach (float teken in new[] { 1f, -1f })
            {
                mb.Quad(Materialen.DonkerTrim, f.P(xs0, goot, zv * teken), f.P(xs1, goot, zv * teken),
                    f.P(xs1, yMuur, d * 0.5f * teken), f.P(xs0, yMuur, d * 0.5f * teken),
                    Vector2.zero, Vector2.right, Vector2.one, Vector2.up, Vector3.down);
                mb.Quad(Materialen.Trim, f.P(xs0, goot - 0.25f, zv * teken), f.P(xs1, goot - 0.25f, zv * teken),
                    f.P(xs1, goot, zv * teken), f.P(xs0, goot, zv * teken),
                    Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z * teken);
            }

            // Kopgevels aan de uiteinden van de rij.
            if (eerste) Kopgevel(mb, f, x0, d, h, yMuur, nok, kopgevel, -f.X);
            if (laatste) Kopgevel(mb, f, x1, d, h, yMuur, nok, kopgevel, f.X);
        }

        static void Kopgevel(MeshBouwer mb, Frame f, float x, float d, float h, float yMuur, float nok, Material m, Vector3 buiten)
        {
            float hd = d * 0.5f;
            mb.Quad(m, f.P(x, h, -hd), f.P(x, h, hd), f.P(x, yMuur, hd), f.P(x, yMuur, -hd),
                new Vector2(-hd / 6f, h / 6f), new Vector2(hd / 6f, h / 6f), new Vector2(hd / 6f, yMuur / 6f), new Vector2(-hd / 6f, yMuur / 6f), buiten);
            mb.Driehoek(m, f.P(x, yMuur, -hd), f.P(x, yMuur, hd), f.P(x, nok, 0f),
                new Vector2(-hd / 6f, yMuur / 6f), new Vector2(hd / 6f, yMuur / 6f), new Vector2(0f, nok / 6f), buiten);
        }

        static void Dakkapel(MeshBouwer mb, Frame f, float xc, float breedte, float d, float h, Material gevel)
        {
            float o = DakOverstek;
            float goot = h - 0.15f;
            float zv = d * 0.5f + o;
            float stijging = zv * DakHelling;
            float nok = goot + stijging;

            float zVoor = d * 0.5f - 0.9f;
            float onder = goot + (zv - zVoor) / zv * stijging;
            float boven = onder + 1.55f;
            if (boven > nok - 0.4f)
                return;
            float zAchter = zv - (boven - goot) / stijging * zv;

            float xa = xc - breedte * 0.5f, xb = xc + breedte * 0.5f;

            // Voorkant met een raam uit de geveltextuur (een travee, raamzone van de eerste verdieping).
            mb.Quad(gevel, f.P(xa, onder, zVoor), f.P(xb, onder, zVoor), f.P(xb, boven, zVoor), f.P(xa, boven, zVoor),
                new Vector2(0.09f, 0.12f), new Vector2(0.41f, 0.12f), new Vector2(0.41f, 0.43f), new Vector2(0.09f, 0.43f), f.Z);

            var bekleding = Materialen.DonkerTrim;
            mb.Driehoek(bekleding, f.P(xa, onder, zVoor), f.P(xa, boven, zVoor), f.P(xa, boven, zAchter),
                Vector2.zero, Vector2.up, Vector2.one, -f.X);
            mb.Driehoek(bekleding, f.P(xb, onder, zVoor), f.P(xb, boven, zVoor), f.P(xb, boven, zAchter),
                Vector2.zero, Vector2.up, Vector2.one, f.X);
            mb.Quad(bekleding, f.P(xa - 0.1f, boven, zVoor + 0.15f), f.P(xb + 0.1f, boven, zVoor + 0.15f), f.P(xb + 0.1f, boven, zAchter), f.P(xa - 0.1f, boven, zAchter),
                Vector2.zero, Vector2.right, Vector2.one, Vector2.up, Vector3.up);
            mb.Quad(Materialen.Trim, f.P(xa - 0.1f, boven - 0.22f, zVoor + 0.15f), f.P(xb + 0.1f, boven - 0.22f, zVoor + 0.15f),
                f.P(xb + 0.1f, boven, zVoor + 0.15f), f.P(xa - 0.1f, boven, zVoor + 0.15f),
                Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z);
        }

        // ═══════ APPARTEMENTEN ═══════

        static void Appartementen(MeshBouwer mb, Frame f, in GebouwData g, VerdiepingBufferElement[] lagen, System.Random r)
        {
            float b = g.Breedte, d = g.Diepte;
            var stijl = Kies(r, FlatStijlen);
            var gevel = Materialen.Gevel(stijl);
            bool balkons = stijl != GevelStijl.BetonBand ? r.NextDouble() < 0.75 : r.NextDouble() < 0.3;
            var balustrade = r.NextDouble() < 0.5 ? Materialen.Glas : Materialen.Metaal;

            float y = 0f;
            int traveeen = Mathf.Max(1, Mathf.RoundToInt(b / 3f));
            float traveeBreedte = b / traveeen;
            for (int k = 0; k < lagen.Length; k++)
            {
                float y1 = y + lagen[k].Hoogte;
                Rondom(mb, f, b, d, y, y1, gevel, gevel, gevel, UvSoort.Travee, UvSoort.Travee, k);

                if (balkons && k >= 1)
                {
                    for (int j = (k % 2); j < traveeen; j += 2)
                    {
                        float xc = -b * 0.5f + (j + 0.5f) * traveeBreedte;
                        float zc = d * 0.5f + 0.75f;
                        Blok(mb, Materialen.Beton, Materialen.Beton, f, xc, zc, 2.7f, 1.5f, y - 0.18f, y, 1f);
                        Blok(mb, balustrade, balustrade, f, xc, d * 0.5f + 1.47f, 2.7f, 0.05f, y, y + 1.05f, 1f);
                        Blok(mb, balustrade, balustrade, f, xc - 1.33f, zc, 0.05f, 1.5f, y, y + 1.05f, 1f);
                        Blok(mb, balustrade, balustrade, f, xc + 1.33f, zc, 0.05f, 1.5f, y, y + 1.05f, 1f);
                    }
                }
                y = y1;
            }

            // Entree met luifel.
            mb.Quad(Materialen.Glas, f.P(-1.3f, 0.2f, d * 0.5f + 0.03f), f.P(1.3f, 0.2f, d * 0.5f + 0.03f),
                f.P(1.3f, 2.6f, d * 0.5f + 0.03f), f.P(-1.3f, 2.6f, d * 0.5f + 0.03f),
                Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z);
            Blok(mb, Materialen.Beton, Materialen.Beton, f, 0f, d * 0.5f + 0.8f, 3.4f, 1.6f, 2.75f, 3.0f, 1f);

            PlatDak(mb, f, b, d, y, Materialen.Trim, 0.6f, r, true);
            Blok(mb, Materialen.Muurwerk(stijl), Materialen.Dakgrind, f, b * 0.2f, -d * 0.15f, 3.5f, 4.5f, y, y + 2.8f, 6f);
            Plint(mb, f, b, d);
        }

        // ═══════ WINKELS MET WONEN ═══════

        static void WinkelsMetWonen(MeshBouwer mb, Frame f, in GebouwData g, VerdiepingBufferElement[] lagen, System.Random r)
        {
            float b = g.Breedte, d = g.Diepte;
            var stijl = Kies(r, WinkelStijlen);
            var gevel = Materialen.Gevel(stijl);
            var blind = Materialen.Muurwerk(stijl);
            int puiVariant = r.Next(6);
            var pui = Materialen.Winkelpui(puiVariant);

            float y = 0f;
            for (int k = 0; k < lagen.Length; k++)
            {
                float y1 = y + lagen[k].Hoogte;
                if (k == 0)
                    Rondom(mb, f, b, d, y, y1, pui, gevel, blind, UvSoort.Pui, UvSoort.Metrisch, 0);
                else
                    Rondom(mb, f, b, d, y, y1, gevel, gevel, blind, UvSoort.Travee, UvSoort.Metrisch, k - 1);

                if (k == 0)
                {
                    // Lijst tussen winkel en bovenwoningen.
                    Ring(mb, Materialen.Trim, f, b, d, y1, y1 + 0.25f, 0.15f, 0.4f);

                    if (r.NextDouble() < 0.6)
                    {
                        var doek = Materialen.Luifel(puiVariant + r.Next(2) * 3);
                        int traveeen = Mathf.Max(1, Mathf.RoundToInt(b / 3f));
                        float tw = b / traveeen;
                        for (int j = 0; j < traveeen; j++)
                        {
                            float xa = -b * 0.5f + j * tw + 0.15f, xb = xa + tw - 0.3f;
                            Luifel(mb, f, doek, xa, xb, d * 0.5f, 3.0f, 2.45f, 1.3f);
                        }
                    }
                }
                y = y1;
            }

            Ring(mb, Materialen.Trim, f, b, d, y, y + 0.35f, 0.2f, 0.5f);
            PlatDak(mb, f, b, d, y + 0.35f, blind, 0.5f, r, true);
            Plint(mb, f, b, d);
        }

        static void Luifel(MeshBouwer mb, Frame f, Material doek, float xa, float xb, float zGevel, float yBoven, float yOnder, float uit)
        {
            Vector3 a = f.P(xa, yBoven, zGevel), b = f.P(xb, yBoven, zGevel);
            Vector3 c = f.P(xb, yOnder, zGevel + uit), d = f.P(xa, yOnder, zGevel + uit);
            mb.Quad(doek, a, b, c, d, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z + Vector3.up);
            mb.Quad(doek, a, b, c, d, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, -f.Z - Vector3.up);
            Vector3 ca = f.P(xa, yOnder - 0.25f, zGevel + uit), cb = f.P(xb, yOnder - 0.25f, zGevel + uit);
            mb.Quad(doek, d, c, cb, ca, Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z);
        }

        // ═══════ KANTOORTOREN ═══════

        static void Kantoortoren(MeshBouwer mb, Frame f, in GebouwData g, VerdiepingBufferElement[] lagen, System.Random r)
        {
            float b = g.Breedte, d = g.Diepte;
            var stijl = Kies(r, KantoorStijlen);
            var gevel = Materialen.Gevel(stijl);
            var lobby = Materialen.Gevel(GevelStijl.Vliesgevel);

            float y = 0f;
            for (int k = 0; k < lagen.Length; k++)
            {
                float y1 = y + lagen[k].Hoogte;
                if (k == 0)
                    Rondom(mb, f, b, d, y, y1, lobby, lobby, lobby, UvSoort.Travee, UvSoort.Travee, 1);
                else
                    Rondom(mb, f, b, d, y, y1, gevel, gevel, gevel, UvSoort.Travee, UvSoort.Travee, k - 1);
                y = y1;
            }

            // Entreeluifel en een donkere band boven de lobby.
            float lobbyH = lagen.Length > 0 ? lagen[0].Hoogte : 4.8f;
            Blok(mb, Materialen.Metaal, Materialen.Metaal, f, 0f, d * 0.5f + 1.9f, Mathf.Min(8f, b * 0.5f), 3.8f, lobbyH - 0.6f, lobbyH - 0.3f, 1f);
            Ring(mb, Materialen.DonkerTrim, f, b, d, lobbyH - 0.15f, lobbyH + 0.15f, 0.05f, 0.2f);

            Ring(mb, Materialen.Gegalvaniseerd, f, b, d, y, y + 1.1f, 0.03f, 0.35f);
            float hb = b * 0.5f - 0.35f, hd = d * 0.5f - 0.35f;
            mb.Vlak(Materialen.Dakgrind, f.P(-hb, 0f, -hd), f.P(hb, 0f, -hd), f.P(hb, 0f, hd), f.P(-hb, 0f, hd), y + 0.03f, Vector3.up, 3f);
            Blok(mb, Materialen.Beton, Materialen.Beton, f, -b * 0.15f, 0f, 5f, 6f, y, y + 3.6f, 2f);
            int units = 2 + r.Next(3);
            for (int i = 0; i < units; i++)
            {
                float cx = b * 0.15f + ((float)r.NextDouble() - 0.5f) * b * 0.3f;
                float cz = ((float)r.NextDouble() - 0.5f) * (d - 6f);
                Blok(mb, Materialen.Gegalvaniseerd, Materialen.Gegalvaniseerd, f, cx, cz, 3f, 2f, y, y + 1.8f, 1f);
            }
            Plint(mb, f, b, d);
        }

        // ═══════ BEDRIJFSHAL ═══════

        static void Bedrijfshal(MeshBouwer mb, Frame f, in GebouwData g, VerdiepingBufferElement[] lagen, System.Random r)
        {
            float b = g.Breedte, d = g.Diepte;
            float h = lagen.Length > 0 ? lagen[0].Hoogte : 9f;
            var tint = Kies(r, HalKleuren);
            var wand = Materialen.Gevel(GevelStijl.Golfplaat, tint);

            Rondom(mb, f, b, d, 0f, h, wand, wand, wand, UvSoort.Metrisch, UvSoort.Metrisch, 0);

            // Dak: geribde staalplaat met lichtstraten.
            Ring(mb, Materialen.Gegalvaniseerd, f, b, d, h, h + 0.6f, 0.03f, 0.3f);
            float hb = b * 0.5f - 0.3f, hd = d * 0.5f - 0.3f;
            mb.Vlak(Materialen.Gevel(GevelStijl.Golfplaat, tint * 0.85f), f.P(-hb, 0f, -hd), f.P(hb, 0f, -hd), f.P(hb, 0f, hd), f.P(-hb, 0f, hd), h + 0.03f, Vector3.up, 6f);
            int straten = Mathf.Max(1, (int)(d / 10f));
            for (int i = 0; i < straten; i++)
            {
                float cz = -d * 0.5f + (i + 0.5f) * d / straten;
                Blok(mb, Materialen.Gegalvaniseerd, Materialen.Glas, f, 0f, cz, b * 0.7f, 1.6f, h, h + 0.45f, 1f);
            }

            // Laaddeuren met een luifel aan de voorkant.
            int deuren = Mathf.Max(1, (int)(b / 7f));
            for (int i = 0; i < deuren; i++)
            {
                float xc = -b * 0.5f + (i + 0.5f) * b / deuren;
                if (xc < -b * 0.5f + 10.5f && deuren > 1) continue; // ruimte voor de kantoorkop
                mb.Quad(Materialen.DonkerTrim, f.P(xc - 2f, 0.1f, d * 0.5f + 0.03f), f.P(xc + 2f, 0.1f, d * 0.5f + 0.03f),
                    f.P(xc + 2f, 4.6f, d * 0.5f + 0.03f), f.P(xc - 2f, 4.6f, d * 0.5f + 0.03f),
                    Vector2.zero, Vector2.right, Vector2.one, Vector2.up, f.Z);
                Blok(mb, Materialen.Metaal, Materialen.Metaal, f, xc, d * 0.5f + 0.8f, 5f, 1.6f, 4.9f, 5.1f, 1f);
            }

            // Kantoorkop van twee lagen voor de hal.
            var kopStijl = r.NextDouble() < 0.5 ? GevelStijl.ModernDonker : GevelStijl.BaksteenGeel;
            var kop = Materialen.Gevel(kopStijl);
            float kb = Mathf.Min(10f, b * 0.5f), kd = 6f;
            float kx = -b * 0.5f + kb * 0.5f, kz = d * 0.5f + kd * 0.5f;
            var kf = new Frame { X = f.X, Z = f.Z };
            float y = 0f;
            for (int k = 0; k < 2; k++)
            {
                float y1 = y + 3.3f;
                Wand(mb, kop, kf, kx - kb * 0.5f, kz + kd * 0.5f, kx + kb * 0.5f, kz + kd * 0.5f, y, y1, f.Z, UvSoort.Travee, k);
                Wand(mb, kop, kf, kx + kb * 0.5f, kz + kd * 0.5f, kx + kb * 0.5f, kz - kd * 0.5f, y, y1, f.X, UvSoort.Travee, k);
                Wand(mb, kop, kf, kx - kb * 0.5f, kz - kd * 0.5f, kx - kb * 0.5f, kz + kd * 0.5f, y, y1, -f.X, UvSoort.Travee, k);
                y = y1;
            }
            mb.Vlak(Materialen.Dakgrind, f.P(kx - kb * 0.5f, 0f, kz - kd * 0.5f), f.P(kx + kb * 0.5f, 0f, kz - kd * 0.5f),
                f.P(kx + kb * 0.5f, 0f, kz + kd * 0.5f), f.P(kx - kb * 0.5f, 0f, kz + kd * 0.5f), y, Vector3.up, 3f);
            Blok(mb, Materialen.Trim, Materialen.Trim, f, kx, kz + kd * 0.5f - 0.15f, kb + 0.1f, 0.3f, y, y + 0.4f, 2f);

            Plint(mb, f, b, d);
            Blok(mb, Materialen.DonkerTrim, null, f, kx, kz, kb + 0.06f, kd + 0.06f, -1.5f, 0.35f);
        }

        // ═══════ BOUWPLAATS ═══════

        /// Betonnen casco tot de huidige verdieping met steigerwerk eromheen, en bij hogere
        /// gebouwen een torenkraan met draaiende giek (`kraanGiek`, null als er geen kraan is).
        public static GameObject BouwBouwplaats(in GebouwData g, VerdiepingBufferElement[] lagen, int klaar, Transform ouder, out Transform kraanGiek)
        {
            kraanGiek = null;
            var f = MaakFrame(g);
            var mb = new MeshBouwer();
            float b = g.Breedte, d = g.Diepte;

            float h = 0f;
            for (int k = 0; k < Mathf.Min(klaar, lagen.Length); k++)
                h += lagen[k].Hoogte;
            float eindHoogte = TotaleHoogte(lagen);

            // Bouwhek rondom.
            Ring(mb, Materialen.Steiger, f, b + 6f, d + 6f, 0f, 2f, 0f, 0.05f);

            if (h > 0.1f)
            {
                Blok(mb, Materialen.Bouwbeton, Materialen.Bouwbeton, f, 0f, 0f, b, d, -1f, h, 2f);
                Ring(mb, Materialen.Steiger, f, b + 1.6f, d + 1.6f, 0f, h + 1f, 0f, 0.05f);
            }
            else
            {
                // Bouwput.
                Blok(mb, Materialen.Bouwbeton, Materialen.Bouwbeton, f, 0f, 0f, b, d, -1f, 0.15f, 2f);
            }

            var oorsprong = Oorsprong(g);
            var go = mb.BouwObject("Bouwplaats", ouder, oorsprong);

            if (eindHoogte > 11f)
            {
                float mastHoogte = eindHoogte + 9f;
                float mx = b * 0.5f + 3.5f, mz = d * 0.2f;

                var kraan = new MeshBouwer();
                Blok(kraan, Materialen.KraanGeel, Materialen.KraanGeel, f, mx, mz, 1.6f, 1.6f, -0.5f, mastHoogte, 1f);
                Blok(kraan, Materialen.Beton, Materialen.Beton, f, mx, mz, 4f, 4f, -0.5f, 0.6f, 1f);
                var mast = kraan.BouwObject("Kraanmast", go.transform, oorsprong);

                var giek = new MeshBouwer();
                var gf = new Frame { X = Vector3.right, Z = Vector3.forward };
                Blok(giek, Materialen.KraanGeel, Materialen.KraanGeel, gf, 14f, 0f, 30f, 1.2f, 0f, 1.3f, 1f);
                Blok(giek, Materialen.KraanGeel, Materialen.KraanGeel, gf, -5f, 0f, 10f, 1.4f, 0f, 1.1f, 1f);
                Blok(giek, Materialen.Beton, Materialen.Beton, gf, -8.5f, 0f, 2.5f, 2.2f, -1.6f, 0.4f, 1f);
                Blok(giek, Materialen.Glas, Materialen.KraanGeel, gf, 1.6f, 1.4f, 2f, 1.8f, -2.2f, -0.2f, 1f);
                Blok(giek, Materialen.KraanGeel, Materialen.KraanGeel, gf, 0f, 0f, 1.2f, 1.2f, 1.3f, 5f, 1f);
                Blok(giek, Materialen.Metaal, Materialen.Metaal, gf, 20f, 0f, 0.06f, 0.06f, -(mastHoogte - h - 4f), 0f, 1f);
                var giekGo = giek.BouwObject("Kraangiek", go.transform, oorsprong + f.P(mx, mastHoogte, mz));
                kraanGiek = giekGo.transform;
                kraanGiek.rotation = Quaternion.LookRotation(f.Z, Vector3.up) * Quaternion.Euler(0f, -90f, 0f);
                _ = mast;
            }

            return go;
        }
    }
}
