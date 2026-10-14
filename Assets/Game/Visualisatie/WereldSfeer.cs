using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace CityBuilder.Game.Visualisatie
{
    /// Licht en sfeer van een heldere Nederlandse zomerdag: zon op ~42 graden met warme tint,
    /// procedurele lucht, blauwige luchtperspectief-mist in de verte, zacht drielicht als
    /// omgevingslicht en een filmische nabewerking (ACES, lichte bloom, vignet). Zet ook de
    /// schaduwafstand van URP ruim genoeg voor een stad (standaard is maar 50 m).
    [RequireComponent(typeof(Camera))]
    public class WereldSfeer : MonoBehaviour
    {
        public float zonHoogte = 42f;
        public float zonRichting = -35f;
        public float schaduwAfstand = 700f;

        void Start()
        {
            var cam = GetComponent<Camera>();
            cam.nearClipPlane = 1f;
            cam.farClipPlane = 3000f;
            cam.allowHDR = true;
            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            camData.antialiasingQuality = AntialiasingQuality.High;

            Zon();
            Lucht();
            Mist();
            Kwaliteit();
            Nabewerking();
        }

        void Zon()
        {
            Light zon = RenderSettings.sun;
            if (zon == null)
            {
                foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None))
                {
                    if (l.type == LightType.Directional) { zon = l; break; }
                }
            }
            if (zon == null)
            {
                zon = new GameObject("Zon").AddComponent<Light>();
                zon.type = LightType.Directional;
            }

            zon.transform.rotation = Quaternion.Euler(zonHoogte, zonRichting, 0f);
            zon.color = new Color(1f, 0.95f, 0.86f);
            zon.intensity = 1.7f;
            zon.shadows = LightShadows.Soft;
            zon.shadowStrength = 0.85f;
            zon.shadowBias = 0.05f;
            zon.shadowNormalBias = 0.4f;
            RenderSettings.sun = zon;
        }

        static void Lucht()
        {
            var shader = Shader.Find("Skybox/Procedural");
            if (shader != null)
            {
                var lucht = new Material(shader) { name = "Lucht" };
                lucht.SetFloat("_SunSize", 0.035f);
                lucht.SetFloat("_SunSizeConvergence", 6f);
                lucht.SetFloat("_AtmosphereThickness", 0.85f);
                lucht.SetColor("_SkyTint", new Color(0.52f, 0.60f, 0.74f));
                lucht.SetColor("_GroundColor", new Color(0.37f, 0.39f, 0.36f));
                lucht.SetFloat("_Exposure", 1.25f);
                RenderSettings.skybox = lucht;
            }

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.58f, 0.68f, 0.82f);
            RenderSettings.ambientEquatorColor = new Color(0.52f, 0.55f, 0.55f);
            RenderSettings.ambientGroundColor = new Color(0.30f, 0.29f, 0.26f);
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox;
            DynamicGI.UpdateEnvironment();
        }

        static void Mist()
        {
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.74f, 0.80f, 0.86f);
            RenderSettings.fogStartDistance = 350f;
            RenderSettings.fogEndDistance = 2400f;
        }

        void Kwaliteit()
        {
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp)
            {
                urp.shadowDistance = schaduwAfstand;
                urp.shadowCascadeCount = 4;
                urp.msaaSampleCount = 4;
            }
        }

        static void Nabewerking()
        {
            var go = new GameObject("Nabewerking");
            var volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 10f;
            var profiel = ScriptableObject.CreateInstance<VolumeProfile>();
            volume.profile = profiel;

            var tone = profiel.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);

            var bloom = profiel.Add<Bloom>(true);
            bloom.intensity.Override(0.25f);
            bloom.threshold.Override(1.1f);
            bloom.scatter.Override(0.6f);

            var kleur = profiel.Add<ColorAdjustments>(true);
            kleur.postExposure.Override(0.35f);
            kleur.contrast.Override(12f);
            kleur.saturation.Override(8f);

            var wit = profiel.Add<WhiteBalance>(true);
            wit.temperature.Override(4f);

            var vignet = profiel.Add<Vignette>(true);
            vignet.intensity.Override(0.18f);
            vignet.smoothness.Override(0.45f);
        }
    }
}
