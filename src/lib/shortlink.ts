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
const ID_LEN = 7;
const MAX_ATTEMPTS = 5;

function randomId(): string {
  let s = '';
  for (let i = 0; i < ID_LEN; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/**
 * Cria um link curto. `encodedDeck` é o payload já codificado (encodeDeck);
 * `name` vai num campo separado só pra facilitar olhar/listar no console do
 * Firestore sem precisar decodificar o payload inteiro. Retorna o id.
 */
export async function createShortLink(encodedDeck: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = randomId();
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
    if (res.status === 409) continue; // colisão rara (id já existe) — tenta outro
    if (!res.ok) throw new Error(`Firestore respondeu ${res.status}`);
    return id;
  }
  throw new Error('Não consegui gerar um link curto único.');
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
