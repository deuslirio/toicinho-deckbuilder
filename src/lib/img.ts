/** URL da imagem grande (normal ~488px) a partir da "small" guardada no índice. */
export function normalUrl(small: string | null): string | null {
  return small ? small.replace('/small/', '/normal/') : null;
}
