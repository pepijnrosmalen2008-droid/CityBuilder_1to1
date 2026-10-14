using System.Collections.Generic;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using CityBuilder.Game.Kavellen;
using CityBuilder.Game.Wegennetwerk;

namespace CityBuilder.Game.Stad
{
    /// Houdt het kavelraster schoon na het aanleggen van een weg, zoals CS zijn zonecellen
    /// opruimt: onbebouwde kavels waar de nieuwe weg doorheen loopt verdwijnen, en nieuwe kavels
    /// die op een andere weg of op een bestaande kavel vallen worden niet aangemaakt.
    public static class KavelOpruimUtility
    {
        struct Rechthoek
        {
            public Entity Kavel;
            public float2 C, A, N;
            public float Hx, Hy;
            public bool Vast; // bebouwd of in aanbouw: wordt nooit opgeruimd
        }

        struct Lijn
        {
            public Entity Segment;
            public float HalveBreedte;
            public List<float2> Punten;
        }

        public static int RuimOp(EntityManager em, Entity nieuwSegment, Entity[] nieuweKavels)
        {
            var nieuw = new HashSet<Entity>(nieuweKavels);
            var lijnen = VerzamelLijnen(em);
            Lijn? nieuweLijn = null;
            foreach (var l in lijnen)
                if (l.Segment == nieuwSegment) nieuweLijn = l;

            var bestaand = new List<Rechthoek>();
            var weg = new List<Entity>();

            var kavelQuery = em.CreateEntityQuery(typeof(KavelCore), typeof(KavelGeometriePunt));
            var kavels = kavelQuery.ToEntityArray(Allocator.Temp);
            foreach (var kavel in kavels)
            {
                if (nieuw.Contains(kavel)) continue;
                if (!MaakRechthoek(em, kavel, out var r)) continue;

                if (!r.Vast && nieuweLijn.HasValue && RaaktLijn(r, nieuweLijn.Value))
                    weg.Add(kavel);
                else
                    bestaand.Add(r);
            }
            kavels.Dispose();

            var geaccepteerd = new List<Rechthoek>();
            foreach (var kavel in nieuweKavels)
            {
                if (!em.Exists(kavel) || !MaakRechthoek(em, kavel, out var r))
                    continue;

                bool conflict = false;
                foreach (var l in lijnen)
                {
                    if (RaaktLijn(r, l)) { conflict = true; break; }
                }
                if (!conflict)
                {
                    foreach (var b in bestaand)
                        if (Overlapt(r, b)) { conflict = true; break; }
                }
                if (!conflict)
                {
                    foreach (var g in geaccepteerd)
                        if (Overlapt(r, g)) { conflict = true; break; }
                }

                if (conflict) weg.Add(kavel);
                else geaccepteerd.Add(r);
            }

            foreach (var kavel in weg)
                if (em.Exists(kavel)) em.DestroyEntity(kavel);

            return weg.Count;
        }

        static List<Lijn> VerzamelLijnen(EntityManager em)
        {
            var lijnen = new List<Lijn>();
            var query = em.CreateEntityQuery(typeof(WegSegmentData), typeof(WegSegmentSplinePunt), typeof(LaneBufferElement));
            var segmenten = query.ToEntityArray(Allocator.Temp);
            foreach (var segment in segmenten)
            {
                var spline = em.GetBuffer<WegSegmentSplinePunt>(segment);
                var punten = new List<float2>();
                for (int i = 0; i < spline.Length - 1; i++)
                {
                    float2 a = spline[i].Punt.xz, b = spline[i + 1].Punt.xz;
                    int stappen = math.max(1, (int)math.ceil(math.distance(a, b) / 2f));
                    for (int s = 0; s < stappen; s++)
                        punten.Add(math.lerp(a, b, (float)s / stappen));
                }
                if (spline.Length > 0)
                    punten.Add(spline[spline.Length - 1].Punt.xz);

                float hb = WegProfielUtility.TotaleBreedte(em.GetBuffer<LaneBufferElement>(segment)) * 0.5f;
                lijnen.Add(new Lijn { Segment = segment, HalveBreedte = hb, Punten = punten });
            }
            segmenten.Dispose();
            return lijnen;
        }

        /// Het bebouwbare deel van de kavel: vanaf de rand van de eigen weg tot de achterkant,
        /// iets ingekrompen zodat buurkavels die precies tegen elkaar liggen niet "overlappen".
        static bool MaakRechthoek(EntityManager em, Entity kavel, out Rechthoek r)
        {
            r = default;
            var geo = em.GetBuffer<KavelGeometriePunt>(kavel);
            if (geo.Length < 4) return false;

            float2 p0 = geo[0].Punt, p1 = geo[1].Punt, p3 = geo[3].Punt;
            float breedte = math.distance(p0, p1);
            float diepte = math.distance(p0, p3);
            if (breedte < 0.1f || diepte < 0.1f) return false;

            var core = em.GetComponentData<KavelCore>(kavel);
            float wegHalf = math.min(WegProfielUtility.HalveBreedte(em, core.Ontsluiting), diepte * 0.5f);

            float2 a = (p1 - p0) / breedte;
            float2 n = (p3 - p0) / diepte;
            float halveDiepte = (diepte - wegHalf) * 0.5f;

            r.Kavel = kavel;
            r.A = a;
            r.N = n;
            r.C = (p0 + p1) * 0.5f + n * (wegHalf + halveDiepte);
            r.Hx = math.max(0.1f, breedte * 0.5f - 0.3f);
            r.Hy = math.max(0.1f, halveDiepte - 0.3f);
            r.Vast = core.Gebouw != Entity.Null || core.Status == KavelStatus.Bouwplaats || core.Status == KavelStatus.Bebouwd;
            return true;
        }

        static bool RaaktLijn(in Rechthoek r, in Lijn lijn)
        {
            foreach (var p in lijn.Punten)
            {
                float2 d = p - r.C;
                if (math.abs(math.dot(d, r.A)) < r.Hx + lijn.HalveBreedte
                    && math.abs(math.dot(d, r.N)) < r.Hy + lijn.HalveBreedte)
                    return true;
            }
            return false;
        }

        /// Separating Axis Theorem voor twee georiënteerde rechthoeken in 2D.
        static bool Overlapt(in Rechthoek x, in Rechthoek y)
        {
            return !Scheidt(x, y, x.A) && !Scheidt(x, y, x.N) && !Scheidt(x, y, y.A) && !Scheidt(x, y, y.N);
        }

        static bool Scheidt(in Rechthoek x, in Rechthoek y, float2 as2)
        {
            float px = x.Hx * math.abs(math.dot(x.A, as2)) + x.Hy * math.abs(math.dot(x.N, as2));
            float py = y.Hx * math.abs(math.dot(y.A, as2)) + y.Hy * math.abs(math.dot(y.N, as2));
            float afstand = math.abs(math.dot(y.C - x.C, as2));
            return afstand > px + py;
        }
    }
}
