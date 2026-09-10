// Sinergia a partir do EDHREC (json.edhrec.com — não-oficial, sem chave, CORS aberto).
// É meta de Commander, então serve só como sinal de "essas cartas andam juntas";
// o filtro do que é legal no Toicinho é feito depois, no componente.

export interface SynergyEntry {
  name: string;
  lift: number; // co-ocorrência acima do esperado (>1 = sinergia)
  incl: number; // taxa de inclusão quando jogável (0–1)
}

export interface Combo {
  cards: string[]; // combo completo (inclui a carta consultada)
  decks: number; // popularidade (nº de decks de Commander)
}

const CACHE_PREFIX = 'edh:v1:';
const COMBO_PREFIX = 'edhc:v1:';
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

function readCache<T>(key: string): T | null | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > TTL_MS) return undefined;
    return d; // pode ser null (cache negativo)
  } catch {
    return undefined;
  }
}

function writeCache(key: string, d: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d }));
  } catch {
    /* quota — ignora */
  }
}

/** Busca (com cache) a lista de cartas sinérgicas de uma carta. */
export async function fetchSynergy(name: string): Promise<SynergyEntry[]> {
  const slug = edhrecSlug(name);
  const cached = readCache<SynergyEntry[]>(CACHE_PREFIX + slug);
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
  if (entries) writeCache(CACHE_PREFIX + slug, entries);
  return entries ?? [];
}

/**
 * Combos que incluem esta carta (endpoint /pages/combos/<slug>.json).
 * O cardviews de cada combo lista as OUTRAS peças; a carta consultada é implícita.
 */
export async function fetchCombos(name: string): Promise<Combo[]> {
  const slug = edhrecSlug(name);
  const cached = readCache<Combo[]>(COMBO_PREFIX + slug);
  if (cached !== undefined) return cached ?? [];

  let combos: Combo[] | null = null;
  try {
    const res = await fetch(`https://json.edhrec.com/pages/combos/${slug}.json`);
    const ct = res.headers.get('content-type') ?? '';
    if (res.ok && ct.includes('json')) {
      const json = await res.json();
      const lists = json?.container?.json_dict?.cardlists ?? [];
      combos = [];
      for (const list of lists) {
        const others = (list.cardviews ?? [])
          .map((cv: { name?: string }) => cv.name)
          .filter((n: unknown): n is string => typeof n === 'string');
        if (!others.length || others.length > 3) continue; // combos de 2 a 4 cartas
        const decks = parseInt(
          (list.header?.match(/\(([\d,]+)\s+decks?\)/)?.[1] ?? '0').replace(/,/g, ''),
          10,
        );
        combos.push({ cards: [name, ...others], decks: Number.isFinite(decks) ? decks : 0 });
      }
    } else {
      combos = []; // sem combos pra essa carta
    }
  } catch {
    combos = null; // rede/CORS
  }
  if (combos) writeCache(COMBO_PREFIX + slug, combos);
  return combos ?? [];
}
