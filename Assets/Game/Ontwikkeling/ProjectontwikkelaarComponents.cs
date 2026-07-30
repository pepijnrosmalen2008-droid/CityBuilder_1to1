using Unity.Collections;
using Unity.Entities;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Section 3. Distinct from CityBuilder.Prototype.Spike2's ProjectontwikkelaarData -- that
    /// one was disposable CPU-benchmark synthetic data, this is the real model.
    /// `voorkeursfuncties: Map<FunctieType, float>` becomes a buffer (see below), Maps aren't
    /// ECS-friendly.
    public struct ProjectontwikkelaarData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public FixedString64Bytes Naam;
        public RisicoProfiel RisicoProfiel;
        public float MinRendementseisPercentage; // hoger bij Speculatief, lager bij Conservatief
        public float Budget;
    }

    public struct VoorkeursfunctieBufferElement : IBufferElementData
    {
        public FunctieType Functie;
        public float Gewicht;
    }

    /// "actieve_biedingen: List<Reference<Bod>>" -- welke Bod-entities deze ontwikkelaar op dit
    /// moment openstaan heeft.
    public struct ActiefBodBufferElement : IBufferElementData
    {
        public Entity Bod;
    }

    public static class OntwikkelaarsProfielConstanten
    {
        // Sectie 3's eigen veldcommentaar: "hoger bij Speculatief, lager bij Conservatief".
        // Placeholder-cijfers -- retune zodra er echte marktdata/balans-tests zijn.
        public static float MinRendementseisVoor(RisicoProfiel profiel) => profiel switch
        {
            RisicoProfiel.Conservatief => 0.10f,
            RisicoProfiel.Gemiddeld => 0.15f,
            RisicoProfiel.Speculatief => 0.20f,
            _ => 0.15f,
        };
    }
}
