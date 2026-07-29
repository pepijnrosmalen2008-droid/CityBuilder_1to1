using UnityEngine;

namespace CityBuilder.Prototype
{
    /// On-screen fps/frametime readout for the Development Build measurement pass
    /// (section 5, step 12). The full Unity Profiler gives richer per-system numbers,
    /// but this avoids needing the Profiler window attached while walking around
    /// the standalone build on the target laptop.
    [AddComponentMenu("City Builder/Fps Hud")]
    public class FpsHud : MonoBehaviour
    {
        public float sampleWindow = 0.5f;

        float _timer;
        int _frames;
        float _fps;
        float _frameTimeMs;
        float _worstFrameTimeMs;

        GUIStyle _style;

        void Update()
        {
            _timer += Time.unscaledDeltaTime;
            _frames++;
            _worstFrameTimeMs = Mathf.Max(_worstFrameTimeMs, Time.unscaledDeltaTime * 1000f);

            if (_timer >= sampleWindow)
            {
                _fps = _frames / _timer;
                _frameTimeMs = (_timer / _frames) * 1000f;
                _timer = 0f;
                _frames = 0;
            }
        }

        void OnGUI()
        {
            if (_style == null)
            {
                _style = new GUIStyle(GUI.skin.box)
                {
                    fontSize = 20,
                    alignment = TextAnchor.UpperLeft,
                    normal = { textColor = Color.white }
                };
            }

            string budgetFlag = _frameTimeMs <= 22f ? "OK (target)" : _frameTimeMs <= 33f ? "OK (hard max)" : "OVER BUDGET";
            string text = $"FPS: {_fps:0.0}\nFrame: {_frameTimeMs:0.00} ms ({budgetFlag})\nWorst frame: {_worstFrameTimeMs:0.00} ms";
            GUI.Box(new Rect(10, 10, 260, 90), text, _style);
        }
    }
}
