// Encurtador de link do deck, guardado no Firestore — via REST puro (fetch),
// não o SDK JS, que sozinho adicionava ~500KB ao bundle só pra um get/set.
// Payload é o mesmo que já ia no "#d=" da URL, só troca o carregador.
//
// A projectId/apiKey abaixo não são segredo: o Firebase documenta que a
// config web é pública por design (https://firebase.google.com/docs/projects/api-keys).
// Quem protege os dados são as Security Rules do Firestore (só permitem
// "create", nunca "update"/"delete"/"list" — ver README ou o console do projeto).
const PROJECT_ID = 'toicinho-deckbuilder';
const API_KEY = 'AIzaSyCvWBN8Hip6SDXe405bjcwExClpnhYo0Gk';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LEN = 10;
const ID_BYTES = 9; // 72 bits de entropia da hash, sobra pros 10 chars (~59.5 bits) em base62

/**
 * Id determinístico (hash do próprio payload): o mesmo deck — mesmas
 * cartas, mesmo nome — sempre cai no mesmo id, então gerar o link curto
 * de novo pro mesmo deck reaproveita o documento em vez de criar outro.
 * 10 chars em base62 é folga bem confortável de colisão pra esse uso.
 */
async function contentId(encodedDeck: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encodedDeck));
  const bytes = new Uint8Array(digest);
  let n = 0n;
  for (let i = 0; i < ID_BYTES; i++) n = (n << 8n) | BigInt(bytes[i]);
  let s = '';
  const base = BigInt(ALPHABET.length);
  for (let i = 0; i < ID_LEN; i++) {
    s = ALPHABET[Number(n % base)] + s;
    n /= base;
  }
  return s;
}

/**
 * Cria (ou reaproveita) o link curto pro payload já codificado (encodeDeck).
 * `name` vai num campo separado só pra facilitar olhar/listar no console do
 * Firestore sem precisar decodificar o payload inteiro. Retorna o id.
 */
export async function createShortLink(encodedDeck: string, name: string): Promise<string> {
  const id = await contentId(encodedDeck);
  const res = await fetch(`${BASE}/links?documentId=${id}&key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        deck: { stringValue: encodedDeck },
        name: { stringValue: name.slice(0, 200) },
        createdAt: { timestampValue: new Date().toISOString() },
        views: { integerValue: '0' },
      },
    }),
  });
  // 409 = documento já existe — é o mesmo deck (id é hash do payload), então
  // já está lá do jeito certo. Só reaproveita.
  if (res.status === 409) return id;
  if (!res.ok) throw new Error(`Firestore respondeu ${res.status}`);
  return id;
}

/** Resolve um id pro payload codificado original, ou null se não existir. */
export async function resolveShortLink(id: string): Promise<string | null> {
  const res = await fetch(`${BASE}/links/${id}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore respondeu ${res.status}`);
  const data = await res.json();
  const value = data.fields?.deck?.stringValue;
  return typeof value === 'string' ? value : null;
}

/**
 * Soma +1 no contador de acessos (transform atômico, não precisa ler o
 * valor atual antes). Fire-and-forget: é só estatística, uma falha aqui
 * não pode atrapalhar quem tá só tentando abrir o deck.
 */
export function registerShortLinkView(id: string): void {
  fetch(`${BASE}:commit?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          transform: {
            document: `projects/${PROJECT_ID}/databases/(default)/documents/links/${id}`,
            fieldTransforms: [{ fieldPath: 'views', increment: { integerValue: '1' } }],
          },
        },
      ],
    }),
  }).catch(() => {
    /* estatística — não é crítico */
  });
}
