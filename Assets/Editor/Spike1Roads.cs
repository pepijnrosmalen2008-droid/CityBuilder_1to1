using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// Step 4: a hardcoded ~20-segment street grid, simple mesh-based roads (no procedural
    /// intersections needed for this spike per section 1).
    public static class Spike1Roads
    {
        const string kMeshPath = "Assets/Prototype/Meshes/Roads/RoadQuad.asset";
        const string kMatPath = "Assets/Prototype/Materials/Road.mat";
        const float kUsableArea = 400f; // stays inside the 500m terrain, leaves a margin
        const int kStreetCount = 5;
        const float kRoadWidth = 8f;
        const int kSegmentsPerStreet = 2;

        [MenuItem("CityBuilder/Spike1/2 - Place Road Grid")]
        public static void PlaceRoads()
        {
            var terrain = Terrain.activeTerrain;
            if (terrain == null)
            {
                Debug.LogError("[Spike1] No active Terrain found — run step 1 first.");
                return;
            }

            Transform parent = GetOrCreateParent("Spike1_Roads");
            ClearChildren(parent);

            Mesh quad = GetOrCreateQuadMesh();
            Material roadMat = GetOrCreateRoadMaterial();

            float half = kUsableArea / 2f;
            float spacing = kUsableArea / (kStreetCount - 1);
            int segIndex = 0;

            for (int i = 0; i < kStreetCount; i++)
            {
                float x = -half + i * spacing;
                segIndex += PlaceRoadLine(parent, quad, roadMat, terrain,
                    new Vector3(x, 0, -half), new Vector3(x, 0, half), kRoadWidth, kSegmentsPerStreet, segIndex);
            }

            for (int i = 0; i < kStreetCount; i++)
            {
                float z = -half + i * spacing;
                segIndex += PlaceRoadLine(parent, quad, roadMat, terrain,
                    new Vector3(-half, 0, z), new Vector3(half, 0, z), kRoadWidth, kSegmentsPerStreet, segIndex);
            }

            Debug.Log($"[Spike1] Placed {segIndex} road segments.");
        }

        static int PlaceRoadLine(Transform parent, Mesh quad, Material mat, Terrain terrain,
            Vector3 a, Vector3 b, float width, int segments, int startIndex)
        {
            Vector3 dir = (b - a).normalized;
            float totalLength = Vector3.Distance(a, b);
            float segLength = totalLength / segments;

            for (int i = 0; i < segments; i++)
            {
                Vector3 segStart = a + dir * (segLength * i);
                Vector3 segMid = segStart + dir * (segLength * 0.5f);

                float y = terrain.SampleHeight(segMid) + terrain.transform.position.y + 0.05f;
                var go = new GameObject($"Road_{startIndex + i:00}");
                go.transform.SetParent(parent, false);
                go.transform.position = new Vector3(segMid.x, y, segMid.z);
                go.transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
                go.transform.localScale = new Vector3(width, 1f, segLength);

                var mf = go.AddComponent<MeshFilter>();
                mf.sharedMesh = quad;
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = mat;

                GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.ContributeGI
                    | StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
            }

            return segments;
        }

        static Mesh GetOrCreateQuadMesh()
        {
            Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(kMeshPath);
            if (mesh != null) return mesh;

            mesh = new Mesh { name = "RoadQuad" };
            // Unit quad in the XZ plane, local X = width axis, local Z = length axis.
            var verts = new[]
            {
                new Vector3(-0.5f, 0f, -0.5f),
                new Vector3(0.5f, 0f, -0.5f),
                new Vector3(0.5f, 0f, 0.5f),
                new Vector3(-0.5f, 0f, 0.5f),
            };
            var uvs = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            var tris = new[] { 0, 2, 1, 0, 3, 2 };

            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.triangles = tris;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();

            AssetDatabase.CreateAsset(mesh, kMeshPath);
            return mesh;
        }

        static Material GetOrCreateRoadMaterial()
        {
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(kMatPath);
            if (mat != null) return mat;

            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            mat = new Material(shader) { name = "Road" };
            mat.SetColor("_BaseColor", new Color(0.22f, 0.22f, 0.23f));
            mat.SetFloat("_Smoothness", 0.25f);
            mat.enableInstancing = true;

            AssetDatabase.CreateAsset(mat, kMatPath);
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
