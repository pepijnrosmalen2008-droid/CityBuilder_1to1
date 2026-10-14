using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Stad
{
    /// Telt twee keer per seconde de hele stad op: inwoners, woningen, banen per sector,
    /// beroepsbevolking en werkloosheid. Daaruit volgt de vraag per categorie, die weer bepaalt
    /// wat er gebouwd wordt (GebouwGroeiSystem) -- de kringloop van CS's RCI-vraag, maar met
    /// echte verhoudingen i.p.v. abstracte punten.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct BevolkingSystem : ISystem
    {
        float _accumulator;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<StadStatistiekData>();
            state.RequireForUpdate<StadVraagData>();
        }

        public void OnUpdate(ref SystemState state)
        {
            _accumulator += SystemAPI.Time.DeltaTime;
            if (_accumulator < 0.5f)
                return;
            _accumulator = 0f;

            float inwoners = 0f, banenD = 0f, banenH = 0f, banenK = 0f, banenI = 0f, banenO = 0f;
            int woningen = 0, klaar = 0, inAanbouw = 0;

            foreach (var (gebouw, cap) in SystemAPI.Query<RefRO<GebouwData>, RefRO<GebouwCapaciteitData>>())
            {
                if (!gebouw.ValueRO.Klaar)
                {
                    inAanbouw++;
                    continue;
                }

                klaar++;
                float b = gebouw.ValueRO.Bezetting;
                var c = cap.ValueRO;
                inwoners += c.Bewoners * b;
                woningen += c.Woningen;
                banenD += c.BanenDetailhandel * b;
                banenH += c.BanenHoreca * b;
                banenK += c.BanenKantoor * b;
                banenI += c.BanenIndustrie * b;
                banenO += c.BanenOverig * b;
            }

            float banen = banenD + banenH + banenK + banenI + banenO;
            float beroeps = inwoners * FunctieKengetallen.BeroepsbevolkingAandeel;
            float werkenden = math.min(beroeps, banen);
            float werkloosheid = beroeps > 1f ? (beroeps - werkenden) / beroeps : 0f;

            SystemAPI.SetSingleton(new StadStatistiekData
            {
                Inwoners = (int)math.round(inwoners),
                Woningen = woningen,
                Beroepsbevolking = (int)math.round(beroeps),
                Werkenden = (int)math.round(werkenden),
                Werkloosheid = werkloosheid,
                BanenTotaal = (int)math.round(banen),
                BanenDetailhandel = (int)math.round(banenD),
                BanenHoreca = (int)math.round(banenH),
                BanenKantoor = (int)math.round(banenK),
                BanenIndustrie = (int)math.round(banenI),
                BanenOverig = (int)math.round(banenO),
                GebouwenKlaar = klaar,
                GebouwenInAanbouw = inAanbouw,
            });

            // Wonen: trekt aan zolang er meer banen dan werkenden zijn, zakt bij werkloosheid.
            float wonen = 0.55f + (banen - beroeps) / math.max(150f, beroeps + banen) * 1.2f - werkloosheid * 1.5f;
            // Winkels en horeca: grofweg één arbeidsplaats per 12 inwoners.
            float doelD = inwoners / 12f;
            float detailhandel = 0.1f + (doelD - (banenD + banenH)) / math.max(10f, doelD);
            // Kantoren ~30% en industrie ~15% van de beroepsbevolking; werkloosheid duwt beide op.
            float doelK = beroeps * 0.30f;
            float kantoor = 0.05f + (doelK - banenK) / math.max(25f, doelK) + werkloosheid;
            float doelI = beroeps * 0.15f;
            float industrie = 0.15f + (doelI - banenI) / math.max(25f, doelI) + werkloosheid;

            SystemAPI.SetSingleton(new StadVraagData
            {
                Wonen = math.saturate(wonen),
                Detailhandel = math.saturate(detailhandel),
                Kantoor = math.saturate(kantoor),
                Industrie = math.saturate(industrie),
            });
        }
    }
}
