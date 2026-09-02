export type ColorKey = 'W' | 'U' | 'B' | 'R' | 'G';
export const COLORS: ColorKey[] = ['W', 'U', 'B', 'R', 'G'];

export const COLOR_LABEL: Record<ColorKey, string> = {
  W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde',
};

/**
 * Conta os símbolos de mana colorida de um custo ("{1}{W}{W}", "{W/U}", "{2/B}", "{G/P}").
 * Híbrido/Phyrexiano conta 1 para cada cor que aparece no símbolo — o suficiente para
 * dimensionar a base de terrenos ("essa carta quer branco").
 */
export function countPips(manaCost: string): Record<ColorKey, number> {
  const out: Record<ColorKey, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const sym of manaCost.match(/\{[^}]+\}/g) ?? []) {
    for (const c of COLORS) if (sym.includes(c)) out[c] += 1;
  }
  return out;
}
