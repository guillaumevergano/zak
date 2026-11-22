import { locale, t } from '@shared/i18n'

/** 1 234 567 → "1,2 Mo" (units of the interface language). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return t('{n} o', { n: bytes })
  const units = [t('ko'), t('Mo'), t('Go'), t('To')]
  let value = bytes
  let unit = -1
  do {
    value /= 1000
    unit++
  } while (value >= 1000 && unit < units.length - 1)
  return `${value.toLocaleString(locale(), { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`
}
