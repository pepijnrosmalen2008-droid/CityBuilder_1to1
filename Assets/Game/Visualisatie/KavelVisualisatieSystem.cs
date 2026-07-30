using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using UnityEngine;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Visualisatie
{
    /// Same bridge pattern as WegVisualisatieSystem: plain GameObject+mesh, create-once (no live
    /// re-sync on later status changes -- acceptable for now since nothing drives kavels through
    /// the status machine during Play except the one-shot bootstraps).
    public struct KavelVisueelGemaakt : IComponentData { }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct KavelVisualisatieSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var terrain = Terrain.activeTerrain;

            var toTag = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, entity) in SystemAPI.Query<RefRO<KavelCore>>().WithNone<KavelVisueelGemaakt>().WithEntityAccess())
            {
                if (state.EntityManager.HasBuffer<KavelGeometriePunt>(entity))
                {
                    var geometrie = state.EntityManager.GetBuffer<KavelGeometriePunt>(entity);
                    if (geometrie.Length >= 3)
                    {
                        Color? kleur = KavelVisualisatieUtility.KleurVoorStatus(kavel.ValueRO.Status);
                        if (kleur.HasValue)
                        {
                            Mesh grondMesh = KavelVisualisatieUtility.BouwGrondvlakMesh(geometrie, terrain);
                            var grondGo = new GameObject($"KavelGrond_{entity.Index}");
                            grondGo.AddComponent<MeshFilter>().sharedMesh = grondMesh;
                            grondGo.AddComponent<MeshRenderer>().sharedMaterial = KavelVisualisatieUtility.GetOfMaakGrondMateriaal(kleur.Value);
                        }

                        if (kavel.ValueRO.Status == KavelStatus.Bouwplaats || kavel.ValueRO.Status == KavelStatus.Bebouwd)
                            KavelVisualisatieUtility.BouwGebouwBox(kavel.ValueRO, geometrie, terrain, entity.Index);
                    }
                }

                toTag.Add(entity);
            }

            foreach (var e in toTag)
                state.EntityManager.AddComponent<KavelVisueelGemaakt>(e);

            toTag.Dispose();
        }
    }

    public static class KavelVisualisatieUtility
    {
        static readonly Dictionary<Color, Material> _grondMaterialen = new Dictionary<Color, Material>();
        static Material _gebouwMateriaal;
        const float MinimumBouwhoogte = 6f; // fallback als BouwhoogteMax nog niet is ingesteld

        /// Natuur krijgt bewust geen marker (blendt met het terrein, "onaangeroerde grond").
        public static Color? KleurVoorStatus(KavelStatus status) => status switch
        {
            KavelStatus.Natuur => null,
            KavelStatus.Landbouwgrond => new Color(0.75f, 0.70f, 0.45f),
            KavelStatus.BouwrijpGemaakt => new Color(0.50f, 0.35f, 0.20f),
            KavelStatus.Bouwkavel => new Color(0.90f, 0.55f, 0.15f),
            KavelStatus.Bouwplaats => new Color(0.55f, 0.55f, 0.55f),
            KavelStatus.Bebouwd => new Color(0.60f, 0.60f, 0.55f),
            KavelStatus.InHerontwikkeling => new Color(0.55f, 0.50f, 0.55f),
            _ => new Color(0.5f, 0.5f, 0.5f),
        };

        public static Material GetOfMaakGrondMateriaal(Color kleur)
        {
            if (_grondMaterialen.TryGetValue(kleur, out var bestaand))
                return bestaand;

            var shader = Shader.Find("Universal Render Pipeline/Lit");
            var mat = new Material(shader) { name = "KavelGrond_Placeholder" };
            mat.SetColor("_BaseColor", kleur);
            mat.SetFloat("_Smoothness", 0.1f);
            // Cull Off: de kavelgeometrie kan aan beide kanten van een weg met tegengestelde
            // winding-richting gegenereerd zijn (zie KavelGeneratieUtility -- de "zijkant"-vector
            // wordt voor de twee wegzijden gespiegeld). Dubbelzijdig renderen omzeilt dat risico
            // volledig i.p.v. per-kavel de winding te moeten narekenen.
            mat.SetFloat("_Cull", (float)UnityEngine.Rendering.CullMode.Off);
            _grondMaterialen[kleur] = mat;
            return mat;
        }

        public static Material GetOfMaakGebouwMateriaal()
        {
            if (_gebouwMateriaal != null)
                return _gebouwMateriaal;

            var shader = Shader.Find("Universal Render Pipeline/Lit");
            _gebouwMateriaal = new Material(shader) { name = "KavelGebouw_Placeholder" };
            _gebouwMateriaal.SetColor("_BaseColor", new Color(0.65f, 0.63f, 0.60f));
            _gebouwMateriaal.SetFloat("_Smoothness", 0.2f);
            return _gebouwMateriaal;
        }

        /// Fan-triangulatie vanaf punt 0 -- correct voor elke convexe polygon, ongeacht puntaantal
        /// (de huidige generator maakt altijd quads, maar dit blijft kloppen als dat verandert).
        public static Mesh BouwGrondvlakMesh(DynamicBuffer<KavelGeometriePunt> geometrie, Terrain terrain)
        {
            var verts = new List<Vector3>();
            var tris = new List<int>();
            var uvs = new List<Vector2>();

            for (int i = 0; i < geometrie.Length; i++)
            {
                var p = geometrie[i].Punt; // float2, x/z
                var wereldPositieVoorSample = new Vector3(p.x, 0f, p.y);
                float hoogte = terrain != null ? terrain.SampleHeight(wereldPositieVoorSample) + terrain.transform.position.y : 0f;
                verts.Add(new Vector3(p.x, hoogte + 0.03f, p.y));
                uvs.Add(new Vector2(p.x * 0.1f, p.y * 0.1f));
            }

            for (int i = 1; i < geometrie.Length - 1; i++)
            {
                tris.Add(0);
                tris.Add(i);
                tris.Add(i + 1);
            }

            // KavelGeneratieUtility mirrors its "naarBinnen"-vector for the two sides of a road,
            // so the resulting polygon winds one way on one side and the opposite way on the
            // other. Rather than trust a fixed winding assumption (or only the material's Cull
            // Off, which depends on the URP Lit shader actually exposing _Cull), measure the
            // built mesh's actual face normal and reverse every triangle if it points down.
            if (verts.Count >= 3)
            {
                Vector3 normaal = Vector3.Cross(verts[1] - verts[0], verts[2] - verts[0]);
                if (normaal.y < 0f)
                {
                    for (int i = 0; i < tris.Count; i += 3)
                        (tris[i + 1], tris[i + 2]) = (tris[i + 2], tris[i + 1]);
                }
            }

            var mesh = new Mesh { name = "KavelGrondMesh" };
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.SetUVs(0, uvs);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        public static void BouwGebouwBox(in KavelCore kavel, DynamicBuffer<KavelGeometriePunt> geometrie, Terrain terrain, int entityIndex)
        {
            Vector2 centroid = Vector2.zero;
            for (int i = 0; i < geometrie.Length; i++)
                centroid += new Vector2(geometrie[i].Punt.x, geometrie[i].Punt.y);
            centroid /= geometrie.Length;

            float hoogte = kavel.BouwhoogteMax > 0.5f ? kavel.BouwhoogteMax : MinimumBouwhoogte;
            float bebouwingsFractie = Mathf.Clamp01(kavel.BebouwingspercentageMax > 0f ? kavel.BebouwingspercentageMax / 100f : 0.5f);
            float footprint = Mathf.Sqrt(Mathf.Max(kavel.Oppervlakte, 1f) * bebouwingsFractie);

            var wereldPositieVoorSample = new Vector3(centroid.x, 0f, centroid.y);
            float grondHoogte = terrain != null ? terrain.SampleHeight(wereldPositieVoorSample) + terrain.transform.position.y : 0f;

            var go = new GameObject($"KavelGebouw_{entityIndex}");
            go.transform.position = new Vector3(centroid.x, grondHoogte + hoogte * 0.5f, centroid.y);
            go.transform.localScale = new Vector3(footprint, hoogte, footprint);

            go.AddComponent<MeshFilter>().sharedMesh = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            go.AddComponent<MeshRenderer>().sharedMaterial = GetOfMaakGebouwMateriaal();
        }
    }
}
