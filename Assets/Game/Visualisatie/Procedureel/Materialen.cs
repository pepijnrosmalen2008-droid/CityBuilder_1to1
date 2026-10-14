using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CityBuilder.Game.Visualisatie.Procedureel
{
    /// Eén plek waar alle URP-materialen van de wereld gemaakt en gedeeld worden. Gedeelde
    /// materialen houden de SRP Batcher efficiënt; instancing staat aan voor de bomen.
    public static class Materialen
    {
        static readonly Dictionary<string, Material> _cache = new Dictionary<string, Material>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Reset() => _cache.Clear();

        static Shader LitShader => Shader.Find("Universal Render Pipeline/Lit");
        static Shader UnlitShader => Shader.Find("Universal Render Pipeline/Unlit");

        static bool Probeer(string sleutel, out Material m) => _cache.TryGetValue(sleutel, out m) && m != null;

        public static Material Pbr(string sleutel, System.Func<PbrSet> bron, Color tint, float normaalSchaal = 1f)
        {
            if (Probeer(sleutel, out var m))
                return m;

            var set = bron();
            m = new Material(LitShader) { name = sleutel, enableInstancing = true };
            m.SetTexture("_BaseMap", set.Albedo);
            m.SetColor("_BaseColor", tint);

            if (set.Normaal != null)
            {
                m.SetTexture("_BumpMap", set.Normaal);
                m.SetFloat("_BumpScale", normaalSchaal);
                m.EnableKeyword("_NORMALMAP");
            }

            if (set.MetaalGlad != null)
            {
                m.SetTexture("_MetallicGlossMap", set.MetaalGlad);
                m.EnableKeyword("_METALLICSPECGLOSSMAP");
                m.SetFloat("_Smoothness", 1f);
            }
            else
            {
                m.SetFloat("_Smoothness", 0.12f);
                m.SetFloat("_Metallic", 0f);
            }

            _cache[sleutel] = m;
            return m;
        }

        public static Material Kleur(string sleutel, Color kleur, float gladheid, float metaal = 0f)
        {
            if (Probeer(sleutel, out var m))
                return m;

            m = new Material(LitShader) { name = sleutel, enableInstancing = true };
            m.SetColor("_BaseColor", kleur);
            m.SetFloat("_Smoothness", gladheid);
            m.SetFloat("_Metallic", metaal);
            _cache[sleutel] = m;
            return m;
        }

        /// Onverlicht en doorschijnend (alpha blending) -- voor UI-achtige lagen in de wereld,
        /// zoals de zone-overlay en het tunneloverzicht.
        public static Material Overlay(string sleutel, Color kleur, Texture textuur)
        {
            if (Probeer(sleutel, out var m))
                return m;

            m = new Material(UnlitShader) { name = sleutel };
            if (textuur != null)
                m.SetTexture("_BaseMap", textuur);
            m.SetColor("_BaseColor", kleur);
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", 0f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)RenderQueue.Transparent;
            _cache[sleutel] = m;
            return m;
        }

        static Material Uitgesneden(Material m)
        {
            m.SetFloat("_AlphaClip", 1f);
            m.SetFloat("_Cutoff", 0.5f);
            m.EnableKeyword("_ALPHATEST_ON");
            m.SetFloat("_Cull", (float)CullMode.Off);
            m.SetOverrideTag("RenderType", "TransparentCutout");
            m.renderQueue = (int)RenderQueue.AlphaTest;
            return m;
        }

        static Color K(float r, float g, float b) => new Color(r, g, b, 1f);

        // ═══════ ONDERGROND EN VERHARDING ═══════

        public static Material Asfalt => Pbr("asfalt", () => ProcTex.Asfalt(false), Color.white);
        public static Material Fietsasfalt => Pbr("fietsasfalt", () => ProcTex.Asfalt(true), Color.white);
        public static Material Busbaan => Pbr("busbaan", () => ProcTex.Asfalt(true), K(0.85f, 0.75f, 0.75f));
        public static Material Klinkers => Pbr("klinkers", ProcTex.Klinkers, Color.white);
        public static Material Stoeptegels => Pbr("stoeptegels", ProcTex.Stoeptegels, Color.white);
        public static Material Beton => Pbr("beton", ProcTex.Beton, Color.white);
        public static Material Gras => Pbr("gras", () => ProcTex.Gras(false), Color.white);
        public static Material Tuin => Pbr("tuin", () => ProcTex.Gras(false), K(0.92f, 1f, 0.9f));
        public static Material Erfverharding => Pbr("erfverharding", ProcTex.Stoeptegels, K(0.86f, 0.84f, 0.80f));

        public static Material Markering => Kleur("markering", K(0.93f, 0.93f, 0.90f), 0.35f);
        public static Material Rail => Kleur("rail", K(0.38f, 0.36f, 0.34f), 0.75f, 0.9f);
        public static Material Metaal => Kleur("metaal", K(0.24f, 0.25f, 0.27f), 0.55f, 0.7f);
        public static Material Gegalvaniseerd => Kleur("gegalvaniseerd", K(0.66f, 0.67f, 0.69f), 0.5f, 0.85f);
        public static Material Lamp => Kleur("lampkap", K(0.95f, 0.93f, 0.85f), 0.8f);

        // ═══════ GEBOUWEN ═══════

        public static Material Gevel(GevelStijl stijl, Color tint) =>
            Pbr("gevel_" + stijl + "_" + ColorUtility.ToHtmlStringRGB(tint), () => ProcTex.Gevel(stijl), tint);

        public static Material Gevel(GevelStijl stijl) => Gevel(stijl, Color.white);

        public static Material Muurwerk(GevelStijl stijl) =>
            Pbr("muurwerk_" + stijl, () => ProcTex.Muurwerk(stijl), Color.white);

        public static Material Muurwerk(GevelStijl stijl, Color tint) =>
            Pbr("muurwerk_" + stijl + "_" + ColorUtility.ToHtmlStringRGB(tint), () => ProcTex.Muurwerk(stijl), tint);

        public static Material Winkelpui(int variant) => Pbr("winkelpui_" + variant, () => ProcTex.Winkelpui(variant), Color.white);
        public static Material Dakpannen(bool antraciet) => Pbr(antraciet ? "pannen_a" : "pannen_r", () => ProcTex.Dakpannen(antraciet), Color.white);
        public static Material Dakgrind => Pbr("dakgrind", ProcTex.Dakgrind, Color.white);
        public static Material Trim => Pbr("trim", ProcTex.Beton, K(1.25f, 1.24f, 1.2f));
        public static Material DonkerTrim => Kleur("donkertrim", K(0.16f, 0.16f, 0.17f), 0.4f);
        public static Material Glas => Kleur("glas", K(0.14f, 0.19f, 0.24f), 0.95f, 0.1f);

        public static Material Luifel(int variant)
        {
            Color[] kleuren =
            {
                K(0.60f, 0.12f, 0.12f), K(0.10f, 0.30f, 0.18f), K(0.12f, 0.18f, 0.40f), K(0.15f, 0.15f, 0.15f), K(0.80f, 0.48f, 0.12f), K(0.85f, 0.85f, 0.80f),
            };
            int i = ((variant % kleuren.Length) + kleuren.Length) % kleuren.Length;
            return Kleur("luifel_" + i, kleuren[i], 0.15f);
        }

        // ═══════ BOUWPLAATS ═══════

        public static Material Bouwbeton => Pbr("bouwbeton", ProcTex.Beton, K(0.85f, 0.85f, 0.83f));
        public static Material KraanGeel => Kleur("kraangeel", K(0.95f, 0.70f, 0.08f), 0.45f, 0.3f);

        public static Material Steiger
        {
            get
            {
                if (Probeer("steiger", out var m))
                    return m;
                m = Pbr("steiger", ProcTex.Steiger, Color.white);
                return Uitgesneden(m);
            }
        }

        // ═══════ BOMEN ═══════

        public static Material Schors(bool berk) => Pbr(berk ? "schors_berk" : "schors", () => ProcTex.Schors(berk), Color.white);
        public static Material Blad(BladSoort soort) => Pbr("blad_" + soort, () => ProcTex.Blad(soort), Color.white, 0.8f);
    }
}
