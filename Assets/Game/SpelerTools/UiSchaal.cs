using UnityEngine;

namespace CityBuilder.Game.SpelerTools
{
    /// Schaalt de IMGUI-interface mee met de schermhoogte (1080p = 1x), zodat panelen op een
    /// 1440p- of 4K-scherm niet piepklein worden. Alle UI-coördinaten zijn "virtueel": deel
    /// schermpixels door Factor.
    public static class UiSchaal
    {
        public static float Factor => Mathf.Max(1f, Screen.height / 1080f);
        public static float Breedte => Screen.width / Factor;
        public static float Hoogte => Screen.height / Factor;

        /// Muispositie in virtuele coördinaten met de oorsprong linksboven (zoals OnGUI).
        public static Vector2 Muis => new Vector2(Input.mousePosition.x, Screen.height - Input.mousePosition.y) / Factor;

        public static void Toepassen() => GUI.matrix = Matrix4x4.Scale(new Vector3(Factor, Factor, 1f));
    }
}
