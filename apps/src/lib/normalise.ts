/**
 * Practice text clean-up, the same rules as the server's `TextContent.Normalise`,
 * so a text added in the web build can be typed just like one stored by the API.
 */

/** Whitespace as .NET's `char.IsWhiteSpace` sees it, which is what the server trims. */
const TRAILING_SPACE = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/

/**
 * CRLF and lone CR become LF, a tab becomes one space, whitespace at the end of
 * each line is dropped, and blank lines at the start and the end are removed.
 * Running it on its own output changes nothing.
 */
export function normaliseContent(content: string | null | undefined): string {
  const lines = (content ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.replace(TRAILING_SPACE, ''))
  let start = 0
  while (start < lines.length && lines[start] === '') start++
  let end = lines.length
  while (end > start && lines[end - 1] === '') end--
  return lines.slice(start, end).join('\n')
}
