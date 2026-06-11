export function formatPriceCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parsePriceInput(value: string): number | null {
  const num = Number(value.replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}
