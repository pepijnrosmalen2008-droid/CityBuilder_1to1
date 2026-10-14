using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;
using CityBuilder.Game.Stad;
using CityBuilder.Game.Visualisatie.Procedureel;

namespace CityBuilder.Game.Visualisatie
{
    static class GebouwVisueelRegister
    {
        public sealed class Staat
        {
            public GameObject Bouwplaats;
            public Transform KraanGiek;
            public int KlareLagen = -1;
            public GameObject Gebouw;
        }

        public static readonly Dictionary<Entity, Staat> Staten = new Dictionary<Entity, Staat>();
        public static Transform Ouder;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset()
        {
            Staten.Clear();
            Ouder = null;
        }
    }

    /// Laat gebouwen zichtbaar groeien: eerst een bouwput met bouwhek, dan een betonnen casco
    /// dat verdieping voor verdieping omhoog gaat met steigers eromheen (en bij hoge gebouwen
    /// een torenkraan die rustig ronddraait). Bij oplevering wordt het echte gebouw neergezet.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct GebouwVisualisatieSystem : ISystem
    {
        int _frame;

        public void OnUpdate(ref SystemState state)
        {
            var em = state.EntityManager;
            if (GebouwVisueelRegister.Ouder == null)
                GebouwVisueelRegister.Ouder = new GameObject("Gebouwen").transform;

            float dt = SystemAPI.Time.DeltaTime;
            var gebouwen = new NativeList<Entity>(Allocator.Temp);
            foreach (var (g, entity) in SystemAPI.Query<RefRO<GebouwData>>().WithEntityAccess())
                gebouwen.Add(entity);

            foreach (var e in gebouwen)
            {
                var g = em.GetComponentData<GebouwData>(e);
                if (!GebouwVisueelRegister.Staten.TryGetValue(e, out var staat))
                {
                    staat = new GebouwVisueelRegister.Staat();
                    GebouwVisueelRegister.Staten[e] = staat;
                    WisBomen(g);
                }

                var buffer = em.GetBuffer<VerdiepingBufferElement>(e);
                int aantal = buffer.Length;

                if (!g.Klaar)
                {
                    int klaar = math.clamp((int)math.floor(g.BouwVoortgang * (aantal + 1)), 0, aantal);
                    if (klaar != staat.KlareLagen || staat.Bouwplaats == null)
                    {
                        if (staat.Bouwplaats != null) Object.Destroy(staat.Bouwplaats);
                        staat.Bouwplaats = GebouwMeshBouwer.BouwBouwplaats(g, Kopie(buffer), klaar, GebouwVisueelRegister.Ouder, out staat.KraanGiek);
                        staat.KlareLagen = klaar;
                    }
                    if (staat.KraanGiek != null)
                        staat.KraanGiek.Rotate(0f, Mathf.Sin(Time.time * 0.15f + e.Index) * dt * 14f, 0f, Space.World);
                }
                else if (staat.Gebouw == null)
                {
                    if (staat.Bouwplaats != null) Object.Destroy(staat.Bouwplaats);
                    staat.Bouwplaats = null;
                    staat.KraanGiek = null;
                    staat.Gebouw = GebouwMeshBouwer.BouwGebouw(g, Kopie(buffer), GebouwVisueelRegister.Ouder);
                }
            }
            gebouwen.Dispose();

            if (++_frame % 60 == 0 && GebouwVisueelRegister.Staten.Count > 0)
            {
                var weg = new List<Entity>();
                foreach (var kv in GebouwVisueelRegister.Staten)
                    if (!em.Exists(kv.Key)) weg.Add(kv.Key);
                foreach (var e in weg)
                {
                    var s = GebouwVisueelRegister.Staten[e];
                    if (s.Bouwplaats != null) Object.Destroy(s.Bouwplaats);
                    if (s.Gebouw != null) Object.Destroy(s.Gebouw);
                    GebouwVisueelRegister.Staten.Remove(e);
                }
            }
        }

        static VerdiepingBufferElement[] Kopie(DynamicBuffer<VerdiepingBufferElement> buffer)
        {
            var lagen = new VerdiepingBufferElement[buffer.Length];
            for (int i = 0; i < buffer.Length; i++)
                lagen[i] = buffer[i];
            return lagen;
        }

        static void WisBomen(in GebouwData g)
        {
            if (BoomBeheer.Instance == null) return;
            var voor = new Vector2(g.Voor.x, g.Voor.y).normalized;
            var langs = new Vector2(voor.y, -voor.x);
            BoomBeheer.Instance.WisInRechthoek(new Vector2(g.Centrum.x, g.Centrum.y), langs, voor, g.Breedte * 0.5f + 6f, g.Diepte * 0.5f + 6f);
        }
    }
}
