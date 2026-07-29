using UnityEditor;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// Step 7: one forest patch using Unity Terrain's built-in Tree system (already gives
    /// instancing + billboard LOD for free — this is exactly why the spec calls it out as
    /// "relatief weinig extra werk"), plus a handful of scattered rock props.
    ///
    /// Not covered here: grass/ground-cover detail painting. That needs real texture assets
    /// (a grass albedo, at minimum) that don't exist in this repo yet — painting Terrain
    /// Details is a quick manual pass in the Terrain inspector once you've picked textures you
    /// like, so it's left as your step rather than faked with a placeholder texture.
    public static class Spike1Vegetation
    {
        const string kTreePrefabPath = "Assets/Prototype/Prefabs/Tree_Placeholder.prefab";
        const int kTreeCount = 200;
        const int kRockCount = 15;

        // Forest patch sits in a corner outside the road/building grid (which uses -200..200).
        const float kForestMinX = 150f, kForestMaxX = 240f;
        const float kForestMinZ = 150f, kForestMaxZ = 240f;

        [MenuItem("CityBuilder/Spike1/4 - Place Vegetation")]
        public static void PlaceVegetation()
        {
            var terrain = Terrain.activeTerrain;
            if (terrain == null)
            {
                Debug.LogError("[Spike1] No active Terrain found — run step 1 first.");
                return;
            }

            GameObject treePrefab = GetOrCreateTreePrefab();
            var data = terrain.terrainData;

            data.treePrototypes = new[] { new TreePrototype { prefab = treePrefab } };

            var instances = new TreeInstance[kTreeCount];
            float sizeX = data.size.x, sizeZ = data.size.z;
            var rng = new System.Random(1000);

            for (int i = 0; i < kTreeCount; i++)
            {
                float worldX = Mathf.Lerp(kForestMinX, kForestMaxX, (float)rng.NextDouble());
                float worldZ = Mathf.Lerp(kForestMinZ, kForestMaxZ, (float)rng.NextDouble());
                // TreeInstance.position is normalized 0-1 within the terrain's local footprint.
                float normX = (worldX - terrain.transform.position.x) / sizeX;
                float normZ = (worldZ - terrain.transform.position.z) / sizeZ;

                instances[i] = new TreeInstance
                {
                    position = new Vector3(normX, 0f, normZ),
                    widthScale = Random.Range(0.8f, 1.3f),
                    heightScale = Random.Range(0.8f, 1.4f),
                    rotation = (float)rng.NextDouble() * Mathf.PI * 2f,
                    color = Color.white,
                    lightmapColor = Color.white,
                    prototypeIndex = 0,
                };
            }

            data.SetTreeInstances(instances, true);

            PlaceRocks(terrain);

            Debug.Log($"[Spike1] Placed {kTreeCount} trees in forest patch + {kRockCount} rocks.");
        }

        static void PlaceRocks(Terrain terrain)
        {
            Transform parent = GameObject.Find("Spike1_Rocks")?.transform;
            if (parent == null) parent = new GameObject("Spike1_Rocks").transform;
            for (int i = parent.childCount - 1; i >= 0; i--)
                Object.DestroyImmediate(parent.GetChild(i).gameObject);

            Material rockMat = GetOrCreateMaterial("Assets/Prototype/Materials/Rock.mat", new Color(0.45f, 0.44f, 0.42f));
            Mesh cube = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            var rng = new System.Random(2000);

            for (int i = 0; i < kRockCount; i++)
            {
                float worldX = Mathf.Lerp(kForestMinX - 20f, kForestMaxX + 20f, (float)rng.NextDouble());
                float worldZ = Mathf.Lerp(kForestMinZ - 20f, kForestMaxZ + 20f, (float)rng.NextDouble());
                Vector3 pos = new Vector3(worldX, 0f, worldZ);
                float y = terrain.SampleHeight(pos) + terrain.transform.position.y;

                var go = new GameObject($"Rock_{i:00}");
                go.transform.SetParent(parent, false);
                go.transform.position = new Vector3(pos.x, y, pos.z);
                go.transform.rotation = Quaternion.Euler(
                    (float)rng.NextDouble() * 10f, (float)rng.NextDouble() * 360f, (float)rng.NextDouble() * 10f);
                float scale = Mathf.Lerp(0.6f, 1.8f, (float)rng.NextDouble());
                go.transform.localScale = new Vector3(scale, scale * 0.7f, scale);

                go.AddComponent<MeshFilter>().sharedMesh = cube;
                go.AddComponent<MeshRenderer>().sharedMaterial = rockMat;
                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.ContributeGI
                    | StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
            }
        }

        static GameObject GetOrCreateTreePrefab()
        {
            GameObject existing = AssetDatabase.LoadAssetAtPath<GameObject>(kTreePrefabPath);
            if (existing != null) return existing;

            Mesh cube = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            Mesh cylinder = Resources.GetBuiltinResource<Mesh>("Cylinder.fbx");
            Mesh sphere = Resources.GetBuiltinResource<Mesh>("Sphere.fbx");

            // Trunk: thin, tall cylinder. Canopy: squashed sphere on top. Crude but correctly
            // proportioned and correctly wound (both are Unity built-ins, no hand-authored tris).
            var trunkCombine = new CombineInstance[1];
            trunkCombine[0].mesh = cylinder;
            trunkCombine[0].transform = Matrix4x4.TRS(new Vector3(0, 2f, 0), Quaternion.identity, new Vector3(0.5f, 2f, 0.5f));
            Mesh trunkMesh = new Mesh();
            trunkMesh.CombineMeshes(trunkCombine, true, true);

            var canopyCombine = new CombineInstance[1];
            canopyCombine[0].mesh = sphere;
            canopyCombine[0].transform = Matrix4x4.TRS(new Vector3(0, 5.5f, 0), Quaternion.identity, new Vector3(3.5f, 3f, 3.5f));
            Mesh canopyMesh = new Mesh();
            canopyMesh.CombineMeshes(canopyCombine, true, true);

            var combine = new CombineInstance[2];
            combine[0].mesh = trunkMesh; combine[0].transform = Matrix4x4.identity; combine[0].subMeshIndex = 0;
            combine[1].mesh = canopyMesh; combine[1].transform = Matrix4x4.identity; combine[1].subMeshIndex = 0;
            var treeMesh = new Mesh { name = "TreePlaceholder" };
            treeMesh.CombineMeshes(combine, false, true);
            treeMesh.RecalculateBounds();
            AssetDatabase.CreateAsset(treeMesh, "Assets/Prototype/Meshes/Buildings/Tree_Placeholder.asset");

            Material barkMat = GetOrCreateMaterial("Assets/Prototype/Materials/Bark.mat", new Color(0.32f, 0.22f, 0.14f));
            Material leafMat = GetOrCreateMaterial("Assets/Prototype/Materials/Leaves.mat", new Color(0.22f, 0.42f, 0.18f));

            var root = new GameObject("Tree_Placeholder");
            root.AddComponent<MeshFilter>().sharedMesh = treeMesh;
            root.AddComponent<MeshRenderer>().sharedMaterials = new[] { barkMat, leafMat };

            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, kTreePrefabPath);
            Object.DestroyImmediate(root);
            return prefab;
        }

        static Material GetOrCreateMaterial(string path, Color color)
        {
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;

            Material m = new Material(Shader.Find("Universal Render Pipeline/Lit"))
            {
                name = System.IO.Path.GetFileNameWithoutExtension(path)
            };
            m.SetColor("_BaseColor", color);
            m.enableInstancing = true;
            AssetDatabase.CreateAsset(m, path);
            return m;
        }
    }
}
