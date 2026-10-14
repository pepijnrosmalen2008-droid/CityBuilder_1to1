using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Stad;
using CityBuilder.Game.Wegennetwerk;
using CityBuilder.Game.Visualisatie.Procedureel;

namespace CityBuilder.Game.Visualisatie
{
    public struct KavelVisueelGemaakt : IComponentData { }

    /// Zone-overlay zoals in CS: alleen zichtbaar terwijl de speler zoneert, dan krijgt elke
    /// kavel een gekleurd raster (wit = nog niet gezoneerd). Buiten de zone-modus is een lege
    /// kavel gewoon natuurlijk terrein; zodra er gebouwd is, krijgt hij een tuin (wonen) of
    /// verharding (winkels, kantoren, bedrijven).
    public static class ZoneWeergave
    {
        public static bool OverlayZichtbaar;

        public static Color Kleur(ZoneType zone) => zone switch
        {
            ZoneType.WonenLaag => new Color(0.45f, 0.90f, 0.35f, 0.55f),
            ZoneType.WonenHoog => new Color(0.10f, 0.60f, 0.25f, 0.6f),
            ZoneType.Gemengd => new Color(0.25f, 0.60f, 1.00f, 0.55f),
            ZoneType.Kantoor => new Color(0.65f, 0.45f, 1.00f, 0.55f),
            ZoneType.Industrie => new Color(1.00f, 0.80f, 0.15f, 0.55f),
            _ => new Color(1f, 1f, 1f, 0.3f),
        };

        public static Material Materiaal(ZoneType zone) => Materialen.Overlay("zone_" + zone, Kleur(zone), ProcTex.ZoneRaster());
    }

    static class KavelVisueelRegister
    {
        public sealed class Staat
        {
            public GameObject Overlay;
            public MeshRenderer OverlayRenderer;
            public GameObject Grond;
        }

        public static readonly Dictionary<Entity, Staat> Staten = new Dictionary<Entity, Staat>();
        public static Transform Ouder;
        public static bool LaatsteZichtbaar;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset()
        {
            Staten.Clear();
            Ouder = null;
            LaatsteZichtbaar = false;
        }

        public static void Verwijder(Entity e)
        {
            if (!Staten.TryGetValue(e, out var s)) return;
            if (s.Overlay != null) Object.Destroy(s.Overlay);
            if (s.Grond != null) Object.Destroy(s.Grond);
            Staten.Remove(e);
        }
    }

    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct KavelVisualisatieSystem : ISystem
    {
        int _frame;

        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;
            if (KavelVisueelRegister.Ouder == null)
                KavelVisueelRegister.Ouder = new GameObject("Kavels").transform;

            // 1. Nieuwe kavels: overlay klaarzetten (verborgen tot de zone-modus aan gaat).
            var nieuw = new NativeList<Entity>(Allocator.Temp);
            foreach (var (core, entity) in SystemAPI.Query<RefRO<KavelCore>>().WithNone<KavelVisueelGemaakt>().WithEntityAccess())
                nieuw.Add(entity);
            foreach (var e in nieuw)
            {
                var staat = new KavelVisueelRegister.Staat();
                var mesh = BouwKavelMesh(em, e, 0.35f, 1f, out var midden);
                if (mesh != null)
                {
                    staat.Overlay = new GameObject("ZoneOverlay");
                    staat.Overlay.transform.SetParent(KavelVisueelRegister.Ouder, false);
                    staat.Overlay.transform.position = midden;
                    staat.Overlay.AddComponent<MeshFilter>().sharedMesh = mesh;
                    staat.OverlayRenderer = staat.Overlay.AddComponent<MeshRenderer>();
                    staat.OverlayRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    staat.OverlayRenderer.receiveShadows = false;
                    staat.OverlayRenderer.sharedMaterial = ZoneWeergave.Materiaal(ZoneVan(em, e));
                    staat.Overlay.SetActive(ZoneWeergave.OverlayZichtbaar);
                }
                KavelVisueelRegister.Staten[e] = staat;
                em.AddComponent<KavelVisueelGemaakt>(e);
            }
            nieuw.Dispose();

            // 2. Zone gewijzigd: kleur bijwerken.
            var dirty = new NativeList<Entity>(Allocator.Temp);
            foreach (var (core, entity) in SystemAPI.Query<RefRO<KavelCore>>().WithAll<ZoneVisueelDirty>().WithEntityAccess())
                dirty.Add(entity);
            foreach (var e in dirty)
            {
                if (KavelVisueelRegister.Staten.TryGetValue(e, out var staat) && staat.OverlayRenderer != null)
                    staat.OverlayRenderer.sharedMaterial = ZoneWeergave.Materiaal(ZoneVan(em, e));
                em.RemoveComponent<ZoneVisueelDirty>(e);
            }
            dirty.Dispose();

            // 3. Bebouwde kavels krijgen hun tuin of verharding.
            var bebouwd = new NativeList<Entity>(Allocator.Temp);
            foreach (var (core, entity) in SystemAPI.Query<RefRO<KavelCore>>().WithAll<KavelVisueelGemaakt>().WithEntityAccess())
            {
                if (core.ValueRO.Status == KavelStatus.Bebouwd
                    && KavelVisueelRegister.Staten.TryGetValue(entity, out var staat) && staat.Grond == null)
                    bebouwd.Add(entity);
            }
            foreach (var e in bebouwd)
            {
                var zone = ZoneVan(em, e);
                Material mat;
                float tegel;
                switch (zone)
                {
                    case ZoneType.WonenLaag:
                    case ZoneType.WonenHoog:
                        mat = Materialen.Tuin; tegel = 6f; break;
                    case ZoneType.Industrie:
                        mat = Materialen.Asfalt; tegel = 4f; break;
                    default:
                        mat = Materialen.Erfverharding; tegel = 1.8f; break;
                }
                var mesh = BouwKavelMesh(em, e, 0.035f, tegel, out var midden);
                var staat = KavelVisueelRegister.Staten[e];
                staat.Grond = new GameObject("KavelGrond");
                staat.Grond.transform.SetParent(KavelVisueelRegister.Ouder, false);
                staat.Grond.transform.position = midden;
                if (mesh != null)
                {
                    staat.Grond.AddComponent<MeshFilter>().sharedMesh = mesh;
                    var r = staat.Grond.AddComponent<MeshRenderer>();
                    r.sharedMaterial = mat;
                    r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }
            }
            bebouwd.Dispose();

            // 4. Overlay aan/uit als de zone-modus wisselt.
            if (KavelVisueelRegister.LaatsteZichtbaar != ZoneWeergave.OverlayZichtbaar)
            {
                KavelVisueelRegister.LaatsteZichtbaar = ZoneWeergave.OverlayZichtbaar;
                foreach (var kv in KavelVisueelRegister.Staten)
                    if (kv.Value.Overlay != null) kv.Value.Overlay.SetActive(ZoneWeergave.OverlayZichtbaar);
            }

            // 5. Opruimen van kavels die verwijderd zijn (bijv. door een nieuwe weg).
            if (++_frame % 30 == 0 && KavelVisueelRegister.Staten.Count > 0)
            {
                var weg = new List<Entity>();
                foreach (var kv in KavelVisueelRegister.Staten)
                    if (!em.Exists(kv.Key)) weg.Add(kv.Key);
                foreach (var e in weg)
                    KavelVisueelRegister.Verwijder(e);
            }
        }

        static ZoneType ZoneVan(EntityManager em, Entity kavel) =>
            em.HasComponent<KavelZoneData>(kavel) ? em.GetComponentData<KavelZoneData>(kavel).Zone : ZoneType.Geen;

        /// Over het terrein gedrapeerd raster over het bebouwbare deel van de kavel (vanaf de
        /// rand van de eigen weg tot de achtergrens). Vertices relatief aan `midden`.
        static Mesh BouwKavelMesh(EntityManager em, Entity kavel, float ophoging, float tegel, out Vector3 midden)
        {
            midden = Vector3.zero;
            if (!em.HasBuffer<KavelGeometriePunt>(kavel))
                return null;
            var geo = em.GetBuffer<KavelGeometriePunt>(kavel);
            if (geo.Length < 4)
                return null;

            float2 p0 = geo[0].Punt, p1 = geo[1].Punt, p2 = geo[2].Punt, p3 = geo[3].Punt;
            float diepte = math.distance(p0, p3);
            if (diepte < 1f)
                return null;
            var core = em.GetComponentData<KavelCore>(kavel);
            float wegHalf = math.min(WegProfielUtility.HalveBreedte(em, core.Ontsluiting) + 0.3f, diepte * 0.5f);
            float2 n0 = math.normalize(p3 - p0), n1 = math.normalize(p2 - p1);
            float2 v0 = p0 + n0 * wegHalf, v1 = p1 + n1 * wegHalf;

            float2 c = (v0 + v1 + p2 + p3) * 0.25f;
            midden = new Vector3(c.x, TerreinHoogte.Op(c.x, c.y), c.y);

            const int nx = 4, nz = 8;
            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            for (int j = 0; j <= nz; j++)
            {
                float t = (float)j / nz;
                float2 links = math.lerp(v0, p3, t), rechts = math.lerp(v1, p2, t);
                for (int i = 0; i <= nx; i++)
                {
                    float2 q = math.lerp(links, rechts, (float)i / nx);
                    float y = TerreinHoogte.Op(q.x, q.y) + ophoging;
                    verts.Add(new Vector3(q.x - midden.x, y - midden.y, q.y - midden.z));
                    uvs.Add(tegel >= 1f && tegel != 1f ? new Vector2(q.x, q.y) / tegel : new Vector2((float)i / nx, t));
                }
            }

            var tris = new List<int>();
            int rij = nx + 1;
            for (int j = 0; j < nz; j++)
            {
                for (int i = 0; i < nx; i++)
                {
                    int a = j * rij + i, b = a + 1, d = a + rij, e = d + 1;
                    tris.Add(a); tris.Add(e); tris.Add(b);
                    tris.Add(a); tris.Add(d); tris.Add(e);
                }
            }

            // Zichtbare kant omhoog laten wijzen, ongeacht de draairichting van de kavel.
            Vector3 normaal = Vector3.Cross(verts[tris[1]] - verts[tris[0]], verts[tris[2]] - verts[tris[0]]);
            if (normaal.y < 0f)
            {
                for (int i = 0; i < tris.Count; i += 3)
                    (tris[i + 1], tris[i + 2]) = (tris[i + 2], tris[i + 1]);
            }

            var mesh = new Mesh { name = "Kavel" };
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateTangents();
            mesh.RecalculateBounds();
            return mesh;
        }
    }
}
