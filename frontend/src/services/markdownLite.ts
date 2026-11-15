/**
 * Markdown mínimo y seguro para mostrar la respuesta del modelo.
 *
 * La salida de un modelo es texto no confiable: nunca se inserta como HTML.
 * Se convierte en bloques (títulos, párrafos, listas) y fragmentos en línea
 * (texto, negrita, cursiva, código) que la plantilla pinta como texto.
 */

export type InlineToken = { kind: 'text' | 'strong' | 'em' | 'code'; text: string }

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; inline: InlineToken[] }
  | { kind: 'paragraph'; inline: InlineToken[] }
  | { kind: 'list'; ordered: boolean; items: InlineToken[][] }

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*)/g

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ kind: 'text', text: text.slice(last, index) })
    const raw = match[0]
    if (raw.startsWith('**') || raw.startsWith('__')) tokens.push({ kind: 'strong', text: raw.slice(2, -2) })
    else if (raw.startsWith('`')) tokens.push({ kind: 'code', text: raw.slice(1, -1) })
    else tokens.push({ kind: 'em', text: raw.slice(1, -1) })
    last = index + raw.length
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) })
  return tokens
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: InlineToken[][] } | null = null

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) })
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ kind: 'list', ordered: list.ordered, items: list.items })
      list = null
    }
  }

  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      const level = Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4
      blocks.push({ kind: 'heading', level, inline: parseInline(heading[2].replace(/#+$/, '').trim()) })
      continue
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push(parseInline((bullet ?? numbered)![1]))
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}
