using System.IO;
using UnityEditor;
using UnityEngine;

namespace CityBuilder.Game.EditorTools
{
    /// Eerste echte, permanente terrein (niet Spike 1's wegwerp-prototype in Assets/Prototype/).
    /// Op verzoek: nu nog effen placeholder-kleuren per grondtype (Gras/Zand) i.p.v. echte
    /// PBR-textures -- dat komt pas als aparte pas zodra de rest van de wereld visueel staat,
    /// zodat er in één keer over de hele kaart getextureerd kan worden. Reliëf is bewust subtiel:
    /// het Nederlandse zeeklimaat-uitgangspunt uit 05-wegennetwerk-ov-klimaat.md is overwegend
    /// vlak, geen bergachtig terrein.
    public static class GameTerreinGenerator
    {
        const string kFolder = "Assets/Game/Terrein";
        const string kTerrainDataPath = kFolder + "/GameTerrainData.asset";
        const string kGrasLayerPath = kFolder + "/Laag_Gras.terrainlayer";
        const string kZandLayerPath = kFolder + "/Laag_Zand.terrainlayer";
        const string kGrasTexturePath = kFolder + "/Textuur_Gras_Placeholder.png";
        const string kZandTexturePath = kFolder + "/Textuur_Zand_Placeholder.png";

        const int kResolution = 513;      // 2^n + 1
        const float kSize = 1000f;        // 1km x 1km, eerste echte kaart-foundation
        const float kMaxHeight = 20f;
        const float kReliefSchaal = 0.06f; // subtieler dan Spike 1 -- Nederlands zeeklimaat is overwegend vlak
        const float kZandDrempel = 0.18f;  // laagste ~18% van het hoogtebereik wordt zand (kustlijn/oeverachtig)

        static readonly Color kGrasKleur = new Color(0.30f, 0.55f, 0.22f);
        static readonly Color kZandKleur = new Color(0.87f, 0.78f, 0.52f);

        [MenuItem("CityBuilder/Game/1 - Genereer Terrein")]
        public static GameObject Genereer()
        {
            var grasLayer = MaakOfLaadLaag(kGrasLayerPath, kGrasTexturePath, kGrasKleur);
            var zandLayer = MaakOfLaadLaag(kZandLayerPath, kZandTexturePath, kZandKleur);

            TerrainData data = AssetDatabase.LoadAssetAtPath<TerrainData>(kTerrainDataPath);
            if (data == null)
            {
                data = new TerrainData();
                AssetDatabase.CreateAsset(data, kTerrainDataPath);
            }

            data.heightmapResolution = kResolution;
            data.size = new Vector3(kSize, kMaxHeight, kSize);
            data.terrainLayers = new[] { grasLayer, zandLayer };

            int res = data.heightmapResolution;
            var heights = new float[res, res];
            const float seed = 4000f; // vaste seed, reproduceerbaar

            for (int y = 0; y < res; y++)
            {
                for (int x = 0; x < res; x++)
                {
                    float nx = (float)x / res;
                    float ny = (float)y / res;
                    float h = Mathf.PerlinNoise(nx * 3f + seed, ny * 3f + seed) * 0.7f
                            + Mathf.PerlinNoise(nx * 10f + seed, ny * 10f + seed) * 0.3f;
                    heights[y, x] = h * kReliefSchaal;
                }
            }
            data.SetHeights(0, 0, heights);

            SchilderSplatmap(data, heights, res);

            GameObject terrainGO = GameObject.Find("GameTerrein");
            if (terrainGO == null)
                terrainGO = Terrain.CreateTerrainGameObject(data);
            terrainGO.name = "GameTerrein";
            terrainGO.transform.position = new Vector3(-kSize / 2f, 0f, -kSize / 2f);

            var terrain = terrainGO.GetComponent<Terrain>();
            terrain.terrainData = data;
            var col = terrainGO.GetComponent<TerrainCollider>();
            if (col != null) col.terrainData = data;

            EditorUtility.SetDirty(data);
            AssetDatabase.SaveAssets();
            Debug.Log("[GameTerrein] Terrein gegenereerd: 1000x1000m, subtiel reliëf, placeholder gras/zand-splat.");
            return terrainGO;
        }

        static void SchilderSplatmap(TerrainData data, float[,] heights, int heightRes)
        {
            int alphaW = data.alphamapWidth;
            int alphaH = data.alphamapHeight;
            var splat = new float[alphaH, alphaW, 2];

            for (int y = 0; y < alphaH; y++)
            {
                for (int x = 0; x < alphaW; x++)
                {
                    // Bemonster de dichtstbijzijnde heightmap-cel voor deze alphamap-cel.
                    int hx = Mathf.Clamp((int)((float)x / alphaW * heightRes), 0, heightRes - 1);
                    int hy = Mathf.Clamp((int)((float)y / alphaH * heightRes), 0, heightRes - 1);
                    float genormaliseerdeHoogte = heights[hy, hx] / kReliefSchaal; // 0-1 range

                    bool isZand = genormaliseerdeHoogte < kZandDrempel;
                    splat[y, x, 0] = isZand ? 0f : 1f; // Gras
                    splat[y, x, 1] = isZand ? 1f : 0f; // Zand
                }
            }

            data.SetAlphamaps(0, 0, splat);
        }

        static TerrainLayer MaakOfLaadLaag(string laagPad, string texturePad, Color kleur)
        {
            var bestaandeLaag = AssetDatabase.LoadAssetAtPath<TerrainLayer>(laagPad);
            if (bestaandeLaag != null)
                return bestaandeLaag;

            Texture2D textuur = MaakOfLaadEffenTextuur(texturePad, kleur);

            var laag = new TerrainLayer { diffuseTexture = textuur, tileSize = new Vector2(50f, 50f) };
            AssetDatabase.CreateAsset(laag, laagPad);
            return laag;
        }

        static Texture2D MaakOfLaadEffenTextuur(string pad, Color kleur)
        {
            var bestaande = AssetDatabase.LoadAssetAtPath<Texture2D>(pad);
            if (bestaande != null)
                return bestaande;

            const int size = 8;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var pixels = new Color[size * size];
            for (int i = 0; i < pixels.Length; i++) pixels[i] = kleur;
            texture.SetPixels(pixels);
            texture.Apply();

            byte[] pngData = texture.EncodeToPNG();
            Object.DestroyImmediate(texture);

            Directory.CreateDirectory(Path.GetDirectoryName(pad));
            File.WriteAllBytes(pad, pngData);
            AssetDatabase.ImportAsset(pad);

            return AssetDatabase.LoadAssetAtPath<Texture2D>(pad);
        }
    }
}
