using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using CityBuilder.Prototype;
using CityBuilder.Game.SpelerTools;

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
                var bestaandeScene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
                bool gewijzigd = ZorgVoorCameraComponenten();
                if (gewijzigd)
                    EditorSceneManager.SaveScene(bestaandeScene);
                Debug.Log("[GameWereld] Opened existing GameWereld scene" + (gewijzigd ? " (ontbrekende tools/camera-instellingen toegevoegd)." : "."));
                return;
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            ZorgVoorCameraComponenten();
            EditorSceneManager.SaveScene(scene, ScenePath);

            var buildScenes = new System.Collections.Generic.List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!buildScenes.Exists(s => s.path == ScenePath))
            {
                buildScenes.Add(new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = buildScenes.ToArray();
            }

            Debug.Log("[GameWereld] Scene aangemaakt, FreeCamera + FpsHud + WegBouwTool toegevoegd, toegevoegd aan Build Settings. " +
                      "Run hierna CityBuilder/Game/1 - Genereer Terrein.");
        }

        /// Idempotent: voegt alleen toe wat nog ontbreekt, zodat een tweede run op een bestaande
        /// scene (bijv. na het toevoegen van een nieuwe tool aan het project) 'm bijwerkt in
        /// plaats van dubbel toe te voegen. Retourneert of er iets gewijzigd is.
        static bool ZorgVoorCameraComponenten()
        {
            var camGO = GameObject.Find("Main Camera");
            if (camGO == null)
                return false;

            bool gewijzigd = false;

            if (camGO.GetComponent<FreeCamera>() == null)
            {
                var freeCam = camGO.AddComponent<FreeCamera>();
                freeCam.panBoundsHalfSize = 480f; // past bij het 1000x1000m GameTerrein
                freeCam.maxZoomDistance = 400f;
                camGO.transform.position = new Vector3(0f, 120f, -180f);
                camGO.transform.rotation = Quaternion.Euler(50f, 0f, 0f);
                gewijzigd = true;
            }

            if (camGO.GetComponent<FpsHud>() == null)
            {
                camGO.AddComponent<FpsHud>();
                gewijzigd = true;
            }

            if (camGO.GetComponent<WegBouwTool>() == null)
            {
                camGO.AddComponent<WegBouwTool>();
                gewijzigd = true;
            }

            return gewijzigd;
        }
    }
}
