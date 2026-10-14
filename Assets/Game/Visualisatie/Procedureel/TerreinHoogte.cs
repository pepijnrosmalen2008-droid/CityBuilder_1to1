using UnityEngine;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    public static class TerreinHoogte
    {
        /// Maaiveldhoogte op (x, z) in wereldcoördinaten; 0 als er geen terrein is.
        public static float Op(float x, float z)
        {
            var t = Terrain.activeTerrain;
            return t != null ? t.SampleHeight(new Vector3(x, 0f, z)) + t.transform.position.y : 0f;
        }
    }
}
