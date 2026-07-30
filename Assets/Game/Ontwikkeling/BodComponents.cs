using Unity.Entities;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    public struct BodData : IComponentData
    {
        public Unity.Entities.Hash128 Id;
        public Entity Kavel;
        public Entity Ontwikkelaar;
        public float Bodbedrag; // uit de residuele grondwaarde-berekening voor dit specifieke plan
        public double IngediendOpTijd;
        public double VervaltOpTijd;
        public BodStatus Status;
    }

    /// Section 4: "functiemix: List<FunctieAandeel>" -- hergebruikt letterlijk Kavellen's
    /// FunctieAandeelBufferElement (attached op dezelfde Bod-entity als BodData), geen eigen
    /// duplicaat-type.
    public struct OntwikkelingsPlanData : IComponentData
    {
        public float Bouwhoogte;         // binnen bouwregels.bouwhoogte_max
        public Energielabel Energielabel;
        public ParkeerOplossing ParkeerOplossing;
        public float GeschatteBouwtijd;
    }
}
