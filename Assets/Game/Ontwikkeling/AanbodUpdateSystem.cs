using Unity.Collections;
using Unity.Entities;
using CityBuilder.Game.Kavellen;

namespace CityBuilder.Game.Ontwikkeling
{
    /// Tag op een Kavel-entity: deze voltooide ontwikkeling is al meegeteld in Aanbod, voorkomt
    /// dubbeltelling bij elke volgende OnUpdate-pass.
    public struct AanbodGeteld : IComponentData { }

    /// Section 7's kringloop-sluitende stap: "VraagAanbodIndex van het district wordt bijgewerkt
    /// (aanbod gestegen voor die functie)" zodra een kavel Bebouwd is. Losgekoppeld van
    /// KavelStatusTransitions.cs (geen edit aan die al geshipte file) -- dit systeem polst simpelweg
    /// naar kavels in Bebouwd-status zonder AanbodGeteld-tag, in plaats van op de transitie zelf
    /// te haken.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct AanbodUpdateSystem : ISystem
    {
        public void OnUpdate(ref SystemState state)
        {
            var indexPerSleutel = new NativeHashMap<int, Entity>(16, Allocator.Temp);
            foreach (var (index, entity) in SystemAPI.Query<RefRO<VraagAanbodIndexData>>().WithEntityAccess())
                indexPerSleutel[EncodeeerSleutel(index.ValueRO.DistrictId, index.ValueRO.Functie)] = entity;

            var functieAandelenLookup = SystemAPI.GetBufferLookup<FunctieAandeelBufferElement>(true);
            var toTagAanbodGeteld = new NativeList<Entity>(Allocator.Temp);
            var toMarkDirty = new NativeList<Entity>(Allocator.Temp);

            foreach (var (kavel, entity) in SystemAPI.Query<RefRO<KavelCore>>().WithNone<AanbodGeteld>().WithEntityAccess())
            {
                if (kavel.ValueRO.Status != KavelStatus.Bebouwd)
                    continue;
                if (kavel.ValueRO.Bestemmingsplan == Entity.Null || !functieAandelenLookup.HasBuffer(kavel.ValueRO.Bestemmingsplan))
                    continue;

                var functies = functieAandelenLookup[kavel.ValueRO.Bestemmingsplan];
                for (int i = 0; i < functies.Length; i++)
                {
                    int sleutel = EncodeeerSleutel(kavel.ValueRO.DistrictId, functies[i].Functie);
                    if (!indexPerSleutel.TryGetValue(sleutel, out var indexEntity))
                        continue;

                    var data = state.EntityManager.GetComponentData<VraagAanbodIndexData>(indexEntity);
                    float gewicht = (functies[i].MinPercentage + functies[i].MaxPercentage) * 0.5f / 100f;
                    data.Aanbod += kavel.ValueRO.Oppervlakte * gewicht;
                    state.EntityManager.SetComponentData(indexEntity, data);
                    toMarkDirty.Add(indexEntity); // duplicaten zijn onschadelijk, zie de HasComponent-guard hieronder
                }

                toTagAanbodGeteld.Add(entity);
            }

            foreach (var e in toTagAanbodGeteld)
                state.EntityManager.AddComponent<AanbodGeteld>(e);

            foreach (var e in toMarkDirty)
                if (!state.EntityManager.HasComponent<VraagAanbodIndexDirty>(e))
                    state.EntityManager.AddComponent<VraagAanbodIndexDirty>(e);

            toTagAanbodGeteld.Dispose();
            toMarkDirty.Dispose();
            indexPerSleutel.Dispose();
        }

        static int EncodeeerSleutel(int districtId, FunctieType functie) => districtId * 1000 + (int)functie;
    }
}
