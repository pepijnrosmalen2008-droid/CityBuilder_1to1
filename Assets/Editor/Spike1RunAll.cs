using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace CityBuilder.Prototype.EditorTools
{
    /// One-click pipeline for everything that's safe to run unattended (scene, terrain, roads,
    /// buildings, vegetation). Lighting bake and occlusion culling bake are deliberately NOT
    /// included here -- they're slow, and it's worth eyeballing the scene once fully populated
    /// before committing to a multi-minute bake. Run those two via their own menu items
    /// (CityBuilder/Spike1/5, /6, /7) right after this finishes.
    public static class Spike1RunAll
    {
        [MenuItem("CityBuilder/Spike1/Run All (scene + terrain + roads + buildings + vegetation)")]
        public static void RunAll()
        {
            Spike1SceneSetup.CreateOrOpenScene();
            Spike1Terrain.Generate();
            Spike1Roads.PlaceRoads();
            Spike1Buildings.GenerateAndPlace();
            Spike1Vegetation.PlaceVegetation();

            EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene());

            Debug.Log("[Spike1] Run All complete. Scene saved. Next: " +
                      "CityBuilder/Spike1/5 (Configure Lighting) -> /6 (Bake Lighting) -> /7 (Bake Occlusion Culling), " +
                      "then File > Build Settings > Build (Development Build) to measure fps on the laptop.");
        }
    }
}
