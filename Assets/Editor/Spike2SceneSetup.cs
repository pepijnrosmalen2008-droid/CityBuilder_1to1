using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using CityBuilder.Prototype.Spike2;

namespace CityBuilder.Prototype.EditorTools
{
    /// Spike 2 needs no visuals (section 1: "Visuele kwaliteit -- placeholder-representatie is
    /// voldoende, dit is geen artstyle-test"), so this scene is just a camera and the on-screen
    /// Spike2Hud -- all the actual work happens in the ECS World, not in this scene's hierarchy.
    public static class Spike2SceneSetup
    {
        public const string ScenePath = "Assets/Prototype/Spike2_Simulation.unity";

        [MenuItem("CityBuilder/Spike2/0 - Create Or Open Spike2 Scene")]
        public static void CreateOrOpenScene()
        {
            if (System.IO.File.Exists(ScenePath))
            {
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                Debug.Log("[Spike2] Opened existing Spike2_Simulation scene.");
                return;
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            var camGO = GameObject.Find("Main Camera");
            if (camGO != null)
                camGO.AddComponent<Spike2Hud>();

            EditorSceneManager.SaveScene(scene, ScenePath);

            var buildScenes = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!buildScenes.Exists(s => s.path == ScenePath))
            {
                buildScenes.Add(new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = buildScenes.ToArray();
            }

            Debug.Log("[Spike2] Created Spike2_Simulation scene with Spike2Hud, added to Build Settings. " +
                      "Entering Play Mode (or a Development Build) is enough to spawn the whole synthetic " +
                      "world -- WorldGenerationSystem runs automatically at world startup, no menu item needed.");
        }
    }
}
