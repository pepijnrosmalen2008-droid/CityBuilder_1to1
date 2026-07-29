using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using CityBuilder.Prototype;

namespace CityBuilder.Prototype.EditorTools
{
    /// Step 0: creates (or reopens) the dedicated Spike 1 scene so the prototype never
    /// touches the default SampleScene. Run this first, then the numbered menu items below it.
    public static class Spike1SceneSetup
    {
        public const string ScenePath = "Assets/Prototype/Spike1_Rendering.unity";

        [MenuItem("CityBuilder/Spike1/0 - Create Or Open Spike1 Scene")]
        public static void CreateOrOpenScene()
        {
            if (System.IO.File.Exists(ScenePath))
            {
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                Debug.Log("[Spike1] Opened existing Spike1_Rendering scene.");
                return;
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            var camGO = GameObject.Find("Main Camera");
            if (camGO != null)
            {
                camGO.AddComponent<FreeCamera>();
                camGO.AddComponent<FpsHud>();
                camGO.transform.position = new Vector3(0f, 60f, -90f);
                camGO.transform.rotation = Quaternion.Euler(50f, 0f, 0f);
            }

            EditorSceneManager.SaveScene(scene, ScenePath);

            var buildScenes = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            bool alreadyInBuild = buildScenes.Exists(s => s.path == ScenePath);
            if (!alreadyInBuild)
            {
                buildScenes.Add(new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = buildScenes.ToArray();
            }

            Debug.Log("[Spike1] Created Spike1_Rendering scene, added FreeCamera + FpsHud, added to Build Settings.");
        }
    }
}
