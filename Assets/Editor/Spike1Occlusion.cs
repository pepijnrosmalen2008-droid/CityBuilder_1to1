using UnityEditor;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// Step 9: the direct countermeasure for lesson 4 in section 0 (CS2's baked occlusion
    /// culling didn't suit a dynamic, top-down, player-steered camera). This project leans on
    /// camera-frustum culling + GPU instancing rather than trusting baked occlusion, but we still
    /// bake Unity's Occlusion Culling as a supplementary layer and inspect it via
    /// Window > Rendering > Occlusion Culling afterwards.
    ///
    /// Also blocks the Editor for a bit and must be run manually here, same as the lighting bake.
    public static class Spike1Occlusion
    {
        [MenuItem("CityBuilder/Spike1/7 - Bake Occlusion Culling")]
        public static void BakeOcclusionCulling()
        {
            Debug.Log("[Spike1] Baking static occlusion culling for the current scene...");
            StaticOcclusionCulling.Compute();
            Debug.Log("[Spike1] Occlusion culling bake finished. Inspect via Window > Rendering > Occlusion Culling, " +
                      "then move the Scene view camera around to confirm buildings behind others actually get culled.");
        }
    }
}
