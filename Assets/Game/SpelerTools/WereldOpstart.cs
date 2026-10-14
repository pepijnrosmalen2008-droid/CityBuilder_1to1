using UnityEngine;
using CityBuilder.Game.Visualisatie;

namespace CityBuilder.Game.SpelerTools
{
    /// Hangt bij het starten van de GameWereld-scene automatisch de wereldonderdelen eraan
    /// (sfeer, HUD, terreinopmaak, bossen), zodat je niets opnieuw hoeft in te stellen via de
    /// editor-menu's. Andere scenes (de spikes) hebben geen WegBouwTool en blijven ongemoeid.
    static class WereldOpstart
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Opstarten()
        {
            var tool = Object.FindFirstObjectByType<WegBouwTool>();
            if (tool == null)
                return;

            var camera = tool.gameObject;
            if (camera.GetComponent<Camera>() != null && camera.GetComponent<WereldSfeer>() == null)
                camera.AddComponent<WereldSfeer>();
            if (camera.GetComponent<StadHud>() == null)
                camera.AddComponent<StadHud>();

            var terrein = Terrain.activeTerrain;
            if (terrein != null && terrein.GetComponent<TerreinOpmaak>() == null)
                terrein.gameObject.AddComponent<TerreinOpmaak>();

            if (Object.FindFirstObjectByType<BoomBeheer>() == null)
                new GameObject("Bomen").AddComponent<BoomBeheer>();
        }
    }
}
