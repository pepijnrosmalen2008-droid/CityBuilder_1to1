using System.Globalization;
using Unity.Entities;
using UnityEngine;
using CityBuilder.Game.Stad;

namespace CityBuilder.Game.SpelerTools
{
    /// Bovenbalk zoals in Cities: Skylines: dag en spelsnelheid, inwoners, woningen, banen per
    /// sector, werkloosheid en de vraagbalken (W = wonen, D = detailhandel/horeca, K = kantoren,
    /// I = industrie). Spatie pauzeert.
    public class StadHud : MonoBehaviour
    {
        static Rect _gebied;
        static readonly CultureInfo NL = CultureInfo.GetCultureInfo("nl-NL");

        EntityQuery _statQuery, _vraagQuery, _tijdQuery;
        bool _queriesKlaar;
        float _laatsteSnelheid = 1f;

        public static bool MuisErboven() => _gebied.Contains(UiSchaal.Muis);

        bool ZorgVoorQueries()
        {
            if (_queriesKlaar) return true;
            var wereld = World.DefaultGameObjectInjectionWorld;
            if (wereld == null) return false;
            var em = wereld.EntityManager;
            _statQuery = em.CreateEntityQuery(typeof(StadStatistiekData));
            _vraagQuery = em.CreateEntityQuery(typeof(StadVraagData));
            _tijdQuery = em.CreateEntityQuery(typeof(SimTijdData));
            _queriesKlaar = true;
            return true;
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Space) && ZorgVoorQueries() && _tijdQuery.CalculateEntityCount() == 1)
            {
                var t = _tijdQuery.GetSingleton<SimTijdData>();
                if (t.Snelheid > 0f) { _laatsteSnelheid = t.Snelheid; t.Snelheid = 0f; }
                else t.Snelheid = _laatsteSnelheid;
                _tijdQuery.SetSingleton(t);
            }
        }

        void OnGUI()
        {
            if (!ZorgVoorQueries()) return;
            if (_statQuery.CalculateEntityCount() != 1 || _vraagQuery.CalculateEntityCount() != 1 || _tijdQuery.CalculateEntityCount() != 1)
                return;

            var stat = _statQuery.GetSingleton<StadStatistiekData>();
            var vraag = _vraagQuery.GetSingleton<StadVraagData>();
            var tijd = _tijdQuery.GetSingleton<SimTijdData>();

            UiSchaal.Toepassen();
            const float w = 1000f, h = 66f;
            float x = (UiSchaal.Breedte - w) * 0.5f, y = 8f;
            _gebied = new Rect(x, y, w, h);

            var achtergrond = new GUIStyle(GUI.skin.box);
            var label = new GUIStyle(GUI.skin.label) { fontSize = 13, normal = { textColor = new Color(0.8f, 0.85f, 0.9f) } };
            var waarde = new GUIStyle(GUI.skin.label) { fontSize = 17, fontStyle = FontStyle.Bold, normal = { textColor = Color.white } };
            var knop = new GUIStyle(GUI.skin.button) { fontSize = 13 };

            GUI.Box(_gebied, "", achtergrond);

            // Tijd en snelheid.
            GUI.Label(new Rect(x + 12f, y + 6f, 120f, 20f), "Dag", label);
            GUI.Label(new Rect(x + 12f, y + 26f, 120f, 26f), ((int)tijd.Dagen + 1).ToString("N0", NL), waarde);
            float[] snelheden = { 0f, 1f, 2f, 4f };
            string[] namen = { "||", "1x", "2x", "4x" };
            for (int i = 0; i < snelheden.Length; i++)
            {
                var r = new Rect(x + 80f + i * 40f, y + 20f, 36f, 26f);
                var oud = GUI.backgroundColor;
                if (Mathf.Approximately(tijd.Snelheid, snelheden[i])) GUI.backgroundColor = new Color(0.35f, 0.75f, 1f);
                if (GUI.Button(r, namen[i], knop))
                {
                    if (tijd.Snelheid > 0f) _laatsteSnelheid = tijd.Snelheid;
                    tijd.Snelheid = snelheden[i];
                    _tijdQuery.SetSingleton(tijd);
                }
                GUI.backgroundColor = oud;
            }

            float kx = x + 260f;
            Kolom(kx, y, "Inwoners", stat.Inwoners.ToString("N0", NL), label, waarde);
            Kolom(kx + 120f, y, "Woningen", stat.Woningen.ToString("N0", NL), label, waarde);
            Kolom(kx + 240f, y, "Banen", stat.BanenTotaal.ToString("N0", NL), label, waarde);
            Kolom(kx + 340f, y, "Werkloosheid", (stat.Werkloosheid * 100f).ToString("0.0", NL) + "%", label, waarde);
            GUI.Label(new Rect(kx + 460f, y + 6f, 160f, 18f), "Winkel/horeca  " + (stat.BanenDetailhandel + stat.BanenHoreca).ToString("N0", NL), label);
            GUI.Label(new Rect(kx + 460f, y + 24f, 160f, 18f), "Kantoor           " + stat.BanenKantoor.ToString("N0", NL), label);
            GUI.Label(new Rect(kx + 460f, y + 42f, 160f, 18f), "Industrie         " + stat.BanenIndustrie.ToString("N0", NL), label);

            // Vraagbalken.
            float bx = x + w - 130f;
            Balk(bx, y, "W", vraag.Wonen, new Color(0.35f, 0.85f, 0.3f), label);
            Balk(bx + 28f, y, "D", vraag.Detailhandel, new Color(0.25f, 0.6f, 1f), label);
            Balk(bx + 56f, y, "K", vraag.Kantoor, new Color(0.65f, 0.45f, 1f), label);
            Balk(bx + 84f, y, "I", vraag.Industrie, new Color(1f, 0.8f, 0.15f), label);
        }

        static void Kolom(float x, float y, string titel, string tekst, GUIStyle label, GUIStyle waarde)
        {
            GUI.Label(new Rect(x, y + 6f, 120f, 20f), titel, label);
            GUI.Label(new Rect(x, y + 26f, 120f, 26f), tekst, waarde);
        }

        static void Balk(float x, float y, string letter, float waarde, Color kleur, GUIStyle label)
        {
            const float hoogte = 40f, breedte = 16f;
            var kader = new Rect(x, y + 6f, breedte, hoogte);
            GUI.DrawTexture(kader, Texture2D.whiteTexture, ScaleMode.StretchToFill, false, 0f, new Color(0f, 0f, 0f, 0.45f), 0f, 0f);
            float h = Mathf.Clamp01(waarde) * hoogte;
            GUI.DrawTexture(new Rect(x, y + 6f + hoogte - h, breedte, h), Texture2D.whiteTexture, ScaleMode.StretchToFill, false, 0f, kleur, 0f, 0f);
            GUI.Label(new Rect(x + 2f, y + 46f, 20f, 18f), letter, label);
        }
    }
}
