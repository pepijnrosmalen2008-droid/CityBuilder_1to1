// Kleine lijnicoontjes (24×24, currentColor).
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICOON = {
  druppel: svg('<path d="M12 3.5c3.6 4.6 5.5 7.6 5.5 10a5.5 5.5 0 0 1-11 0c0-2.4 1.9-5.4 5.5-10z"/>'),
  vuilnis: svg('<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>'),
  vlam: svg('<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4 2.5-5 .3 1.8 1 2.6 2 3 0-3 .5-5.5.5-8z"/>'),
  schild: svg('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>'),
  kruis: svg('<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>'),
  ster: svg('<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>'),
  euro: svg('<path d="M17 6.5a6 6 0 1 0 0 11M5 10.5h9M5 13.5h9"/>'),
  bliksem: svg('<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>'),
  auto: svg('<path d="M5 16v2.5M19 16v2.5"/><path d="M3.5 16v-3.2l2-4.6A2 2 0 0 1 7.3 7h9.4a2 2 0 0 1 1.8 1.2l2 4.6V16z"/><path d="M4 12.5h16"/><circle cx="7.5" cy="14.3" r=".6"/><circle cx="16.5" cy="14.3" r=".6"/>'),
  munt: svg('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2a3.4 3.4 0 1 0 0 5.6M8.5 11h5M8.5 13.2h5"/>'),
  huis: svg('<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
  mensen: svg('<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.3c2.6-.2 4.4 1.4 5 4.2"/>'),
  koffer: svg('<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>'),
  grafiek: svg('<path d="M4 19h16"/><path d="m5 15 4-4 3 3 6-7"/><path d="M15 7h3v3"/>'),
  pauze: svg('<path d="M9 6v12M15 6v12"/>'),
  play: svg('<path d="M8 5.5v13l10-6.5z"/>'),
  weg: svg('<path d="M8 3 5 21M16 3l3 18M12 4v3M12 10.5v3M12 17v3"/>'),
  zone: svg('<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>'),
  pijl: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  sloop: svg('<path d="M14.5 4.5 19.5 9.5 10 19H5v-5z"/><path d="M12 7l5 5"/>'),
  oog: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  krant: svg('<path d="M5 5h11v14H6.5A1.5 1.5 0 0 1 5 17.5z"/><path d="M16 9h3v8.5a1.5 1.5 0 0 1-3 0M8 8.5h5M8 11.5h5M8 14.5h3"/>'),
  vlag: svg('<path d="M5 21V4M5 4.5h11l-2 3.5 2 3.5H5"/>'),
  tandwiel: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  fabriek: svg('<path d="M3 20V10l5 3V10l5 3V7l4 2V4h3v16z"/><path d="M3 20h18"/>'),
  let: svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
};

/** Gezichtje dat meebeweegt met de tevredenheid (0-100). */
export function gezicht(t: number): string {
  const mond = t >= 70 ? 'M8 14.2c1.1 1.6 2.4 2.3 4 2.3s2.9-.7 4-2.3' : t >= 45 ? 'M8.5 15h7' : 'M8 16.3c1.1-1.5 2.4-2.2 4-2.2s2.9.7 4 2.2';
  const kleur = t >= 70 ? '#69db7c' : t >= 45 ? '#ffd43b' : '#ff6b6b';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${kleur}" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8.6"/><path d="M9 10v.4M15 10v.4"/><path d="${mond}"/></svg>`;
}

/** Stadswapen: schild in twee kleuren met een embleem, afgeleid van de seed. */
export function wapen(seed: number): string {
  const kleuren = [['#c92a2a', '#f8f9fa'], ['#1864ab', '#ffd43b'], ['#2b8a3e', '#f8f9fa'], ['#212529', '#ffd43b'], ['#e8590c', '#1c3d6e'], ['#5f3dc4', '#f8f9fa']];
  const [a, b] = kleuren[seed % kleuren.length];
  const deling = seed % 3;
  const vlak = deling === 0 ? `<path d="M4 3h16v8H4z" fill="${b}"/>` : deling === 1 ? `<path d="M12 3h8v17l-8 2.6z" fill="${b}"/>` : `<path d="M4 3l16 14V7.5L8 3z" fill="${b}" opacity=".95"/>`;
  const emblemen = [
    `<path d="M8.5 16v-5l1.2-1V8h1v1h2.6V8h1v2l1.2 1v5z" fill="${b}" stroke="${a}" stroke-width=".6"/>`, // toren
    `<path d="M6.5 14.5c1.8-1.6 3.6-1.6 5.5 0s3.7 1.6 5.5 0M6.5 17.5c1.8-1.6 3.6-1.6 5.5 0s3.7 1.6 5.5 0" stroke="${b}" stroke-width="1.3" fill="none"/>`, // water
    `<path d="M12 7l1.4 3 3.2.3-2.4 2.1.7 3.1L12 13.9 9.1 15.5l.7-3.1-2.4-2.1 3.2-.3z" fill="${b}" stroke="${a}" stroke-width=".5"/>`, // ster
    `<path d="M8 9l3 3m0-3-3 3M11 13l3 3m0-3-3 3M14 9l3 3m0-3-3 3" stroke="${b}" stroke-width="1.4"/>`, // andreaskruisen
  ];
  return `<svg viewBox="0 0 24 24"><path d="M4 3h16v8.5c0 5.2-3.6 8.6-8 10.4-4.4-1.8-8-5.2-8-10.4z" fill="${a}"/>${vlak}${emblemen[(seed >> 2) % emblemen.length]}<path d="M4 3h16v8.5c0 5.2-3.6 8.6-8 10.4-4.4-1.8-8-5.2-8-10.4z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>`;
}
