using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Visualisatie
{
    /// Bridges the pure-ECS Wegennetwerk data to something you can actually see. Deliberately a
    /// plain GameObject+MeshFilter/MeshRenderer bridge (same technique as Spike 1's roads/
    /// buildings), not native Entities Graphics rendering -- that's a meaningfully larger, less
    /// certain API surface, and Spike 1/2 already proved there's a lot of GPU/CPU headroom left
    /// before instancing-at-scale becomes necessary.
    ///
    /// Create-once, not live-synced: once a segment has a visual, this system never revisits it.
    /// Fine for this pass (nothing currently edits a WegSegment's spline after creation), but a
    /// future "player redraws a road" feature would need a dirty-tag to re-trigger this.
    public struct WegVisueelGemaakt : IComponentData { }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct WegVisualisatieSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var terrain = Terrain.activeTerrain;
            var materiaal = WegVisualisatieUtility.GetOfMaakAsfaltMateriaal();

            var toTag = new NativeList<Entity>(Allocator.Temp);

            foreach (var (segment, entity) in SystemAPI.Query<RefRO<WegSegmentData>>().WithNone<WegVisueelGemaakt>().WithEntityAccess())
            {
                var spline = state.EntityManager.GetBuffer<WegSegmentSplinePunt>(entity);
                var lanes = state.EntityManager.GetBuffer<LaneBufferElement>(entity);
                float breedte = TotaalBreedte(lanes);

                if (spline.Length >= 2 && breedte > 0f)
                {
                    Mesh mesh = WegVisualisatieUtility.BouwWegMesh(spline, breedte, terrain);
                    var go = new GameObject($"WegVisueel_{entity.Index}");
                    go.AddComponent<MeshFilter>().sharedMesh = mesh;
                    go.AddComponent<MeshRenderer>().sharedMaterial = materiaal;
                }

                toTag.Add(entity);
            }

            foreach (var e in toTag)
                state.EntityManager.AddComponent<WegVisueelGemaakt>(e);

            toTag.Dispose();
        }

        static float TotaalBreedte(DynamicBuffer<LaneBufferElement> lanes)
        {
            float totaal = 0f;
            for (int i = 0; i < lanes.Length; i++)
                totaal += lanes[i].BreedteMeter;
            return totaal;
        }
    }

    public static class WegVisualisatieUtility
    {
        static Material _asfaltMateriaal;

        public static Material GetOfMaakAsfaltMateriaal()
        {
            if (_asfaltMateriaal != null)
                return _asfaltMateriaal;

            var shader = Shader.Find("Universal Render Pipeline/Lit");
            _asfaltMateriaal = new Material(shader) { name = "Asfalt_Placeholder" };
            _asfaltMateriaal.SetColor("_BaseColor", new Color(0.22f, 0.22f, 0.23f));
            _asfaltMateriaal.SetFloat("_Smoothness", 0.25f);
            return _asfaltMateriaal;
        }

        /// Same validated quad winding as Assets/Prototype's road quad (front face = +Y): for
        /// each spline segment, (a-side, a+side, b+side, b-side) with triangles (0,2,1)/(0,3,2).
        public static Mesh BouwWegMesh(DynamicBuffer<WegSegmentSplinePunt> spline, float breedte, Terrain terrain)
        {
            var verts = new List<Vector3>();
            var tris = new List<int>();
            var uvs = new List<Vector2>();

            for (int i = 0; i < spline.Length - 1; i++)
            {
                Vector3 a = HoogteGecorrigeerd(spline[i].Punt, terrain);
                Vector3 b = HoogteGecorrigeerd(spline[i + 1].Punt, terrain);
                Vector3 dir = (b - a).normalized;
                Vector3 zijkant = Vector3.Cross(Vector3.up, dir) * (breedte * 0.5f);

                int baseIdx = verts.Count;
                verts.Add(a - zijkant);
                verts.Add(a + zijkant);
                verts.Add(b + zijkant);
                verts.Add(b - zijkant);
                uvs.Add(new Vector2(0, 0));
                uvs.Add(new Vector2(1, 0));
                uvs.Add(new Vector2(1, 1));
                uvs.Add(new Vector2(0, 1));

                tris.Add(baseIdx); tris.Add(baseIdx + 2); tris.Add(baseIdx + 1);
                tris.Add(baseIdx); tris.Add(baseIdx + 3); tris.Add(baseIdx + 2);
            }

            var mesh = new Mesh { name = "WegMesh" };
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.SetUVs(0, uvs);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        static Vector3 HoogteGecorrigeerd(Unity.Mathematics.float3 punt, Terrain terrain)
        {
            var wereldPositieVoorSample = new Vector3(punt.x, 0f, punt.z);
            float hoogte = terrain != null
                ? terrain.SampleHeight(wereldPositieVoorSample) + terrain.transform.position.y
                : punt.y;
            return new Vector3(punt.x, hoogte + 0.05f, punt.z);
        }
    }
}
