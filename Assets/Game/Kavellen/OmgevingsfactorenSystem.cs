using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Kavellen
{
    /// Section 5+6: omgevingsfactoren are recomputed periodically per district (not per-kavel-
    /// per-frame), then each kavel cheaply blends in its own local, already-per-kavel-stored
    /// voorziening-afstanden. Only BereikbaarheidScore and GeluidsbelastingDb are recomputed
    /// dynamically here -- those are the two factors section 5/6 gives a concrete "afgeleid van
    /// X" definition for using data this doc's scope actually has. UitzichtScore,
    /// LuchtkwaliteitIndex, OverstromingsrisicoScore and Bodemkwaliteit stay whatever they were
    /// set to at kavel creation until a terrain/water/traffic data source exists to drive them.
    public partial struct OmgevingsfactorenSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<OmgevingstickData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            var tickEntity = SystemAPI.GetSingletonEntity<OmgevingstickData>();
            var tick = SystemAPI.GetComponentRW<OmgevingstickData>(tickEntity);

            double now = SystemAPI.Time.ElapsedTime;
            if (now < tick.ValueRO.VolgendeTick)
                return;
            tick.ValueRW.VolgendeTick = now + tick.ValueRO.TickIntervalSeconden;

            RecomputeDistricts(ref state);
            RecomputeKavels(ref state);
        }

        void RecomputeDistricts(ref SystemState state)
        {
            var totals = new NativeHashMap<int, int>(16, Allocator.Temp);
            var bebouwd = new NativeHashMap<int, int>(16, Allocator.Temp);
            var industrie = new NativeHashMap<int, int>(16, Allocator.Temp);
            var functieAandelenLookup = SystemAPI.GetBufferLookup<FunctieAandeelBufferElement>(true);

            foreach (var kavel in SystemAPI.Query<RefRO<KavelCore>>())
            {
                int id = kavel.ValueRO.DistrictId;
                Increment(ref totals, id);

                if (kavel.ValueRO.Status == KavelStatus.Bebouwd || kavel.ValueRO.Status == KavelStatus.InHerontwikkeling)
                    Increment(ref bebouwd, id);

                if (kavel.ValueRO.Bestemmingsplan != Entity.Null && functieAandelenLookup.HasBuffer(kavel.ValueRO.Bestemmingsplan))
                {
                    var functies = functieAandelenLookup[kavel.ValueRO.Bestemmingsplan];
                    for (int i = 0; i < functies.Length; i++)
                    {
                        if (functies[i].Functie == FunctieType.Industrie)
                        {
                            Increment(ref industrie, id);
                            break;
                        }
                    }
                }
            }

            foreach (var district in SystemAPI.Query<RefRW<DistrictData>>())
            {
                int id = district.ValueRO.DistrictId;
                int total = totals.TryGetValue(id, out var t) ? t : 0;
                int beb = bebouwd.TryGetValue(id, out var b) ? b : 0;
                int ind = industrie.TryGetValue(id, out var i) ? i : 0;

                district.ValueRW.BebouwingsgraadBasis = total > 0 ? (float)beb / total : 0f;
                district.ValueRW.IndustrieAandeelBasis = total > 0 ? (float)ind / total : 0f;
            }

            totals.Dispose();
            bebouwd.Dispose();
            industrie.Dispose();
        }

        static void Increment(ref NativeHashMap<int, int> map, int key)
        {
            if (map.TryGetValue(key, out int val))
                map[key] = val + 1;
            else
                map.Add(key, 1);
        }

        void RecomputeKavels(ref SystemState state)
        {
            var districtLookup = new NativeHashMap<int, DistrictData>(16, Allocator.Temp);
            foreach (var district in SystemAPI.Query<RefRO<DistrictData>>())
                districtLookup.TryAdd(district.ValueRO.DistrictId, district.ValueRO);

            var toMarkDirty = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, omgeving, voorzieningen, entity) in
                     SystemAPI.Query<RefRO<KavelCore>, RefRW<OmgevingsfactorenData>, DynamicBuffer<VoorzieningAfstandBufferElement>>()
                         .WithEntityAccess())
            {
                if (!districtLookup.TryGetValue(kavel.ValueRO.DistrictId, out var district))
                    continue;

                float avgAfstand = GemiddeldeVoorzieningAfstand(voorzieningen);
                float bereikbaarheid = math.clamp(1f - avgAfstand / 2000f, 0f, 1f); // 2km = nauwelijks bereikbaar
                float geluid = 40f + district.IndustrieAandeelBasis * 40f;          // 40dB rustig -> 80dB zwaar industrieel

                bool gewijzigd = math.abs(omgeving.ValueRO.BereikbaarheidScore - bereikbaarheid) > 0.001f
                    || math.abs(omgeving.ValueRO.GeluidsbelastingDb - geluid) > 0.001f;

                if (gewijzigd)
                {
                    omgeving.ValueRW.BereikbaarheidScore = bereikbaarheid;
                    omgeving.ValueRW.GeluidsbelastingDb = geluid;
                    toMarkDirty.Add(entity);
                }
            }

            foreach (var e in toMarkDirty)
                if (!state.EntityManager.HasComponent<GrondwaardeDirty>(e))
                    state.EntityManager.AddComponent<GrondwaardeDirty>(e);

            toMarkDirty.Dispose();
            districtLookup.Dispose();
        }

        static float GemiddeldeVoorzieningAfstand(DynamicBuffer<VoorzieningAfstandBufferElement> voorzieningen)
        {
            if (voorzieningen.Length == 0)
                return 2000f;

            float som = 0f;
            for (int i = 0; i < voorzieningen.Length; i++)
                som += voorzieningen[i].AfstandMeter;
            return som / voorzieningen.Length;
        }
    }
}
