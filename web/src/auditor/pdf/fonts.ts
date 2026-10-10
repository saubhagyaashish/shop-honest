import { Font } from '@react-pdf/renderer'
import bricolage700ext from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-ext-700-normal.woff?url'
import bricolage700 from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff?url'
import bricolage800ext from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-ext-800-normal.woff?url'
import bricolage800 from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff?url'
import inter400ext from '@fontsource/inter/files/inter-latin-ext-400-normal.woff?url'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import inter600ext from '@fontsource/inter/files/inter-latin-ext-600-normal.woff?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import inter700ext from '@fontsource/inter/files/inter-latin-ext-700-normal.woff?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url'

let registered = false

/** Latin files carry the text; latin-ext files supply ₹ and other extended glyphs. */
export function registerPdfFonts() {
  if (registered) return
  registered = true
  Font.register({ family: 'Inter', fonts: [{ src: inter400 }, { src: inter600, fontWeight: 600 }, { src: inter700, fontWeight: 700 }] })
  Font.register({ family: 'InterExt', fonts: [{ src: inter400ext }, { src: inter600ext, fontWeight: 600 }, { src: inter700ext, fontWeight: 700 }] })
  Font.register({ family: 'Bricolage', fonts: [{ src: bricolage700, fontWeight: 700 }, { src: bricolage800, fontWeight: 800 }] })
  Font.register({ family: 'BricolageExt', fonts: [{ src: bricolage700ext, fontWeight: 700 }, { src: bricolage800ext, fontWeight: 800 }] })
  // Keep words whole; hyphenated legal text reads badly.
  Font.registerHyphenationCallback((word) => [word])
}

export const BODY_FONT = ['Inter', 'InterExt']
export const DISPLAY_FONT = ['Bricolage', 'BricolageExt', 'InterExt']
