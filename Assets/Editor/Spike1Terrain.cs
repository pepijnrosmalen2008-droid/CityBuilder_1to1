using UnityEditor;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// Step 3: ~500x500m Unity Terrain with modest, seeded height variation.
    /// City-builder relief should be gentle (this is not a mountain scene), hence the
    /// small height multiplier at the end of Generate().
    public static class Spike1Terrain
    {
        const string kTerrainDataPath = "Assets/Prototype/Spike1_TerrainData.asset";
        const int kResolution = 513; // must be 2^n + 1
        const float kSize = 500f;
        const float kMaxHeight = 25f;
        const float kReliefScale = 0.12f; // keeps actual relief within a few meters

        [MenuItem("CityBuilder/Spike1/1 - Generate Terrain")]
        public static GameObject Generate()
        {
            TerrainData data = AssetDatabase.LoadAssetAtPath<TerrainData>(kTerrainDataPath);
            if (data == null)
            {
                data = new TerrainData();
                AssetDatabase.CreateAsset(data, kTerrainDataPath);
            }

            data.heightmapResolution = kResolution;
            data.size = new Vector3(kSize, kMaxHeight, kSize);

            int res = data.heightmapResolution;
            float[,] heights = new float[res, res];
            const float seed = 1000f; // fixed seed so re-running this menu item is reproducible

            for (int y = 0; y < res; y++)
            {
                for (int x = 0; x < res; x++)
                {
                    float nx = (float)x / res;
                    float ny = (float)y / res;
                    float h = Mathf.PerlinNoise(nx * 4f + seed, ny * 4f + seed) * 0.6f
                            + Mathf.PerlinNoise(nx * 12f + seed, ny * 12f + seed) * 0.25f
                            + Mathf.PerlinNoise(nx * 30f + seed, ny * 30f + seed) * 0.15f;
                    heights[y, x] = h * kReliefScale;
                }
            }
            data.SetHeights(0, 0, heights);

            GameObject terrainGO = GameObject.Find("Spike1_Terrain");
            if (terrainGO == null)
                terrainGO = Terrain.CreateTerrainGameObject(data);

            terrainGO.name = "Spike1_Terrain";
            terrainGO.transform.position = new Vector3(-kSize / 2f, 0f, -kSize / 2f);
            GameObjectUtility.SetStaticEditorFlags(terrainGO, StaticEditorFlags.ContributeGI
                | StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);

            var terrain = terrainGO.GetComponent<Terrain>();
            terrain.terrainData = data;
            var col = terrainGO.GetComponent<TerrainCollider>();
            if (col != null) col.terrainData = data;

            EditorUtility.SetDirty(data);
            AssetDatabase.SaveAssets();
            Debug.Log("[Spike1] Terrain generated: 500x500m, seeded Perlin heightfield, gentle relief.");
            return terrainGO;
        }
    }
}
