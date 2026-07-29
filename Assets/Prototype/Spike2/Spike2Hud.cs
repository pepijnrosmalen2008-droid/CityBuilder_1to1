using Unity.Entities;
using UnityEngine;

namespace CityBuilder.Prototype.Spike2
{
    /// On-screen readout for the Development Build measurement pass (section 4, step 8): shows
    /// the in-game day counter advancing and how many bidding rounds are pending, so you can
    /// confirm the simulation is actually ticking through multiple days without needing the
    /// Profiler open the whole time.
    [AddComponentMenu("City Builder/Spike2 Hud")]
    public class Spike2Hud : MonoBehaviour
    {
        float _fpsTimer;
        int _fpsFrames;
        float _fps;

        GUIStyle _style;

        void Update()
        {
            _fpsTimer += Time.unscaledDeltaTime;
            _fpsFrames++;
            if (_fpsTimer >= 0.5f)
            {
                _fps = _fpsFrames / _fpsTimer;
                _fpsTimer = 0f;
                _fpsFrames = 0;
            }
        }

        void OnGUI()
        {
            var world = World.DefaultGameObjectInjectionWorld;
            if (world == null || !world.IsCreated)
            {
                GUI.Label(new Rect(10, 10, 400, 24), "Geen ECS World gevonden.");
                return;
            }

            _style ??= new GUIStyle(GUI.skin.box) { fontSize = 18, alignment = TextAnchor.UpperLeft, normal = { textColor = Color.white } };

            var em = world.EntityManager;
            int dag = 0;
            var clockQuery = em.CreateEntityQuery(typeof(SimClockData));
            if (!clockQuery.IsEmpty)
                dag = clockQuery.GetSingleton<SimClockData>().HuidigeDag;

            int pendingBiedingen = em.CreateEntityQuery(typeof(BiedingVereist)).CalculateEntityCount();
            int kavelCount = em.CreateEntityQuery(typeof(KavelData)).CalculateEntityCount();
            int waterDirty = em.CreateEntityQuery(typeof(WaterDirty)).CalculateEntityCount();

            string text = $"FPS: {_fps:0.0}\nDag: {dag}\nKavels: {kavelCount}\nBiedingen wachtend: {pendingBiedingen}\nWater dirty: {waterDirty}";
            GUI.Box(new Rect(10, 10, 280, 120), text, _style);
        }
    }
}
