using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace CityBuilder.Game.Kavellen
{
    /// Section 2: a Bestemmingsplan is its own entity, decoupled from any single Kavel -- many
    /// kavels reference the same plan (KavelCore.Bestemmingsplan).
    public struct BestemmingsplanData : IComponentData
    {
        public FixedString64Bytes Naam;
        public bool HeeftLooptijd;
        public double LooptijdStartDag;  // alleen betekenisvol als HeeftLooptijd
        public double LooptijdEindDag;
    }

    public struct BestemmingsplanGebiedPunt : IBufferElementData
    {
        public float2 Punt;
    }

    public struct FunctieAandeelBufferElement : IBufferElementData
    {
        public FunctieType Functie;
        public float MinPercentage;
        public float MaxPercentage;
        public VerdiepingRestrictie VerdiepingRestrictie;
    }

    public struct BouwregelsData : IComponentData
    {
        public float BebouwingspercentageMax;
        public float BouwhoogteMax;
        public float MinAfstandBuren;
        public float MinGroenPercentage;
        public float Parkeernorm;          // plekken per woning/functie-eenheid
        public float GeluidseisMaxDb;
        public Energielabel EnergielabelMin;
    }
}
