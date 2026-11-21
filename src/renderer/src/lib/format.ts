/** 1 234 567 → "1,2 Mo" (French units). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} o`
  const units = ['ko', 'Mo', 'Go', 'To']
  let value = bytes
  let unit = -1
  do {
    value /= 1000
    unit++
  } while (value >= 1000 && unit < units.length - 1)
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`
}
