using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using CityBuilder.Game.Visualisatie.Procedureel;

namespace CityBuilder.Game.Visualisatie
{
    /// Bossen en losse bomen in het landschap. Duizenden bomen zonder GameObjects: per tegel
    /// van 250 m en per boommodel worden ze met GPU-instancing getekend, zodat camera en
    /// schaduwcascades hele tegels kunnen wegcullen. Wegen en gebouwen kappen de bomen waar
    /// ze komen te liggen (WisLangsLijn / WisInRechthoek).
    public class BoomBeheer : MonoBehaviour
    {
        public static BoomBeheer Instance { get; private set; }

        [Tooltip("Afstand tussen kandidaat-plekken in meters; kleiner = dichtere bossen.")]
        public float plantAfstand = 5f;
        public bool schaduw = true;

        struct Boom
        {
            public Vector3 Positie;
            public float Schaal, Hoek;
            public int Model;
            public bool Gekapt;
        }

        sealed class Groep
        {
            public int Model;
            public Bounds Bounds;
            public readonly List<Matrix4x4> Lijst = new List<Matrix4x4>();
            public readonly List<Matrix4x4[]> Brokken = new List<Matrix4x4[]>();
        }

        const float Cel = 25f;
        const float Tegel = 250f;
        const int MaxPerAanroep = 500;

        readonly List<Boom> _bomen = new List<Boom>();
        List<int>[] _cellen;
        int _n;
        Vector2 _min;
        bool _vuil;
        readonly Dictionary<long, Groep> _groepen = new Dictionary<long, Groep>();
        Mesh[] _meshes;
        Material[][] _materialen;

        void OnEnable() => Instance = this;

        void OnDisable()
        {
            if (Instance == this) Instance = null;
        }

        void Start()
        {
            int modellen = BoomMeshes.AantalSoorten * BoomMeshes.Varianten;
            _meshes = new Mesh[modellen];
            _materialen = new Material[modellen][];
            for (int s = 0; s < BoomMeshes.AantalSoorten; s++)
            {
                for (int v = 0; v < BoomMeshes.Varianten; v++)
                {
                    int i = s * BoomMeshes.Varianten + v;
                    _meshes[i] = BoomMeshes.Haal((BoomSoort)s, v);
                    _materialen[i] = BoomMeshes.MaterialenVoor((BoomSoort)s);
                }
            }
            Plant();
        }

        void Plant()
        {
            var t = Terrain.activeTerrain;
            if (t == null)
                return;

            Vector3 tp = t.transform.position, size = t.terrainData.size;
            _min = new Vector2(tp.x, tp.z);
            _n = Mathf.CeilToInt(Mathf.Max(size.x, size.z) / Cel) + 1;
            _cellen = new List<int>[_n * _n];

            var r = new System.Random(4242);
            float stap = Mathf.Max(2f, plantAfstand);
            for (float z = tp.z + 4f; z < tp.z + size.z - 4f; z += stap)
            {
                for (float x = tp.x + 4f; x < tp.x + size.x - 4f; x += stap)
                {
                    float px = x + ((float)r.NextDouble() - 0.5f) * stap * 0.9f;
                    float pz = z + ((float)r.NextDouble() - 0.5f) * stap * 0.9f;
                    float bos = TerreinRuis.BosAandeel(px, pz);
                    float kans = bos * 0.65f + 0.005f;
                    if (r.NextDouble() > kans)
                        continue;

                    BoomSoort soort;
                    double keuze = r.NextDouble();
                    if (bos > 0.4f)
                        soort = TerreinRuis.Soort(px, pz) > 0.6f ? BoomSoort.Den : keuze < 0.15 ? BoomSoort.Berk : keuze < 0.65 ? BoomSoort.Eik : BoomSoort.Linde;
                    else
                        soort = keuze < 0.55 ? BoomSoort.Eik : keuze < 0.85 ? BoomSoort.Linde : BoomSoort.Berk;

                    float y = t.SampleHeight(new Vector3(px, 0f, pz)) + tp.y - 0.2f;
                    var boom = new Boom
                    {
                        Positie = new Vector3(px, y, pz),
                        Schaal = 0.75f + (float)r.NextDouble() * 0.45f,
                        Hoek = (float)r.NextDouble() * 360f,
                        Model = (int)soort * BoomMeshes.Varianten + r.Next(BoomMeshes.Varianten),
                    };
                    int index = _bomen.Count;
                    _bomen.Add(boom);
                    int cel = CelIndex(px, pz);
                    if (cel >= 0)
                    {
                        if (_cellen[cel] == null) _cellen[cel] = new List<int>();
                        _cellen[cel].Add(index);
                    }
                }
            }
            _vuil = true;
        }

        int CelIndex(float x, float z)
        {
            int cx = Mathf.FloorToInt((x - _min.x) / Cel), cz = Mathf.FloorToInt((z - _min.y) / Cel);
            if (cx < 0 || cz < 0 || cx >= _n || cz >= _n) return -1;
            return cz * _n + cx;
        }

        void BezoekCellen(float minX, float minZ, float maxX, float maxZ, System.Action<int> actie)
        {
            if (_cellen == null) return;
            int x0 = Mathf.Max(0, Mathf.FloorToInt((minX - _min.x) / Cel)), x1 = Mathf.Min(_n - 1, Mathf.FloorToInt((maxX - _min.x) / Cel));
            int z0 = Mathf.Max(0, Mathf.FloorToInt((minZ - _min.y) / Cel)), z1 = Mathf.Min(_n - 1, Mathf.FloorToInt((maxZ - _min.y) / Cel));
            for (int cz = z0; cz <= z1; cz++)
            {
                for (int cx = x0; cx <= x1; cx++)
                {
                    var lijst = _cellen[cz * _n + cx];
                    if (lijst == null) continue;
                    foreach (int i in lijst) actie(i);
                }
            }
        }

        public void WisLangsLijn(IList<Vector3> punten, float halveBreedte)
        {
            if (_cellen == null || punten == null || punten.Count == 0)
                return;

            for (int k = 0; k < Mathf.Max(1, punten.Count - 1); k++)
            {
                Vector2 a = new Vector2(punten[k].x, punten[k].z);
                Vector2 b = punten.Count > 1 ? new Vector2(punten[k + 1].x, punten[k + 1].z) : a;
                BezoekCellen(Mathf.Min(a.x, b.x) - halveBreedte, Mathf.Min(a.y, b.y) - halveBreedte,
                    Mathf.Max(a.x, b.x) + halveBreedte, Mathf.Max(a.y, b.y) + halveBreedte, i =>
                    {
                        var boom = _bomen[i];
                        if (boom.Gekapt) return;
                        var q = new Vector2(boom.Positie.x, boom.Positie.z);
                        var ab = b - a;
                        float t = ab.sqrMagnitude > 1e-6f ? Mathf.Clamp01(Vector2.Dot(q - a, ab) / ab.sqrMagnitude) : 0f;
                        if (Vector2.Distance(q, a + ab * t) < halveBreedte)
                        {
                            boom.Gekapt = true;
                            _bomen[i] = boom;
                            _vuil = true;
                        }
                    });
            }
        }

        public void WisInRechthoek(Vector2 centrum, Vector2 asX, Vector2 asZ, float halfX, float halfZ)
        {
            if (_cellen == null)
                return;
            float straal = Mathf.Sqrt(halfX * halfX + halfZ * halfZ);
            BezoekCellen(centrum.x - straal, centrum.y - straal, centrum.x + straal, centrum.y + straal, i =>
            {
                var boom = _bomen[i];
                if (boom.Gekapt) return;
                var d = new Vector2(boom.Positie.x, boom.Positie.z) - centrum;
                if (Mathf.Abs(Vector2.Dot(d, asX)) < halfX && Mathf.Abs(Vector2.Dot(d, asZ)) < halfZ)
                {
                    boom.Gekapt = true;
                    _bomen[i] = boom;
                    _vuil = true;
                }
            });
        }

        void BouwGroepen()
        {
            _vuil = false;
            foreach (var g in _groepen.Values)
            {
                g.Lijst.Clear();
                g.Brokken.Clear();
            }

            foreach (var boom in _bomen)
            {
                if (boom.Gekapt) continue;
                int tx = Mathf.FloorToInt((boom.Positie.x - _min.x) / Tegel), tz = Mathf.FloorToInt((boom.Positie.z - _min.y) / Tegel);
                long sleutel = ((long)tz * 1000 + tx) * 64 + boom.Model;
                if (!_groepen.TryGetValue(sleutel, out var groep))
                {
                    groep = new Groep { Model = boom.Model };
                    var midden = new Vector3(_min.x + (tx + 0.5f) * Tegel, boom.Positie.y + 10f, _min.y + (tz + 0.5f) * Tegel);
                    groep.Bounds = new Bounds(midden, new Vector3(Tegel + 30f, 120f, Tegel + 30f));
                    _groepen[sleutel] = groep;
                }
                groep.Lijst.Add(Matrix4x4.TRS(boom.Positie, Quaternion.Euler(0f, boom.Hoek, 0f), Vector3.one * boom.Schaal));
            }

            foreach (var g in _groepen.Values)
            {
                for (int start = 0; start < g.Lijst.Count; start += MaxPerAanroep)
                {
                    int aantal = Mathf.Min(MaxPerAanroep, g.Lijst.Count - start);
                    var brok = new Matrix4x4[aantal];
                    g.Lijst.CopyTo(start, brok, 0, aantal);
                    g.Brokken.Add(brok);
                }
            }
        }

        void Update()
        {
            if (_meshes == null)
                return;
            if (_vuil)
                BouwGroepen();

            var schaduwModus = schaduw ? ShadowCastingMode.On : ShadowCastingMode.Off;
            foreach (var g in _groepen.Values)
            {
                if (g.Brokken.Count == 0) continue;
                var mesh = _meshes[g.Model];
                var mats = _materialen[g.Model];
                for (int sub = 0; sub < 2; sub++)
                {
                    var rp = new RenderParams(mats[sub])
                    {
                        worldBounds = g.Bounds,
                        shadowCastingMode = schaduwModus,
                        receiveShadows = true,
                    };
                    foreach (var brok in g.Brokken)
                        Graphics.RenderMeshInstanced(rp, mesh, sub, brok);
                }
            }
        }
    }
}
