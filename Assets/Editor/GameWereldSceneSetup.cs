using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using CityBuilder.Prototype;

namespace CityBuilder.Game.EditorTools
{
    /// First real, permanent scene -- distinct from Assets/Prototype/'s disposable Spike1/2
    /// validation scenes. Reuses FreeCamera/FpsHud from the Prototype scripts since those are
    /// generic reusable utilities, not spike-specific scaffolding.
    public static class GameWereldSceneSetup
    {
        public const string ScenePath = "Assets/Game/GameWereld.unity";

        [MenuItem("CityBuilder/Game/0 - Create Or Open GameWereld Scene")]
        public static void CreateOrOpenScene()
        {
            if (System.IO.File.Exists(ScenePath))
            {
                EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                Debug.Log("[GameWereld] Opened existing GameWereld scene.");
                return;
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            var camGO = GameObject.Find("Main Camera");
            if (camGO != null)
            {
                camGO.AddComponent<FreeCamera>();
                camGO.AddComponent<FpsHud>();
                camGO.transform.position = new Vector3(0f, 120f, -180f);
                camGO.transform.rotation = Quaternion.Euler(50f, 0f, 0f);

                var freeCam = camGO.GetComponent<FreeCamera>();
                freeCam.panBoundsHalfSize = 480f;   // past bij het 1000x1000m GameTerrein
                freeCam.maxZoomDistance = 400f;
            }

            EditorSceneManager.SaveScene(scene, ScenePath);

            var buildScenes = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!buildScenes.Exists(s => s.path == ScenePath))
            {
                buildScenes.Add(new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = buildScenes.ToArray();
            }

            Debug.Log("[GameWereld] Scene aangemaakt, FreeCamera + FpsHud toegevoegd, toegevoegd aan Build Settings. " +
                      "Run hierna CityBuilder/Game/1 - Genereer Terrein.");
        }
    }
}
