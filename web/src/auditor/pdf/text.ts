/**
 * Makes UI strings safe for the PDF fonts: the bundled Inter subsets have no
 * arrows, ticks or emoji, so those are swapped or removed.
 */
export function pdfText(s: string | undefined): string {
  if (!s) return ''
  return s
    .replace(/→/g, '›')
    .replace(/⇒/g, '›')
    .replace(/≈/g, '~')
    .replace(/[✓✔✅]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/\u{FE0F}|\u{200D}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
