// Constrói a banlist do formato Toicinho a partir da página oficial da Bacon Arcano.
//
// Fluxo:
//   1. Baixa https://www.baconarcano.com/blog/banidas?format=json-pretty  (Squarespace expõe o post como JSON)
//   2. Extrai o HTML do corpo do post e separa os nomes por seção de cor (<h2>/<h4> + <p> por carta)
//   3. Normaliza (nbsp, aspas tortas, espaços) e aplica correções manuais de digitação
//   4. Valida cada nome contra a API do Scryfall (endpoint /cards/collection, 75 por request)
//   5. Nomes não encontrados: segunda tentativa com /cards/named?fuzzy=
//   6. Grava src/formats/toicinho.banlist.json + um relatório de divergências
//
// Uso:  node scripts/build-banlist.mjs
// Sem dependências: usa apenas fetch nativo (Node >= 18).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/formats/toicinho.banlist.json');
const REPORT = resolve(__dirname, '../src/formats/toicinho.banlist.report.json');

const SOURCE_URL = 'https://www.baconarcano.com/blog/banidas';
const SCRYFALL_COLLECTION = 'https://api.scryfall.com/cards/collection';
const SCRYFALL_NAMED = 'https://api.scryfall.com/cards/named';

const COLOR_BY_SECTION = {
  BRANCO: 'W', AZUL: 'U', PRETO: 'B', VERMELHO: 'R',
  VERDE: 'G', MULTICOLORIDO: 'M', INCOLOR: 'C', TERRENO: 'L',
};

// Correções de digitação conhecidas na página oficial (origem -> nome pesquisável).
// Mantido explícito para auditoria; revisar sempre que a lista for atualizada.
const MANUAL_FIXES = {
  'Timewalk': 'Time Walk',
  'Evendo, Waking Heaven': 'Evendo, Waking Haven',
  "Jetmir's Gardens": "Jetmir's Garden",
  'SiIent Clearing': 'Silent Clearing', // "I" maiúsculo no lugar de "l"
  // "Sheoldred" sozinho casa com a carta partida "Sheoldred // The True Scriptures"
  // (Duel Decks) — e é essa mesma a intenção da Bacon Arcano. Nenhum fix necessário.
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// O Scryfall exige User-Agent e Accept explícitos em toda request.
const SCRYFALL_HEADERS = {
  'User-Agent': 'toicinho-deckbuilder/1.0 (https://github.com/, banlist importer)',
  Accept: 'application/json',
};

function normalizeName(raw) {
  return raw
    .replace(/ /g, ' ')       // nbsp
    .replace(/[’‘´`]/g, "'") // aspas/acentos no lugar de apóstrofo
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBanlistHtml() {
  const res = await fetch(`${SOURCE_URL}?format=json-pretty`, {
    headers: { 'User-Agent': 'toicinho-deckbuilder/1.0 (banlist importer)' },
  });
  if (!res.ok) throw new Error(`Falha ao baixar a página: ${res.status}`);
  const json = await res.json();
  const body = json?.item?.body;
  if (!body) throw new Error('Estrutura inesperada: item.body ausente no JSON do Squarespace');
  return body;
}

function parseSections(html) {
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  // marca cabeçalhos de cor (aparecem como h2, alguns como h4)
  s = s.replace(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi, (_, t) => {
    const label = t.replace(/<[^>]+>/g, '').replace(/ /g, ' ').trim().toUpperCase();
    return `\n@@@${label}@@@\n`;
  });
  s = s.replace(/<\/p>/gi, '\n').replace(/<br[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');

  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);

  const sections = {};
  let current = null;
  let started = false;
  for (const line of lines) {
    const header = line.match(/^@@@(.+?)@@@$/);
    if (header) {
      const key = header[1];
      if (COLOR_BY_SECTION[key]) {
        current = key;
        sections[current] = sections[current] || [];
        started = true;
      } else {
        current = null;
      }
      continue;
    }
    if (!started || !current) continue;
    // descarta lixo de CSS que às vezes escapa e parágrafos de prosa
    if (/[{}]|@media|#block|\.sqs-|sqs-html|white-space|^\/\*|::|color:#/i.test(line)) continue;
    if (line.split(' ').length > 8) continue;
    sections[current].push(line);
  }
  return sections;
}

function collectCandidates(sections) {
  const seen = new Set();
  const list = [];
  for (const [section, names] of Object.entries(sections)) {
    const color = COLOR_BY_SECTION[section];
    for (const rawName of names) {
      const original = normalizeName(rawName);
      const query = MANUAL_FIXES[original] ?? original;
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ original, query, color });
    }
  }
  return list;
}

async function scryfallCollection(names) {
  const res = await fetch(SCRYFALL_COLLECTION, {
    method: 'POST',
    headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers: names.map((name) => ({ name })) }),
  });
  if (!res.ok) throw new Error(`Scryfall collection ${res.status}: ${await res.text()}`);
  return res.json();
}

async function scryfallFuzzy(name) {
  const res = await fetch(`${SCRYFALL_NAMED}?fuzzy=${encodeURIComponent(name)}`, {
    headers: SCRYFALL_HEADERS,
  });
  const json = await res.json();
  return json.object === 'error' ? null : json;
}

async function resolveAll(candidates) {
  const resolved = [];

  // Nomes com "//" (cartas partidas) quebram o endpoint /collection — vão direto pro fuzzy.
  const splitCards = candidates.filter((c) => c.query.includes('//'));
  const forCollection = candidates.filter((c) => !c.query.includes('//'));

  for (const cand of splitCards) {
    const card = await scryfallFuzzy(cand.query);
    await sleep(120);
    resolved.push(card
      ? { ...cand, canonical: card.name, oracleId: card.oracle_id, match: 'fuzzy_named' }
      : { ...cand, canonical: null, oracleId: null, match: 'not_found' });
  }

  for (let i = 0; i < forCollection.length; i += 75) {
    const chunk = forCollection.slice(i, i + 75);
    const data = await scryfallCollection(chunk.map((c) => c.query));
    const notFound = new Set((data.not_found || []).map((x) => x.name.toLowerCase()));
    let di = 0;
    for (const cand of chunk) {
      if (notFound.has(cand.query.toLowerCase())) {
        resolved.push({ ...cand, canonical: null, oracleId: null, match: 'not_found' });
      } else {
        const card = data.data[di++];
        const exact = card.name.toLowerCase() === cand.query.toLowerCase();
        const partial = card.name.toLowerCase().startsWith(cand.query.toLowerCase() + ' //');
        resolved.push({
          ...cand,
          canonical: card.name,
          oracleId: card.oracle_id,
          match: exact ? 'exact' : partial ? 'face' : 'fuzzy',
        });
      }
    }
    await sleep(120); // respeita o rate limit do Scryfall
  }

  for (const entry of resolved) {
    if (entry.match !== 'not_found') continue;
    const card = await scryfallFuzzy(entry.query);
    await sleep(120);
    if (card) {
      entry.canonical = card.name;
      entry.oracleId = card.oracle_id;
      entry.match = 'fuzzy_named';
    }
  }
  return resolved;
}

async function main() {
  console.log('Baixando banlist oficial…');
  const html = await fetchBanlistHtml();
  const sections = parseSections(html);
  const candidates = collectCandidates(sections);
  console.log(`  ${candidates.length} cartas únicas em ${Object.keys(sections).length} seções`);

  console.log('Validando contra o Scryfall…');
  const resolved = await resolveAll(candidates);

  const unresolved = resolved.filter((r) => !r.canonical);
  const corrections = resolved.filter(
    (r) => r.canonical && r.canonical.toLowerCase() !== r.original.toLowerCase()
      && !r.canonical.toLowerCase().startsWith(r.original.toLowerCase() + ' //'),
  );
  const faces = resolved.filter((r) => r.match === 'face');

  const banned = resolved
    .filter((r) => r.canonical)
    .map((r) => ({ name: r.canonical, color: r.color, oracleId: r.oracleId }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  // Guarda de sanidade: a banlist tem ~700 cartas. Se veio muito menos, o scrape
  // provavelmente quebrou — não sobrescreve o arquivo bom que já está no repo.
  if (banned.length < 600) {
    throw new Error(
      `Só ${banned.length} cartas extraídas (esperado ~700). Página mudou de estrutura? Abortando sem gravar.`,
    );
  }

  const output = {
    format: 'Toicinho',
    source: SOURCE_URL,
    generatedAt: new Date().toISOString().slice(0, 10),
    count: banned.length,
    banned,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    resolved: resolved.length - unresolved.length,
    unresolved: unresolved.map((r) => ({ original: r.original, query: r.query, color: r.color })),
    typoCorrections: corrections.map((r) => ({ from: r.original, to: r.canonical, color: r.color })),
    doubleFacedResolved: faces.map((r) => ({ from: r.original, to: r.canonical })),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(output, null, 2) + '\n');
  await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n');

  console.log(`\nGravado ${OUT} (${banned.length} cartas)`);
  console.log(`Relatório  ${REPORT}`);
  if (report.typoCorrections.length) {
    console.log('\nCorreções de digitação aplicadas:');
    for (const c of report.typoCorrections) console.log(`  "${c.from}" -> "${c.to}"`);
  }
  if (unresolved.length) {
    console.log('\n⚠ Nomes não resolvidos (revisar à mão):');
    for (const u of unresolved) console.log(`  ${u.original}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
