using System.Collections.Generic;
using UnityEngine;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    public enum BoomSoort : byte
    {
        Eik,
        Linde,
        Berk,
        Den,
        Plataan,
    }

    /// Procedurele bomen op ware grootte (12-16 m). Submesh 0 = stam en takken (schors),
    /// submesh 1 = kruin (blad). Kruinen zijn vervormde bollen met gedeelde vertices (zachte
    /// belichting); de UV-v loopt van onder naar boven door de hele kruin, zodat de bladtextuur
    /// de onderkant donkerder maakt (zelfschaduw).
    public static class BoomMeshes
    {
        public const int Varianten = 2;
        public static readonly int AantalSoorten = System.Enum.GetValues(typeof(BoomSoort)).Length;

        static Mesh[] _meshes;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset() => _meshes = null;

        public static Mesh Haal(BoomSoort soort, int variant)
        {
            if (_meshes == null)
                _meshes = new Mesh[AantalSoorten * Varianten];
            int i = (int)soort * Varianten + Mathf.Clamp(variant, 0, Varianten - 1);
            if (_meshes[i] == null)
                _meshes[i] = Bouw(soort, variant);
            return _meshes[i];
        }

        public static Material[] MaterialenVoor(BoomSoort soort)
        {
            BladSoort blad = soort switch
            {
                BoomSoort.Linde => BladSoort.Linde,
                BoomSoort.Plataan => BladSoort.Linde,
                BoomSoort.Berk => BladSoort.Berk,
                BoomSoort.Den => BladSoort.Den,
                _ => BladSoort.Eik,
            };
            return new[] { Materialen.Schors(soort == BoomSoort.Berk), Materialen.Blad(blad) };
        }

        sealed class Opbouw
        {
            public readonly List<Vector3> V = new List<Vector3>();
            public readonly List<Vector2> U = new List<Vector2>();
            public readonly List<int> Stam = new List<int>();
            public readonly List<int> Kruin = new List<int>();
            public float KruinOnder, KruinBoven;
        }

        static Mesh Bouw(BoomSoort soort, int variant)
        {
            var o = new Opbouw();
            var r = new System.Random(1000 + (int)soort * 31 + variant * 7);
            float J(float bereik) => ((float)r.NextDouble() - 0.5f) * 2f * bereik;

            switch (soort)
            {
                case BoomSoort.Den:
                {
                    float hoogte = 15f + J(1.5f);
                    o.KruinOnder = 2.5f;
                    o.KruinBoven = hoogte + 0.5f;
                    Cilinder(o, o.Stam, Vector3.down * 0.3f, Vector3.up * (hoogte - 1f), 0.32f, 0.06f, 7, 2f, false);
                    int lagen = 6;
                    for (int i = 0; i < lagen; i++)
                    {
                        float t = (float)i / (lagen - 1);
                        float basis = Mathf.Lerp(2.5f, hoogte - 3.2f, t);
                        float straal = Mathf.Lerp(3.4f, 0.9f, t) * (1f + J(0.08f));
                        float top = basis + Mathf.Lerp(4.2f, 3.6f, t);
                        var c = new Vector3(J(0.15f), 0f, J(0.15f));
                        Cilinder(o, o.Kruin, c + Vector3.up * basis, c + Vector3.up * top, straal, 0.04f, 9, 0f, true);
                        Schijf(o, o.Kruin, c + Vector3.up * basis, straal, 9);
                    }
                    break;
                }

                case BoomSoort.Berk:
                {
                    float stamTop = 8f + J(1f);
                    o.KruinOnder = 4.5f;
                    o.KruinBoven = 14f;
                    Cilinder(o, o.Stam, Vector3.down * 0.3f, Vector3.up * stamTop, 0.2f, 0.08f, 7, 2f, false);
                    Tak(o, new Vector3(0f, 5.5f, 0f), new Vector3(1.4f + J(0.3f), 8.5f, J(0.6f)), 0.08f);
                    Tak(o, new Vector3(0f, 6.2f, 0f), new Vector3(-1.2f + J(0.3f), 9.2f, 0.8f + J(0.4f)), 0.07f);
                    Bol(o, new Vector3(0f, 9.5f, 0f), new Vector3(2.4f, 4f, 2.4f), 9, 7, 0.22f, r.Next(1000));
                    for (int i = 0; i < 4; i++)
                    {
                        float a = i * Mathf.PI * 0.5f + J(0.4f);
                        Bol(o, new Vector3(Mathf.Cos(a) * 1.7f, 8.5f + J(1.5f), Mathf.Sin(a) * 1.7f), new Vector3(1.6f, 2.4f, 1.6f), 7, 5, 0.25f, r.Next(1000));
                    }
                    break;
                }

                default:
                {
                    bool linde = soort == BoomSoort.Linde;
                    bool plataan = soort == BoomSoort.Plataan;
                    float stamTop = (linde ? 5.5f : plataan ? 4f : 4.5f) + J(0.5f);
                    float kruinMidden = (linde ? 10.5f : plataan ? 8.5f : 9f) + J(0.6f);
                    var straal = linde ? new Vector3(3.6f, 4.8f, 3.6f) : plataan ? new Vector3(4.2f, 3.4f, 4.2f) : new Vector3(4.6f, 3.8f, 4.6f);
                    straal *= 1f + J(0.08f);
                    o.KruinOnder = kruinMidden - straal.y - 1f;
                    o.KruinBoven = kruinMidden + straal.y + 1.5f;

                    Cilinder(o, o.Stam, Vector3.down * 0.3f, Vector3.up * stamTop, plataan ? 0.32f : 0.38f, 0.26f, 8, 2f, false);
                    int takken = 3 + r.Next(2);
                    for (int i = 0; i < takken; i++)
                    {
                        float a = i * Mathf.PI * 2f / takken + J(0.4f);
                        var van = Vector3.up * (stamTop - 0.3f - J(0.4f));
                        var naar = new Vector3(Mathf.Cos(a) * straal.x * 0.55f, kruinMidden - 0.5f + J(0.8f), Mathf.Sin(a) * straal.z * 0.55f);
                        Tak(o, van, naar, 0.17f);
                    }

                    Bol(o, new Vector3(0f, kruinMidden, 0f), straal, 10, 7, 0.18f, r.Next(1000));
                    int satellieten = 5;
                    for (int i = 0; i < satellieten; i++)
                    {
                        float a = i * Mathf.PI * 2f / satellieten + J(0.5f);
                        float afstand = straal.x * 0.62f;
                        var c = new Vector3(Mathf.Cos(a) * afstand, kruinMidden + J(straal.y * 0.45f), Mathf.Sin(a) * afstand);
                        float s = 2.4f + J(0.5f);
                        Bol(o, c, new Vector3(s, s * 0.85f, s), 8, 6, 0.25f, r.Next(1000));
                    }
                    break;
                }
            }

            var mesh = new Mesh { name = "Boom_" + soort + "_" + variant };
            mesh.SetVertices(o.V);
            mesh.SetUVs(0, o.U);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(o.Stam, 0);
            mesh.SetTriangles(o.Kruin, 1);
            mesh.RecalculateNormals();
            mesh.RecalculateTangents();
            mesh.RecalculateBounds();
            return mesh;
        }

        static void Tak(Opbouw o, Vector3 van, Vector3 naar, float straal)
        {
            Cilinder(o, o.Stam, van, naar, straal, straal * 0.45f, 5, 2f, false);
        }

        /// Afgeknotte kegel van a naar b. `kruinUv` = UV-v volgt de kruinhoogte (voor blad);
        /// anders loopt v in meters / vTegel langs de lengte (voor schors).
        static void Cilinder(Opbouw o, List<int> doel, Vector3 a, Vector3 b, float ra, float rb, int zijden, float vTegel, bool kruinUv)
        {
            Vector3 as3 = (b - a).normalized;
            Vector3 hulp = Mathf.Abs(as3.y) < 0.95f ? Vector3.up : Vector3.right;
            Vector3 e1 = Vector3.Cross(as3, hulp).normalized;
            Vector3 e2 = Vector3.Cross(as3, e1);
            float lengte = Vector3.Distance(a, b);
            int basis = o.V.Count;

            for (int ring = 0; ring < 2; ring++)
            {
                Vector3 c = ring == 0 ? a : b;
                float rr = ring == 0 ? ra : rb;
                for (int i = 0; i <= zijden; i++)
                {
                    float hoek = (float)i / zijden * Mathf.PI * 2f;
                    Vector3 p = c + (e1 * Mathf.Cos(hoek) + e2 * Mathf.Sin(hoek)) * rr;
                    o.V.Add(p);
                    float v = kruinUv ? KruinV(o, p.y) : (ring == 0 ? 0f : lengte / vTegel);
                    o.U.Add(new Vector2((float)i / zijden, v));
                }
            }

            for (int i = 0; i < zijden; i++)
            {
                int i0 = basis + i, i1 = basis + i + 1;
                int j0 = basis + zijden + 1 + i, j1 = basis + zijden + 1 + i + 1;
                VoegToe(o, doel, i0, i1, j1, a, as3);
                VoegToe(o, doel, i0, j1, j0, a, as3);
            }
        }

        /// Driehoek toevoegen met de zichtbare kant van de as af (cilinder) of van het midden af.
        static void VoegToe(Opbouw o, List<int> doel, int i0, int i1, int i2, Vector3 asPunt, Vector3 asRichting)
        {
            Vector3 p0 = o.V[i0], p1 = o.V[i1], p2 = o.V[i2];
            Vector3 n = Vector3.Cross(p1 - p0, p2 - p0);
            Vector3 m = (p0 + p1 + p2) / 3f;
            Vector3 opAs = asPunt + asRichting * Vector3.Dot(m - asPunt, asRichting);
            if (Vector3.Dot(n, m - opAs) >= 0f) { doel.Add(i0); doel.Add(i1); doel.Add(i2); }
            else { doel.Add(i0); doel.Add(i2); doel.Add(i1); }
        }

        static void VoegToeVanaf(Opbouw o, List<int> doel, int i0, int i1, int i2, Vector3 buiten)
        {
            Vector3 n = Vector3.Cross(o.V[i1] - o.V[i0], o.V[i2] - o.V[i0]);
            if (Vector3.Dot(n, buiten) >= 0f) { doel.Add(i0); doel.Add(i1); doel.Add(i2); }
            else { doel.Add(i0); doel.Add(i2); doel.Add(i1); }
        }

        static float KruinV(Opbouw o, float y) => Mathf.Clamp01(Mathf.InverseLerp(o.KruinOnder, o.KruinBoven, y));

        /// Onderkant van een kegellaag (naar beneden gericht), zodat je er vanaf laag niet in kijkt.
        static void Schijf(Opbouw o, List<int> doel, Vector3 c, float straal, int zijden)
        {
            int midden = o.V.Count;
            o.V.Add(c);
            o.U.Add(new Vector2(0.5f, KruinV(o, c.y)));
            for (int i = 0; i <= zijden; i++)
            {
                float hoek = (float)i / zijden * Mathf.PI * 2f;
                var p = c + new Vector3(Mathf.Cos(hoek), 0f, Mathf.Sin(hoek)) * straal;
                o.V.Add(p);
                o.U.Add(new Vector2((float)i / zijden, KruinV(o, p.y)));
            }
            for (int i = 0; i < zijden; i++)
                VoegToeVanaf(o, doel, midden, midden + 1 + i, midden + 2 + i, Vector3.down);
        }

        /// Vervormde ellipsoïde (UV-bol) voor een stuk kruin.
        static void Bol(Opbouw o, Vector3 c, Vector3 straal, int lengte, int breedte, float ruis, int seed)
        {
            int basis = o.V.Count;
            for (int j = 0; j <= breedte; j++)
            {
                float theta = (float)j / breedte * Mathf.PI;
                for (int i = 0; i <= lengte; i++)
                {
                    float phi = (float)i / lengte * Mathf.PI * 2f;
                    var richting = new Vector3(Mathf.Sin(theta) * Mathf.Cos(phi), Mathf.Cos(theta), Mathf.Sin(theta) * Mathf.Sin(phi));
                    float vervorming = 1f + ruis * (Mathf.PerlinNoise(richting.x * 1.7f + seed, richting.z * 1.7f + richting.y * 2.3f + seed * 0.37f) - 0.5f) * 2f;
                    var p = c + Vector3.Scale(richting, straal) * vervorming;
                    o.V.Add(p);
                    o.U.Add(new Vector2((float)i / lengte * 2f, KruinV(o, p.y)));
                }
            }

            int rij = lengte + 1;
            for (int j = 0; j < breedte; j++)
            {
                for (int i = 0; i < lengte; i++)
                {
                    int a = basis + j * rij + i, b = a + 1, d = a + rij, e = d + 1;
                    VoegToeVanaf(o, o.Kruin, a, b, e, ((o.V[a] + o.V[b] + o.V[e]) / 3f) - c);
                    VoegToeVanaf(o, o.Kruin, a, e, d, ((o.V[a] + o.V[e] + o.V[d]) / 3f) - c);
                }
            }
        }
    }

    /// Straatmeubilair dat vaak terugkomt: één gedeelde mesh per object.
    public static class StraatMeubilair
    {
        static Mesh _lantaarn;
        static Material[] _lantaarnMaterialen;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset()
        {
            _lantaarn = null;
            _lantaarnMaterialen = null;
        }

        /// Lichtmast van 6,5 m met uithouder en armatuur; armatuur wijst naar +Z.
        public static Mesh Lantaarnpaal(out Material[] materialen)
        {
            if (_lantaarn == null || _lantaarnMaterialen == null)
            {
                var mb = new MeshBouwer();
                mb.Blok(Materialen.Metaal, Materialen.Metaal, Vector3.zero, Vector3.right, Vector3.forward, 0.17f, 0.17f, -0.3f, 6.5f, 1f);
                mb.Blok(Materialen.Metaal, Materialen.Metaal, new Vector3(0f, 0f, 0.75f), Vector3.right, Vector3.forward, 0.1f, 1.5f, 6.32f, 6.42f, 1f);
                mb.Blok(Materialen.Metaal, Materialen.Lamp, new Vector3(0f, 0f, 1.45f), Vector3.right, Vector3.forward, 0.38f, 0.7f, 6.22f, 6.4f, 1f, true);
                _lantaarn = mb.Bouw("Lantaarnpaal", out _lantaarnMaterialen);
            }
            materialen = _lantaarnMaterialen;
            return _lantaarn;
        }
    }
}
