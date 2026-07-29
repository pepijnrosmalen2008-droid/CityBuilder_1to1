using UnityEditor;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// Step 8: sets lights to Baked/Mixed (never Realtime, per section 2), places a coarse grid
    /// of reflection probes, and triggers the Progressive Lightmapper bake.
    /// This can only run inside the Unity Editor with the project open — there is no way to
    /// execute or verify it from outside the Editor, so run these two menu items yourself and
    /// watch the Editor; the bake can take several minutes on a 500x500m scene.
    public static class Spike1Lighting
    {
        [MenuItem("CityBuilder/Spike1/5 - Configure Lighting")]
        public static void ConfigureLighting()
        {
            var light = Object.FindFirstObjectByType<Light>();
            if (light != null && light.type == LightType.Directional)
            {
                light.lightmapBakeType = LightmapBakeType.Mixed;
                light.intensity = 3f;
                light.shadows = LightShadows.Soft;
            }
            else
            {
                Debug.LogWarning("[Spike1] No Directional Light found in the scene.");
            }

            PlaceReflectionProbes();

            Lightmapping.realtimeGI = false;
            Lightmapping.bakedGI = true;

            Debug.Log("[Spike1] Lighting configured (Mixed, baked GI). Run step 6 to start the bake.");
        }

        [MenuItem("CityBuilder/Spike1/6 - Bake Lighting (blocks Editor, can take minutes)")]
        public static void BakeLighting()
        {
            Debug.Log("[Spike1] Starting Progressive Lightmapper bake -- this blocks the Editor until done.");
            bool ok = Lightmapping.Bake();
            Debug.Log(ok ? "[Spike1] Lighting bake finished." : "[Spike1] Lighting bake failed or was cancelled -- check the Console above.");
        }

        static void PlaceReflectionProbes()
        {
            Transform parent = GameObject.Find("Spike1_ReflectionProbes")?.transform;
            if (parent == null) parent = new GameObject("Spike1_ReflectionProbes").transform;
            for (int i = parent.childCount - 1; i >= 0; i--)
                Object.DestroyImmediate(parent.GetChild(i).gameObject);

            var terrain = Terrain.activeTerrain;
            const float half = 200f;
            const int gridSteps = 3; // coarse on purpose -- this is a spike, not final placement
            float spacing = (half * 2f) / (gridSteps - 1);

            for (int ix = 0; ix < gridSteps; ix++)
            {
                for (int iz = 0; iz < gridSteps; iz++)
                {
                    float x = -half + ix * spacing;
                    float z = -half + iz * spacing;
                    float y = terrain != null ? terrain.SampleHeight(new Vector3(x, 0, z)) + terrain.transform.position.y : 0f;

                    var go = new GameObject($"ReflectionProbe_{ix}_{iz}");
                    go.transform.SetParent(parent, false);
                    go.transform.position = new Vector3(x, y + 8f, z);

                    var probe = go.AddComponent<ReflectionProbe>();
                    probe.mode = UnityEngine.Rendering.ReflectionProbeMode.Baked;
                    probe.size = new Vector3(spacing, 30f, spacing);
                    probe.resolution = 128;
                }
            }
        }
    }
}
