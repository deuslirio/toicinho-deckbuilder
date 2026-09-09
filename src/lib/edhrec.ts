// Sinergia a partir do EDHREC (json.edhrec.com — não-oficial, sem chave, CORS aberto).
// É meta de Commander, então serve só como sinal de "essas cartas andam juntas";
// o filtro do que é legal no Toicinho é feito depois, no componente.

export interface SynergyEntry {
  name: string;
  lift: number; // co-ocorrência acima do esperado (>1 = sinergia)
  incl: number; // taxa de inclusão quando jogável (0–1)
}

const CACHE_PREFIX = 'edh:v1:';
const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const LIFT_MIN = 1.5; // abaixo disso é "carta boa", não sinergia

/** Nome da carta -> slug do EDHREC. */
export function edhrecSlug(name: string): string {
  return name
    .split(' // ')[0]
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function readCache(slug: string): SynergyEntry[] | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return undefined;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > TTL_MS) return undefined;
    return d; // pode ser null (cache negativo de 404)
  } catch {
    return undefined;
  }
}

function writeCache(slug: string, d: SynergyEntry[] | null) {
  try {
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ t: Date.now(), d }));
  } catch {
    /* quota — ignora */
  }
}

/** Busca (com cache) a lista de cartas sinérgicas de uma carta. */
export async function fetchSynergy(name: string): Promise<SynergyEntry[]> {
  const slug = edhrecSlug(name);
  const cached = readCache(slug);
  if (cached !== undefined) return cached ?? [];

  let entries: SynergyEntry[] | null = null;
  try {
    const res = await fetch(`https://json.edhrec.com/pages/cards/${slug}.json`);
    if (res.ok) {
      const json = await res.json();
      const lists = json?.container?.json_dict?.cardlists ?? [];
      const seen = new Set<string>();
      entries = [];
      for (const list of lists) {
        if (/commander/i.test(list.header ?? '')) continue; // pula listas de comandante
        for (const cv of list.cardviews ?? []) {
          const lift = Number(cv.lift) || 0;
          if (lift < LIFT_MIN || !cv.name || seen.has(cv.name)) continue;
          seen.add(cv.name);
          const pd = Number(cv.potential_decks) || 0;
          entries.push({
            name: cv.name,
            lift,
            incl: pd > 0 ? (Number(cv.num_decks) || 0) / pd : 0,
          });
        }
      }
    }
  } catch {
    entries = null; // rede/CORS — não cacheia negativo
  }
  if (entries) writeCache(slug, entries);
  return entries ?? [];
}
