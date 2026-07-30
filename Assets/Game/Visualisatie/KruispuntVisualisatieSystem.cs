using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Visualisatie
{
    /// Vult het gat op elke knoop waar 2+ wegsegmenten samenkomen -- exact het "groen ertussen"-
    /// probleem dat zonder dit ontstaat, omdat twee wegstrips elkaar op een hoek nooit precies
    /// dekken. Een simpele platte cirkel (straal = halve breedte van de breedste aansluitende
    /// weg + marge) dekt elke aansluithoek gegarandeerd, in tegenstelling tot een exact
    /// gevormde kruispunt-polygon per configuratie -- dat is aanzienlijk complexere geometrie
    /// (zie de CS1/2-aanpak) en een latere verfijningsstap.
    ///
    /// Anders dan Weg-/KavelVisualisatieSystem is dit NIET volledig create-once: knopen met nog
    /// maar 1 aansluiting worden niet getagd, zodat een doodlopend wegeinde dat later alsnog een
    /// tweede weg krijgt (heel gewoon tijdens het bouwen) alsnog zijn kruispunt-vulling krijgt
    /// zodra dat gebeurt.
    public struct KruispuntVisueelGemaakt : IComponentData { }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct KruispuntVisualisatieSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;
            var terrain = Terrain.activeTerrain;

            var breedtePerNode = new NativeHashMap<Entity, float>(16, Allocator.Temp);
            var aantalPerNode = new NativeHashMap<Entity, int>(16, Allocator.Temp);

            foreach (var (segment, entity) in SystemAPI.Query<RefRO<WegSegmentData>>().WithEntityAccess())
            {
                var lanes = em.GetBuffer<LaneBufferElement>(entity);
                float breedte = 0f;
                for (int i = 0; i < lanes.Length; i++)
                    breedte += lanes[i].BreedteMeter;

                Registreer(ref breedtePerNode, ref aantalPerNode, segment.ValueRO.VanNode, breedte);
                Registreer(ref breedtePerNode, ref aantalPerNode, segment.ValueRO.NaarNode, breedte);
            }

            var toTag = new NativeList<Entity>(Allocator.Temp);

            foreach (var (node, entity) in SystemAPI.Query<RefRO<NetwerkNodeData>>().WithNone<KruispuntVisueelGemaakt>().WithEntityAccess())
            {
                if (!aantalPerNode.TryGetValue(entity, out int aantal) || aantal < 2)
                    continue; // nog een doodlopend eindpunt -- volgende keer opnieuw proberen, niet taggen

                float breedte = breedtePerNode[entity];
                float straal = breedte * 0.5f + 1f;

                var pos = node.ValueRO.Positie;
                var wereldPositieVoorSample = new Vector3(pos.x, 0f, pos.z);
                float hoogte = terrain != null ? terrain.SampleHeight(wereldPositieVoorSample) + terrain.transform.position.y : pos.y;

                Mesh mesh = KruispuntVisualisatieUtility.BouwKruispuntMesh(straal);
                var go = new GameObject($"Kruispunt_{entity.Index}");
                go.transform.position = new Vector3(pos.x, hoogte + 0.06f, pos.z); // net boven de wegstrips (0.05f) tegen z-fighting
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                go.AddComponent<MeshRenderer>().sharedMaterial = WegVisualisatieUtility.GetOfMaakAsfaltMateriaal();

                toTag.Add(entity);
            }

            foreach (var e in toTag)
                em.AddComponent<KruispuntVisueelGemaakt>(e);

            toTag.Dispose();
            breedtePerNode.Dispose();
            aantalPerNode.Dispose();
        }

        static void Registreer(ref NativeHashMap<Entity, float> breedteMap, ref NativeHashMap<Entity, int> aantalMap, Entity node, float breedte)
        {
            if (node == Entity.Null) return;

            if (breedteMap.TryGetValue(node, out float huidigeBreedte))
                breedteMap[node] = math.max(huidigeBreedte, breedte);
            else
                breedteMap[node] = breedte;

            if (aantalMap.TryGetValue(node, out int huidigAantal))
                aantalMap[node] = huidigAantal + 1;
            else
                aantalMap[node] = 1;
        }
    }

    public static class KruispuntVisualisatieUtility
    {
        public static Mesh BouwKruispuntMesh(float straal, int segmenten = 12)
        {
            var verts = new List<Vector3> { Vector3.zero };
            var uvs = new List<Vector2> { new Vector2(0.5f, 0.5f) };

            for (int i = 0; i <= segmenten; i++)
            {
                float hoek = (float)i / segmenten * Mathf.PI * 2f;
                verts.Add(new Vector3(Mathf.Cos(hoek) * straal, 0f, Mathf.Sin(hoek) * straal));
                uvs.Add(new Vector2(Mathf.Cos(hoek) * 0.5f + 0.5f, Mathf.Sin(hoek) * 0.5f + 0.5f));
            }

            var tris = new List<int>();
            for (int i = 1; i <= segmenten; i++)
            {
                tris.Add(0);
                tris.Add(i);
                tris.Add(i + 1);
            }

            // Reken de daadwerkelijke normaal na i.p.v. op een aanname over de wiskunde te
            // vertrouwen, en draai om indien nodig -- zelfde bewuste voorzorg als bij de
            // kavel-grondvlakken.
            if (verts.Count >= 3)
            {
                Vector3 normaal = Vector3.Cross(verts[1] - verts[0], verts[2] - verts[0]);
                if (normaal.y < 0f)
                {
                    for (int i = 0; i < tris.Count; i += 3)
                        (tris[i + 1], tris[i + 2]) = (tris[i + 2], tris[i + 1]);
                }
            }

            var mesh = new Mesh { name = "KruispuntMesh" };
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.SetUVs(0, uvs);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
