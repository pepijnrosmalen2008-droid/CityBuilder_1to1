using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace CityBuilder.Game.WaterEnLandschap
{
    /// NOT a gameplay feature -- same purpose as the Kavel/Wegennetwerk bootstraps: a small
    /// example setup to confirm water/landscaping/grondlogistiek compiles and interoperates.
    /// The water-balance/verval part unfolds over real ticks (WaterTickData.TickIntervalSeconden
    /// below), so unlike the pure-utility checks this one can't log a pass/fail synchronously --
    /// inspect the Meer_SpelerGecreeerd entity's WaterLichaamData.Waterpeil in the Entities
    /// Hierarchy/Inspector a few seconds after entering Play mode instead.
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct WaterEnLandschapTestBootstrap : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            var em = state.EntityManager;

            Entity tick = em.CreateEntity(typeof(WaterTickData));
            em.SetComponentData(tick, new WaterTickData { VolgendeTick = 0, TickIntervalSeconden = 5.0 });

            Entity zee = MaakWaterLichaam(em, "Zee_KaartStandaard", WaterLichaamType.Zee, WaterOorsprong.KaartStandaard, waterpeil: 0f, oppervlakteM2: 1_000_000f);
            Entity meer = MaakWaterLichaam(em, "Meer_SpelerGecreeerd", WaterLichaamType.Meer, WaterOorsprong.SpelerGecreeerd, waterpeil: 5f, oppervlakteM2: 2000f);

            // Voedt zowel de Zee (moet effectloos blijven, KaartStandaard) als het Meer
            // (moet het peil laten stijgen, SpelerGecreeerd).
            MaakWaterBron(em, new float3(0, 0, 0), debiet: 500f, resultLichaam: zee);
            MaakWaterBron(em, new float3(50, 0, 0), debiet: 10f, resultLichaam: meer);
            MaakPompstation(em, meer, onttrekking: 3f, new float3(60, 0, 0));

            em.AddComponent<WaterpeilDirty>(meer);
            // Zee heeft geen WaterpeilDirty nodig om de "geen effect"-regel te tonen -- die geldt
            // sowieso, ongeacht triggers, per sectie 1's KaartStandaard-uitleg.

            Debug.Log("[WaterEnLandschapTestBootstrap] Water-opzet klaar. Controleer na een paar seconden in de " +
                      "Inspector: Zee_KaartStandaard.Waterpeil moet 0 blijven ondanks de bron met debiet 500; " +
                      "Meer_SpelerGecreeerd.Waterpeil moet stijgen (instroom 10 > afvoer+onttrekking).");

            VerifieerLandschapKosten();
            VerifieerGrondlogistiek(em);
            VerifieerGevolgenHooks();
        }

        static void VerifieerLandschapKosten()
        {
            float voorraad = 100f;
            var verhoging = LandschapKostenUtility.VoerVerhogingUit(ref voorraad, benodigdVolumeM3: 150f);
            // 100 uit voorraad, 50 tekort -> 50 * 18 = 900 kosten, voorraad eindigt op 0.
            Debug.Log($"[WaterEnLandschapTestBootstrap] Verhoging-check: kosten = {verhoging.Kosten} (verwacht 900), " +
                      $"resterende voorraad = {voorraad} (verwacht 0).");

            var verlaging = LandschapKostenUtility.VoerVerlagingUit(ref voorraad, vrijgekomenVolumeM3: 30f);
            Debug.Log($"[WaterEnLandschapTestBootstrap] Verlaging-check: voorraad na afgraven = {voorraad} (verwacht 30), kosten = {verlaging.Kosten} (verwacht 0).");

            float opbrengst = LandschapKostenUtility.VerkoopUitVoorraad(ref voorraad, volumeM3: 20f);
            Debug.Log($"[WaterEnLandschapTestBootstrap] Verkoop-check: opbrengst = {opbrengst} (verwacht 200), resterende voorraad = {voorraad} (verwacht 10).");
        }

        static void VerifieerGrondlogistiek(EntityManager em)
        {
            Entity opslagA = MaakGrondopslag(em, districtId: 0, positie: new float3(0, 0, 0), huidigeVoorraad: 200f);
            Entity opslagB = MaakGrondopslag(em, districtId: 1, positie: new float3(500, 0, 0), huidigeVoorraad: 20f);

            const float transportVolume = 60f;
            int vrachtwagens = GrondTransportUtility.BerekenIngezetteVrachtwagens(transportVolume);

            Entity opdracht = em.CreateEntity(typeof(GrondTransportOpdrachtData));
            em.SetComponentData(opdracht, new GrondTransportOpdrachtData
            {
                Van = opslagA,
                Naar = opslagB,
                VolumeM3 = transportVolume,
                IngezetteVrachtwagens = vrachtwagens,
                Status = TransportStatus.Aangevraagd,
            });

            Debug.Log($"[WaterEnLandschapTestBootstrap] Grondtransport-check: {transportVolume}m3 -> {vrachtwagens} vrachtwagens " +
                      $"(laadcapaciteit {GrondTransportUtility.StandaardLaadcapaciteitPerVrachtwagen}m3/stuk, verwacht {math.ceil(transportVolume / GrondTransportUtility.StandaardLaadcapaciteitPerVrachtwagen)}).");

            Entity importOpdracht = em.CreateEntity(typeof(GrondImportOpdrachtData));
            em.SetComponentData(importOpdracht, new GrondImportOpdrachtData
            {
                Naar = opslagB,
                VolumeM3 = 40f,
                Kosten = 40f * LandschapKostenUtility.StandaardAankoopprijsPerM3 * 1.5f, // hogere prijs dan intern, placeholder-opslag
                Aanvoerpunt = Entity.Null, // placeholder totdat een echt kaartrand-knooppunt bestaat
                Status = TransportStatus.Aangevraagd,
            });
        }

        static void VerifieerGevolgenHooks()
        {
            bool teSteil = LandschapGevolgenUtility.IsHellingTeSteil(hellingGraden: 35f, maxToegestaneHellingGraden: 30f);
            float risicoBijdrage = LandschapGevolgenUtility.BerekenOverstromingsrisicoBijdrage(waterpeilStijgingMeter: 2f, afstandTotKavelMeter: 50f, maxInvloedsAfstandMeter: 200f);

            Debug.Log($"[WaterEnLandschapTestBootstrap] Gevolgen-hooks-check: helling 35 graden te steil voor max 30 = {teSteil} (verwacht true), " +
                      $"overstromingsrisico-bijdrage = {risicoBijdrage:0.00} (0-1 schaal, dichterbij + hogere peilstijging = hoger).");
        }

        static Entity MaakWaterLichaam(EntityManager em, string naam, WaterLichaamType type, WaterOorsprong oorsprong, float waterpeil, float oppervlakteM2)
        {
            Entity lichaam = em.CreateEntity(typeof(WaterLichaamData));
            em.SetComponentData(lichaam, new WaterLichaamData
            {
                Id = new Unity.Entities.Hash128((uint)lichaam.Index, 3, 0, 0),
                Type = type,
                Waterpeil = waterpeil,
                OppervlakteM2 = oppervlakteM2,
                Oorsprong = oorsprong,
                WaterpeilDynamisch = oorsprong == WaterOorsprong.SpelerGecreeerd,
                HeeftStroomrichting = false,
                Stroomrichting = float2.zero,
            });
            return lichaam;
        }

        static Entity MaakWaterBron(EntityManager em, float3 positie, float debiet, Entity resultLichaam)
        {
            Entity bron = em.CreateEntity(typeof(WaterBronData));
            em.SetComponentData(bron, new WaterBronData
            {
                Id = new Unity.Entities.Hash128((uint)bron.Index, 4, 0, 0),
                Positie = positie,
                Debiet = debiet,
                Actief = true,
                ResultLichaam = resultLichaam,
            });
            return bron;
        }

        static Entity MaakPompstation(EntityManager em, Entity bronWaterlichaam, float onttrekking, float3 positie)
        {
            Entity pomp = em.CreateEntity(typeof(PompstationData));
            em.SetComponentData(pomp, new PompstationData
            {
                BronWaterlichaam = bronWaterlichaam,
                Onttrekking = onttrekking,
                Positie = positie,
                Bereik = 200f,
                Capaciteit = 50f,
                GekoppeldAanNet = Entity.Null,
            });
            return pomp;
        }

        static Entity MaakGrondopslag(EntityManager em, int districtId, float3 positie, float huidigeVoorraad)
        {
            Entity opslag = em.CreateEntity(typeof(GrondopslagData));
            em.SetComponentData(opslag, new GrondopslagData
            {
                Id = new Unity.Entities.Hash128((uint)opslag.Index, 5, 0, 0),
                DistrictId = districtId,
                Positie = positie,
                Capaciteit = 500f,
                HuidigeVoorraad = huidigeVoorraad,
                AankoopprijsPerM3 = LandschapKostenUtility.StandaardAankoopprijsPerM3,
                VerkoopprijsPerM3 = LandschapKostenUtility.StandaardVerkoopprijsPerM3,
                AantalVrachtwagens = 3,
                GekoppeldWegsegment = Entity.Null,
            });
            return opslag;
        }
    }
}
