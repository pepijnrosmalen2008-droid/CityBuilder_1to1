using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    /// Verzamelt geometrie per materiaal en bouwt er één Mesh met submeshes van. Elk vlak krijgt
    /// eigen vertices (scherpe randen, juiste normalen per vlak), en de windingsrichting wordt per
    /// vlak gecontroleerd tegen de opgegeven "buiten"-richting -- geen aannames over hoekvolgorde.
    public sealed class MeshBouwer
    {
        readonly List<Vector3> _verts = new List<Vector3>();
        readonly List<Vector2> _uvs = new List<Vector2>();
        readonly List<Material> _materialen = new List<Material>();
        readonly List<List<int>> _driehoeken = new List<List<int>>();

        public int AantalVertices => _verts.Count;

        List<int> Lijst(Material m)
        {
            int i = _materialen.IndexOf(m);
            if (i < 0)
            {
                _materialen.Add(m);
                _driehoeken.Add(new List<int>());
                i = _materialen.Count - 1;
            }
            return _driehoeken[i];
        }

        /// Vierhoek a-b-c-d (rondom, in willekeurige draairichting). De zichtbare kant wijst naar `buiten`.
        public void Quad(Material m, Vector3 a, Vector3 b, Vector3 c, Vector3 d,
            Vector2 ua, Vector2 ub, Vector2 uc, Vector2 ud, Vector3 buiten)
        {
            int i = _verts.Count;
            _verts.Add(a); _verts.Add(b); _verts.Add(c); _verts.Add(d);
            _uvs.Add(ua); _uvs.Add(ub); _uvs.Add(uc); _uvs.Add(ud);

            var t = Lijst(m);
            Vector3 n = Vector3.Cross(b - a, c - a);
            if (Vector3.Dot(n, buiten) >= 0f)
            {
                t.Add(i); t.Add(i + 1); t.Add(i + 2);
                t.Add(i); t.Add(i + 2); t.Add(i + 3);
            }
            else
            {
                t.Add(i); t.Add(i + 2); t.Add(i + 1);
                t.Add(i); t.Add(i + 3); t.Add(i + 2);
            }
        }

        public void Driehoek(Material m, Vector3 a, Vector3 b, Vector3 c, Vector2 ua, Vector2 ub, Vector2 uc, Vector3 buiten)
        {
            int i = _verts.Count;
            _verts.Add(a); _verts.Add(b); _verts.Add(c);
            _uvs.Add(ua); _uvs.Add(ub); _uvs.Add(uc);

            var t = Lijst(m);
            Vector3 n = Vector3.Cross(b - a, c - a);
            if (Vector3.Dot(n, buiten) >= 0f) { t.Add(i); t.Add(i + 1); t.Add(i + 2); }
            else { t.Add(i); t.Add(i + 2); t.Add(i + 1); }
        }

        /// Verticale muur van a naar b (op maaiveldhoogte y0) tot hoogte y1, UV in meters / tegel.
        public void Muur(Material m, Vector3 a, Vector3 b, float y0, float y1, Vector3 buiten, float uTegel, float vTegel, float uStart = 0f, float vStart = 0f)
        {
            float lengte = Vector3.Distance(new Vector3(a.x, 0f, a.z), new Vector3(b.x, 0f, b.z));
            float u1 = uStart + lengte / uTegel;
            float v0 = vStart, v1 = vStart + (y1 - y0) / vTegel;
            Quad(m,
                new Vector3(a.x, y0, a.z), new Vector3(b.x, y0, b.z), new Vector3(b.x, y1, b.z), new Vector3(a.x, y1, a.z),
                new Vector2(uStart, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(uStart, v1), buiten);
        }

        /// Georiënteerd blok: midden (x,z) op `centrum`, assen `asX`/`asZ` (eenheidsvectoren in het
        /// horizontale vlak), van hoogte y0 tot y1. UV's van wanden en top in meters / tegel.
        public void Blok(Material zijkant, Material top, Vector3 centrum, Vector3 asX, Vector3 asZ, float breedte, float diepte,
            float y0, float y1, float tegel = 2f, bool metBodem = false)
        {
            Vector3 hx = asX * (breedte * 0.5f), hz = asZ * (diepte * 0.5f);
            Vector3 c = new Vector3(centrum.x, 0f, centrum.z);
            Vector3 p00 = c - hx - hz, p10 = c + hx - hz, p11 = c + hx + hz, p01 = c - hx + hz;

            Muur(zijkant, p00, p10, y0, y1, -asZ, tegel, tegel);
            Muur(zijkant, p10, p11, y0, y1, asX, tegel, tegel);
            Muur(zijkant, p11, p01, y0, y1, asZ, tegel, tegel);
            Muur(zijkant, p01, p00, y0, y1, -asX, tegel, tegel);

            if (top != null)
                Vlak(top, p00, p10, p11, p01, y1, Vector3.up, tegel);
            if (metBodem)
                Vlak(top ?? zijkant, p00, p10, p11, p01, y0, Vector3.down, tegel);
        }

        /// Horizontaal vlak door vier (x,z)-hoeken op hoogte y, wereld-planaire UV's.
        public void Vlak(Material m, Vector3 a, Vector3 b, Vector3 c, Vector3 d, float y, Vector3 buiten, float tegel)
        {
            a.y = b.y = c.y = d.y = y;
            Quad(m, a, b, c, d,
                new Vector2(a.x, a.z) / tegel, new Vector2(b.x, b.z) / tegel, new Vector2(c.x, c.z) / tegel, new Vector2(d.x, d.z) / tegel,
                buiten);
        }

        /// Losse, al opgebouwde geometrie toevoegen (zachte normalen bij gedeelde vertices,
        /// bijvoorbeeld een boomkruin). De driehoeken moeten al goed om staan.
        public void Ruw(Material m, List<Vector3> verts, List<Vector2> uvs, List<int> tris)
        {
            int basis = _verts.Count;
            _verts.AddRange(verts);
            _uvs.AddRange(uvs);
            var t = Lijst(m);
            for (int i = 0; i < tris.Count; i++)
                t.Add(basis + tris[i]);
        }

        public Mesh Bouw(string naam, out Material[] materialen)
        {
            var mesh = new Mesh { name = naam };
            if (_verts.Count > 65000)
                mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(_verts);
            mesh.SetUVs(0, _uvs);
            mesh.subMeshCount = _materialen.Count;
            for (int i = 0; i < _driehoeken.Count; i++)
                mesh.SetTriangles(_driehoeken[i], i);
            mesh.RecalculateNormals();
            mesh.RecalculateTangents();
            mesh.RecalculateBounds();
            materialen = _materialen.ToArray();
            return mesh;
        }

        /// Maakt een GameObject met deze mesh, als kind van `ouder` (mag null zijn).
        public GameObject BouwObject(string naam, Transform ouder, Vector3 positie, bool schaduw = true)
        {
            var mesh = Bouw(naam, out var materialen);
            var go = new GameObject(naam);
            if (ouder != null)
                go.transform.SetParent(ouder, false);
            go.transform.position = positie;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = materialen;
            r.shadowCastingMode = schaduw ? ShadowCastingMode.On : ShadowCastingMode.Off;
            return go;
        }
    }
}
