using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.WaterEnLandschap
{
    /// Section 1's WaterpeilBalans + MeerVervalStatus, placeholder-cijfers (geen hydrologische
    /// referentie) -- retune zodra er echte terrein-gedreven afvoer/verdamping-data bestaat.
    public static class WaterBalansConstanten
    {
        public const float NatuurlijkeAfvoerBasis = 1f;       // m3/tick, staat in voor terrein-gedreven drainage
        public const float VerdampingsCoefficient = 0.0005f;   // m3 per m2 oppervlakte per tick
        public const float PeilAanpassingsFactor = 0.02f;       // hoe snel het peil reageert op netto instroom/uitstroom
    }

    /// Combineert twee triggers in één systeem, precies zoals sectie 1 vraagt: WaterpeilDirty
    /// geeft een onmiddellijke herberekening (bron/pomp/terreinwijziging), de trage periodieke
    /// tick dekt de "eens per in-game dag/week"-verdamping/verval af voor lichamen die verder
    /// niets aan de hand hebben. Geen per-frame simulatie in beide gevallen.
    ///
    /// Bekende beperking: bij het verwijderen van een uitgedroogd SpelerGecreeerd-lichaam worden
    /// verwijzingen ernaartoe (VerbondenLichaamBufferElement op andere lichamen, WaterBron.
    /// ResultLichaam) niet automatisch opgeruimd -- dat is een cascaderende-referentie-probleem
    /// dat een aparte pas verdient zodra er echt meerdere verbonden lichamen bestaan.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct WaterpeilBalansSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<WaterTickData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            var tickEntity = SystemAPI.GetSingletonEntity<WaterTickData>();
            var tick = SystemAPI.GetComponentRW<WaterTickData>(tickEntity);

            double now = SystemAPI.Time.ElapsedTime;
            bool periodiekeTick = now >= tick.ValueRO.VolgendeTick;
            if (periodiekeTick)
                tick.ValueRW.VolgendeTick = now + tick.ValueRO.TickIntervalSeconden;

            var instroomPerLichaam = new NativeHashMap<Entity, float>(16, Allocator.Temp);
            var uitstroomPerLichaam = new NativeHashMap<Entity, float>(16, Allocator.Temp);

            foreach (var bron in SystemAPI.Query<RefRO<WaterBronData>>())
            {
                if (!bron.ValueRO.Actief || bron.ValueRO.ResultLichaam == Entity.Null)
                    continue;
                AddTo(ref instroomPerLichaam, bron.ValueRO.ResultLichaam, bron.ValueRO.Debiet);
            }

            foreach (var pomp in SystemAPI.Query<RefRO<PompstationData>>())
            {
                if (pomp.ValueRO.BronWaterlichaam == Entity.Null)
                    continue;
                AddTo(ref uitstroomPerLichaam, pomp.ValueRO.BronWaterlichaam, pomp.ValueRO.Onttrekking);
            }

            var teVerwijderen = new NativeList<Entity>(Allocator.Temp);
            var toClearDirty = new NativeList<Entity>(Allocator.Temp);

            foreach (var (water, entity) in SystemAPI.Query<RefRW<WaterLichaamData>>().WithEntityAccess())
            {
                bool isDirty = state.EntityManager.HasComponent<WaterpeilDirty>(entity);
                if (!isDirty && !periodiekeTick)
                    continue;
                if (isDirty)
                    toClearDirty.Add(entity);

                // KaartStandaard: vast peil, punt uit -- instroom/onttrekking hebben geen effect,
                // ongeacht de hoeveelheid (sectie 1).
                if (water.ValueRO.Oorsprong == WaterOorsprong.KaartStandaard)
                    continue;

                float instroom = instroomPerLichaam.TryGetValue(entity, out var inw) ? inw : 0f;
                float uitstroomPompen = uitstroomPerLichaam.TryGetValue(entity, out var uitw) ? uitw : 0f;

                float netto;
                if (instroom > 0f)
                {
                    netto = instroom - (WaterBalansConstanten.NatuurlijkeAfvoerBasis + uitstroomPompen);
                }
                else
                {
                    // MeerVervalStatus: geen instroom -> verdamping + eventuele onttrekking doen het peil dalen.
                    float verdamping = water.ValueRO.OppervlakteM2 * WaterBalansConstanten.VerdampingsCoefficient;
                    netto = -(verdamping + uitstroomPompen);
                }

                float nieuwPeil = math.max(0f, water.ValueRO.Waterpeil + netto * WaterBalansConstanten.PeilAanpassingsFactor);
                water.ValueRW.Waterpeil = nieuwPeil;

                if (nieuwPeil <= 0f && instroom <= 0f)
                    teVerwijderen.Add(entity); // volume = 0 -> waterlichaam verwijderd, terrein wordt droog land
            }

            foreach (var e in toClearDirty)
                state.EntityManager.RemoveComponent<WaterpeilDirty>(e);

            foreach (var e in teVerwijderen)
                state.EntityManager.DestroyEntity(e);

            teVerwijderen.Dispose();
            toClearDirty.Dispose();
            instroomPerLichaam.Dispose();
            uitstroomPerLichaam.Dispose();
        }

        static void AddTo(ref NativeHashMap<Entity, float> map, Entity key, float waarde)
        {
            if (map.TryGetValue(key, out float bestaand))
                map[key] = bestaand + waarde;
            else
                map.Add(key, waarde);
        }
    }
}
