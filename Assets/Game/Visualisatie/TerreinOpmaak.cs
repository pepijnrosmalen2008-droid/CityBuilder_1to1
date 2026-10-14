using UnityEngine;
using CityBuilder.Game.Visualisatie.Procedureel;

namespace CityBuilder.Game.Visualisatie
{
    /// Geeft het terrein bij het starten een speelkopie van zijn TerrainData met vier PBR-lagen
    /// (gazon, weide, bosgrond, zand) in natuurlijke vlekken. Op een kopie, omdat het spel er
    /// later gaten in snijdt (tunnelbakken) en het terrein-asset in de editor ongemoeid moet
    /// blijven -- na het stoppen staat alles weer zoals het was.
    [DefaultExecutionOrder(-500)]
    public class TerreinOpmaak : MonoBehaviour
    {
        public static bool Gekloond { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset() => Gekloond = false;

        void Awake()
        {
            var terrain = GetComponent<Terrain>();
            if (terrain == null || terrain.terrainData == null)
                return;

            var kloon = Instantiate(terrain.terrainData);
            kloon.name = terrain.terrainData.name + " (speelkopie)";
            terrain.terrainData = kloon;
            var collider = GetComponent<TerrainCollider>();
            if (collider != null)
                collider.terrainData = kloon;
            Gekloond = true;

            kloon.terrainLayers = new[]
            {
                Laag(ProcTex.Gras(false), 6f, 0.04f),
                Laag(ProcTex.Gras(true), 9f, 0.04f),
                Laag(ProcTex.Bosgrond(), 5f, 0.08f),
                Laag(ProcTex.Zand(), 7f, 0.08f),
            };
            kloon.alphamapResolution = 1024;
            Schilder(terrain, kloon);

            terrain.basemapDistance = 2500f;
            terrain.heightmapPixelError = 3f;
            terrain.drawInstanced = true;
        }

        static TerrainLayer Laag(PbrSet set, float tegel, float gladheid)
        {
            return new TerrainLayer
            {
                diffuseTexture = set.Albedo,
                normalMapTexture = set.Normaal,
                normalScale = 1f,
                tileSize = new Vector2(tegel, tegel),
                smoothness = gladheid,
                metallic = 0f,
            };
        }

        static void Schilder(Terrain terrain, TerrainData data)
        {
            int res = data.alphamapResolution;
            int hr = data.heightmapResolution;
            float[,] hoogtes = data.GetHeights(0, 0, hr, hr);

            float max = 0.0001f;
            for (int y = 0; y < hr; y++)
                for (int x = 0; x < hr; x++)
                    max = Mathf.Max(max, hoogtes[y, x]);

            Vector3 tp = terrain.transform.position, size = data.size;
            var splat = new float[res, res, 4];

            for (int y = 0; y < res; y++)
            {
                for (int x = 0; x < res; x++)
                {
                    float u = (x + 0.5f) / res, v = (y + 0.5f) / res;
                    float wx = tp.x + u * size.x, wz = tp.z + v * size.z;
                    float hn = hoogtes[Mathf.Clamp((int)(v * (hr - 1)), 0, hr - 1), Mathf.Clamp((int)(u * (hr - 1)), 0, hr - 1)] / max;
                    float weideRuis = TerreinRuis.Weide(wx, wz);

                    float zand = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.1f, 0.2f, hn + (weideRuis - 0.5f) * 0.1f));
                    float bos = TerreinRuis.BosAandeel(wx, wz) * (1f - zand);
                    float weide = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.45f, 0.65f, weideRuis)) * (1f - zand) * (1f - bos);
                    float gras = Mathf.Max(0f, 1f - zand - bos - weide);
                    float som = gras + weide + bos + zand;
                    if (som < 1e-4f) { gras = 1f; som = 1f; }

                    splat[y, x, 0] = gras / som;
                    splat[y, x, 1] = weide / som;
                    splat[y, x, 2] = bos / som;
                    splat[y, x, 3] = zand / som;
                }
            }

            data.SetAlphamaps(0, 0, splat);
        }
    }
}
