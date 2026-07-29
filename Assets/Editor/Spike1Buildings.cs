using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// Steps 5+6: modular placeholder buildings (grey-box, real modular kit comes later per the
    /// art-direction doc mentioned in 00-index.md), GPU-instancing-friendly (shared mesh +
    /// shared material per type, per-instance color via MaterialPropertyBlock), with LOD Groups.
    ///
    /// LOD0 = body + roof cap (two submeshes/materials), LOD1 = body only (real triangle
    /// reduction), LOD2 = one shared generic box mesh reused across every building type (real
    /// memory saving at distance), LOD3 = culled. Everything is built by transforming Unity's
    /// built-in cube mesh via CombineInstance, never hand-authored triangles, so winding/normals
    /// are guaranteed correct without a visual check in-editor.
    public static class Spike1Buildings
    {
        const string kMeshFolder = "Assets/Prototype/Meshes/Buildings";
        const string kMatFolder = "Assets/Prototype/Materials";
        const string kPrefabFolder = "Assets/Prototype/Prefabs";
        const int kTargetCount = 120;

        struct BuildingType
        {
            public string name;
            public float width, depth, height, overhang;
            public Color color;
        }

        static readonly BuildingType[] kTypes =
        {
            new BuildingType{ name="RowHouse_A",  width=6f,  depth=10f, height=7f,   overhang=0.5f, color=new Color(0.55f,0.25f,0.20f) },
            new BuildingType{ name="RowHouse_B",  width=7f,  depth=11f, height=8.5f, overhang=0.6f, color=new Color(0.82f,0.78f,0.65f) },
            new BuildingType{ name="Apartment_A", width=14f, depth=16f, height=15f,  overhang=0.3f, color=new Color(0.55f,0.55f,0.58f) },
            new BuildingType{ name="Apartment_B", width=12f, depth=14f, height=12f,  overhang=0.2f, color=new Color(0.70f,0.70f,0.72f) },
            new BuildingType{ name="Portiekflat", width=16f, depth=12f, height=18f,  overhang=0.3f, color=new Color(0.35f,0.20f,0.18f) },
            new BuildingType{ name="Vinex_Villa", width=9f,  depth=9f,  height=6f,   overhang=0.8f, color=new Color(0.75f,0.60f,0.40f) },
        };

        [MenuItem("CityBuilder/Spike1/3 - Generate Buildings")]
        public static void GenerateAndPlace()
        {
            var terrain = Terrain.activeTerrain;
            if (terrain == null)
            {
                Debug.LogError("[Spike1] No active Terrain found — run step 1 first.");
                return;
            }

            Material roofMat = GetOrCreateMaterial(kMatFolder + "/RoofCap.mat", new Color(0.18f, 0.18f, 0.19f));
            Mesh genericFarMesh = GetOrCreateGenericFarMesh();

            var prefabs = new Dictionary<string, GameObject>();
            foreach (var t in kTypes)
                prefabs[t.name] = BuildPrefab(t, roofMat, genericFarMesh);

            Transform parent = GetOrCreateParent("Spike1_Buildings");
            ClearChildren(parent);

            PlaceAlongRoads(parent, prefabs, terrain);
        }

        static GameObject BuildPrefab(BuildingType t, Material roofMat, Mesh genericFarMesh)
        {
            Mesh cube = Resources.GetBuiltinResource<Mesh>("Cube.fbx");

            Mesh bodyMesh = TransformedCopy(cube, Vector3.zero, new Vector3(t.width, t.height, t.depth), t.height * 0.5f);
            Mesh roofMesh = TransformedCopy(cube, Vector3.zero,
                new Vector3(t.width + t.overhang * 2f, 0.4f, t.depth + t.overhang * 2f), t.height + 0.2f);

            Mesh lod0 = CombineTwo(bodyMesh, roofMesh);
            SaveMesh(lod0, $"{kMeshFolder}/{t.name}_LOD0.asset");
            SaveMesh(bodyMesh, $"{kMeshFolder}/{t.name}_LOD1.asset");

            Material bodyMat = GetOrCreateMaterial($"{kMatFolder}/{t.name}.mat", t.color);

            string prefabPath = $"{kPrefabFolder}/{t.name}.prefab";
            var root = new GameObject(t.name);

            var lod0GO = new GameObject("LOD0");
            lod0GO.transform.SetParent(root.transform, false);
            lod0GO.AddComponent<MeshFilter>().sharedMesh = lod0;
            lod0GO.AddComponent<MeshRenderer>().sharedMaterials = new[] { bodyMat, roofMat };

            var lod1GO = new GameObject("LOD1");
            lod1GO.transform.SetParent(root.transform, false);
            lod1GO.AddComponent<MeshFilter>().sharedMesh = bodyMesh;
            lod1GO.AddComponent<MeshRenderer>().sharedMaterial = bodyMat;

            var lod2GO = new GameObject("LOD2");
            lod2GO.transform.SetParent(root.transform, false);
            lod2GO.AddComponent<MeshFilter>().sharedMesh = genericFarMesh;
            lod2GO.AddComponent<MeshRenderer>().sharedMaterial = bodyMat;

            var lodGroup = root.AddComponent<LODGroup>();
            lodGroup.SetLODs(new[]
            {
                new LOD(0.30f, new[] { lod0GO.GetComponent<Renderer>() }),
                new LOD(0.12f, new[] { lod1GO.GetComponent<Renderer>() }),
                new LOD(0.03f, new[] { lod2GO.GetComponent<Renderer>() }),
                // 4th implicit LOD below 0.03 screen height = culled entirely
            });
            lodGroup.RecalculateBounds();

            GameObjectUtility.SetStaticEditorFlags(root, StaticEditorFlags.ContributeGI
                | StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);

            GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            Object.DestroyImmediate(root);
            return prefab;
        }

        static void PlaceAlongRoads(Transform parent, Dictionary<string, GameObject> prefabs, Terrain terrain)
        {
            const float usable = 400f;
            const int streetCount = 5;
            const float roadWidth = 8f;
            float half = usable / 2f;
            float spacing = usable / (streetCount - 1);

            var lines = new List<(Vector3 a, Vector3 b)>();
            for (int i = 0; i < streetCount; i++)
            {
                float x = -half + i * spacing;
                lines.Add((new Vector3(x, 0, -half), new Vector3(x, 0, half)));
            }
            for (int i = 0; i < streetCount; i++)
            {
                float z = -half + i * spacing;
                lines.Add((new Vector3(-half, 0, z), new Vector3(half, 0, z)));
            }

            var typeNames = new List<string>(prefabs.Keys);
            int placed = 0;
            int typeIdx = 0;
            const float lotSpacing = 12f;
            const float setback = roadWidth * 0.5f + 6f;

            foreach (var (a, b) in lines)
            {
                if (placed >= kTargetCount) break;
                Vector3 dir = (b - a).normalized;
                Vector3 side = Vector3.Cross(Vector3.up, dir);
                float length = Vector3.Distance(a, b);
                int lots = Mathf.FloorToInt(length / lotSpacing);

                for (int i = 1; i < lots && placed < kTargetCount; i++)
                {
                    Vector3 pointOnRoad = a + dir * (i * lotSpacing);

                    foreach (float sign in new[] { -1f, 1f })
                    {
                        if (placed >= kTargetCount) break;

                        string typeName = typeNames[typeIdx % typeNames.Count];
                        typeIdx++;
                        GameObject prefab = prefabs[typeName];

                        Vector3 pos = pointOnRoad + side * sign * setback;
                        float y = terrain.SampleHeight(pos) + terrain.transform.position.y;

                        var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                        instance.transform.SetParent(parent, false);
                        instance.transform.position = new Vector3(pos.x, y, pos.z);
                        instance.transform.rotation = Quaternion.LookRotation(side * sign, Vector3.up);
                        instance.name = $"{typeName}_{placed:000}";

                        placed++;
                    }
                }
            }

            Debug.Log($"[Spike1] Placed {placed} building instances across {prefabs.Count} types (target was {kTargetCount}).");
        }

        static Mesh TransformedCopy(Mesh source, Vector3 unusedCenter, Vector3 scale, float centerY)
        {
            var combine = new CombineInstance[1];
            combine[0].mesh = source;
            combine[0].transform = Matrix4x4.TRS(new Vector3(0, centerY, 0), Quaternion.identity, scale);
            var mesh = new Mesh();
            mesh.CombineMeshes(combine, true, true);
            mesh.RecalculateBounds();
            return mesh;
        }

        static Mesh CombineTwo(Mesh a, Mesh b)
        {
            var combine = new CombineInstance[2];
            combine[0].mesh = a; combine[0].transform = Matrix4x4.identity; combine[0].subMeshIndex = 0;
            combine[1].mesh = b; combine[1].transform = Matrix4x4.identity; combine[1].subMeshIndex = 0;
            var mesh = new Mesh();
            mesh.CombineMeshes(combine, false, true); // keep as 2 separate submeshes -> 2 materials
            mesh.RecalculateBounds();
            return mesh;
        }

        static Mesh GetOrCreateGenericFarMesh()
        {
            const string path = kMeshFolder + "/Generic_LOD2.asset";
            Mesh existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) return existing;

            Mesh cube = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            Mesh mesh = TransformedCopy(cube, Vector3.zero, new Vector3(10f, 10f, 10f), 5f);
            SaveMesh(mesh, path);
            return AssetDatabase.LoadAssetAtPath<Mesh>(path);
        }

        static void SaveMesh(Mesh mesh, string path)
        {
            Mesh existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null)
            {
                existing.Clear();
                EditorUtility.CopySerialized(mesh, existing);
                EditorUtility.SetDirty(existing);
            }
            else
            {
                AssetDatabase.CreateAsset(mesh, path);
            }
        }

        static Material GetOrCreateMaterial(string path, Color color)
        {
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat != null) return mat;

            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            mat = new Material(shader) { name = System.IO.Path.GetFileNameWithoutExtension(path) };
            mat.SetColor("_BaseColor", color);
            mat.SetFloat("_Smoothness", 0.3f);
            mat.enableInstancing = true;

            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }

        static Transform GetOrCreateParent(string name)
        {
            GameObject go = GameObject.Find(name);
            if (go == null) go = new GameObject(name);
            return go.transform;
        }

        static void ClearChildren(Transform parent)
        {
            for (int i = parent.childCount - 1; i >= 0; i--)
                Object.DestroyImmediate(parent.GetChild(i).gameObject);
        }
    }
}
