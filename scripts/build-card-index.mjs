// Constrói o índice de cartas usado pela busca do site (PT + EN).
//
// O bulk grande NUNCA vai pro repositório nem pro GitHub Pages. Ele é baixado aqui
// (no CI), consumido em streaming e descartado. Só o resultado (~3 MB) é publicado.
//
//   1. Baixa o bulk "all_cards" do Scryfall — JSONL gzipado (~390 MB comprimido,
//      1 objeto por impressão, TODOS os idiomas). Stream: gunzip + linha a linha,
//      memória constante, o arquivo nunca fica inteiro na RAM.
//   2. Por oracle_id guarda:
//        - a impressão mais recente (qualquer idioma) -> raridade, set, cmc, tipo, cor, imagem
//          (regra "raridade mais recente")
//        - o printed_name da impressão em português mais recente
//   3. Marca elegibilidade no pool do Toicinho (4ª Edição+ e sem menção a
//      Commander / Zona de Comando na caixa de regras).
//   4. Escreve public/data/cards.json.
//
// Uso:  node scripts/build-card-index.mjs
// Sem dependências além do Node (>= 18).

import { createWriteStream, createReadStream } from 'node:fs';
import { writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/data/cards.json');
const TMP = resolve(__dirname, '../.cache/all-cards.jsonl.gz');

const SCRYFALL_HEADERS = {
  'User-Agent': 'toicinho-deckbuilder/1.0 (card index builder)',
  Accept: 'application/json',
};

// Toicinho: cartas válidas da Quarta Edição (1995-04-24) em diante.
const EARLIEST_RELEASE = '1995-04-24';
const INVALID_TEXT = /\b(commander|command zone)\b/i;

const SKIP_LAYOUTS = new Set([
  'token', 'double_faced_token', 'emblem', 'art_series', 'vanguard',
  'scheme', 'planar', 'augment', 'host', 'sticker', 'attraction',
]);
const SKIP_SET_TYPES = new Set(['token', 'memorabilia', 'minigame', 'funny']);
const TODAY = new Date().toISOString().slice(0, 10);
// Para a regra "raridade mais recente": só sets "de verdade" definem raridade de forma
// consistente. Secret Lair (box), promos, decks temáticos etc. distorcem — ficam de fora
// e só entram como último recurso.
const REAL_SET_TYPES = new Set(['core', 'expansion', 'masters', 'draft_innovation', 'remastered']);

// pontua uma impressão: quanto maior, "melhor" como fonte de raridade/metadata
function printingScore(card) {
  if ((card.released_at || '9999') > TODAY) return 0;           // ainda não lançada
  if (card.promo) return 1;
  if (REAL_SET_TYPES.has(card.set_type)) return 3;              // set normal
  return 2;                                                     // outros (commander, etc.)
}

async function getBulkUrl() {
  const res = await fetch('https://api.scryfall.com/bulk-data', { headers: SCRYFALL_HEADERS });
  const json = await res.json();
  const entry = json.data.find((d) => d.type === 'all_cards');
  if (!entry) throw new Error('bulk-data: all_cards não encontrado');
  return entry.jsonl_download_uri || entry.download_uri;
}

async function downloadBulk(url) {
  await mkdir(dirname(TMP), { recursive: true });
  const res = await fetch(url, { headers: SCRYFALL_HEADERS });
  if (!res.ok || !res.body) throw new Error(`download do bulk falhou: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(TMP));
  const { size } = await stat(TMP);
  console.log(`  baixado ${(size / 1e6).toFixed(0)} MB (comprimido)`);
}

function isPlayable(card) {
  if (SKIP_LAYOUTS.has(card.layout)) return false;
  if (SKIP_SET_TYPES.has(card.set_type)) return false;
  if (card.border_color === 'silver') return false; // cartas "un-" / joke
  if (card.digital && card.set_type !== 'alchemy') return false;
  if (!card.games || (!card.games.includes('paper') && !card.games.includes('mtgo'))) return false;
  if (/\b(Vanguard|Scheme|Plane|Phenomenon|Conspiracy)\b/.test(card.type_line || '')) return false;
  return true;
}

function smallImage(card) {
  const u = card.image_uris || card.card_faces?.[0]?.image_uris;
  return u?.small ?? null;
}

async function* streamBulk(gzPath) {
  const rl = createInterface({
    input: createReadStream(gzPath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed || trimmed === '[' || trimmed === ']') continue;
    try {
      yield JSON.parse(trimmed);
    } catch {
      /* linha parcial de array pretty-printed — ignora */
    }
  }
}

function pickEnglishName(card) {
  // nome em inglês: card.name já é o nome oráculo (inglês) mesmo em impressões PT
  return card.name;
}

function pickPortugueseName(card) {
  if (card.lang !== 'pt') return null;
  return card.printed_name || card.card_faces?.[0]?.printed_name || null;
}

async function main() {
  console.log('Descobrindo URL do bulk…');
  const url = await getBulkUrl();
  console.log('Baixando all_cards…');
  await downloadBulk(url);

  console.log('Processando (stream)…');
  /** @type {Map<string, {meta: any, pt: string|null, ptDate: string}>} */
  const acc = new Map();
  let seen = 0;

  for await (const card of streamBulk(TMP)) {
    seen++;
    if (seen % 200000 === 0) console.log(`  … ${seen} objetos`);
    if (!card.oracle_id || !isPlayable(card)) continue;

    let e = acc.get(card.oracle_id);
    if (!e) {
      e = { meta: null, metaRank: -Infinity, pt: null, ptDate: '', _img: null };
      acc.set(card.oracle_id, e);
    }
    const date = card.released_at || '';

    // Metadados vêm da "melhor" impressão: categoria do set primeiro (peso 1e13,
    // acima de qualquer timestamp), e dentro da categoria a mais recente.
    const rank = printingScore(card) * 1e13 + Date.parse(date || '1993-01-01');
    if (!e.meta || rank > e.metaRank) {
      e.meta = card;
      e.metaRank = rank;
      if (smallImage(card)) e._img = smallImage(card);
    }
    if (!e._img && smallImage(card)) e._img = smallImage(card);

    const pt = pickPortugueseName(card);
    if (pt && date >= e.ptDate) {
      e.pt = pt;
      e.ptDate = date;
    }
  }
  console.log(`  ${seen} objetos lidos, ${acc.size} cartas únicas`);

  const cards = [];
  for (const { meta, pt, _img } of acc.values()) {
    const oracleText = [meta.oracle_text, ...(meta.card_faces?.map((f) => f.oracle_text) || [])]
      .filter(Boolean).join('\n');
    const typeLine = meta.type_line ?? meta.card_faces?.[0]?.type_line ?? '';
    cards.push({
      id: meta.oracle_id,
      name: pickEnglishName(meta),
      namePt: pt,
      set: meta.set,
      released: meta.released_at,
      rarity: meta.rarity,
      cmc: meta.cmc ?? 0,
      manaCost: meta.mana_cost ?? meta.card_faces?.[0]?.mana_cost ?? '',
      typeLine,
      colors: meta.colors ?? meta.card_faces?.[0]?.colors ?? [],
      colorIdentity: meta.color_identity ?? [],
      legendary: /Legendary/.test(typeLine),
      img: _img ?? null,
      poolLegal: (meta.released_at || '') >= EARLIEST_RELEASE && !INVALID_TEXT.test(oracleText),
    });
  }
  cards.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    scryfallBulk: url.split('/').pop(),
    count: cards.length,
    cards,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload));
  await rm(TMP, { force: true });

  const withPt = cards.filter((c) => c.namePt).length;
  const inPool = cards.filter((c) => c.poolLegal).length;
  const { size } = await stat(OUT);
  console.log(`\nGravado ${OUT} (${(size / 1e6).toFixed(1)} MB)`);
  console.log(`  ${cards.length} cartas | ${withPt} com nome PT | ${inPool} elegíveis no pool`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
