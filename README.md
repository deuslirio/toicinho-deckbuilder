# Toicinho Deckbuilder

Deckbuilder **estático** (GitHub Pages) para o formato **Toicinho** da
[Bacon Arcano](https://www.baconarcano.com). Busca de cartas em **português e inglês**,
validação da **banlist própria** e das regras de raridade do formato.

- Sem backend. Tudo roda no navegador.
- Dados do [Scryfall](https://scryfall.com); imagens servidas pelo CDN deles (hot-link).
- Banlist gerada a partir da [página oficial](https://www.baconarcano.com/blog/banidas).

## Regras do Toicinho implementadas

| Regra | Onde |
|---|---|
| Cópias por raridade: comum 3 · incomum 3 · rara 2 · mítica 1 | `src/formats/toicinho.ts` |
| Lendária (qualquer carta com "Legendary" no tipo) = 1 cópia | idem |
| Pool: 4ª Edição (1995) em diante | flag `poolLegal` no índice |
| Inválidas: menção a *Commander* / *Command Zone* na caixa de regras | idem |
| Deck mínimo 60 · sideboard máximo 15 | `checkDeck()` |
| Banlist (~695 cartas, sem restritas) | `src/formats/toicinho.banlist.json` |

Terras básicas e cartas "qualquer quantidade" (Rat Colony, Persistent Petitioners…)
não têm limite. Raridade usada é a da **impressão mais recente** (ignorando promos /
Secret Lair / sets não lançados).

## Pipeline de dados

Dois scripts geram os dados. **Nenhum bulk gigante vai pro repositório nem pro Pages** —
eles são baixados no CI, consumidos em streaming e descartados.

### `npm run data:cards` → `public/data/cards.json` (~12 MB, ~3 MB gzip)

1. Baixa o bulk `all_cards` do Scryfall (JSONL gzip, ~390 MB) — só no runner.
2. Stream (gunzip + linha a linha), agrupa por `oracle_id`.
3. Guarda a impressão mais recente (raridade/set/cmc/tipo/cor/imagem) e o
   `printed_name` da impressão em português mais recente.
4. Marca `poolLegal` (4ª Edição+ e sem menção a Commander).

> Esse arquivo é **gitignored**. Só existe depois de rodar o script ou no deploy.

### `npm run data:banlist` → `src/formats/toicinho.banlist.json`

1. Baixa `https://www.baconarcano.com/blog/banidas?format=json-pretty`
   (o site é Squarespace e expõe o post como JSON — **não precisa de headless browser**).
2. Separa os nomes por seção de cor, normaliza (nbsp, aspas tortas) e aplica
   correções de digitação conhecidas (`MANUAL_FIXES` no script).
3. Valida cada nome contra o Scryfall (`/cards/collection`), com fallback fuzzy.
4. Grava a lista com nomes canônicos + `toicinho.banlist.report.json` (divergências).

> Esse arquivo **é commitado** e é a fonte da verdade. **Não roda no CI** — a banlist
> do Toicinho quase nunca muda e o scrape depende do layout do site.
> Quando a Bacon Arcano atualizar a lista:
>
> ```bash
> npm run data:banlist        # raspa + valida + gera o JSON e o report
> git diff src/formats/        # revise as mudanças e o toicinho.banlist.report.json
> git add src/formats/ && git commit
> ```
>
> Trava de sanidade: se o scrape trouxer menos de 600 cartas (layout mudou), o script
> aborta sem sobrescrever o JSON bom.

## Desenvolvimento

```bash
npm install
npm run data          # gera cards.json + banlist (primeira vez / para testar)
npm run dev
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` faz tudo: gera os dados, builda e publica.

1. **Settings → Pages → Source: GitHub Actions.**
2. Push na `main` (ou "Run workflow"). O cron semanal (segunda) regenera o índice.
3. O site sai em `https://<user>.github.io/<repo>/`.
   Para domínio próprio ou user/org page, troque `VITE_BASE` para `/` no workflow.

## Stack

Vite · React · TypeScript · [MiniSearch](https://github.com/lucaong/minisearch)
(busca client-side, tolerante a acento) · Zustand (estado + `localStorage`).
Deck compartilhável via `#d=` na URL (sem servidor).

## Limitações conhecidas / próximos passos

- `cards.json` de ~12 MB carrega de uma vez. Dá pra dividir por inicial ou enxugar campos.
- A regra de raridade para cartas "special"/"bonus" é tratada como limite 1 e sinalizada — confirmar com a organização.
