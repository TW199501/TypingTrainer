/**
 * Text file decoding for imports. Files are read as bytes: UTF-8 when the bytes
 * are valid UTF-8 (a byte order mark is dropped), Big5 otherwise, so older
 * Traditional Chinese files do not turn into mojibake.
 */

const BOM = [0xef, 0xbb, 0xbf]

/** Decodes file bytes as UTF-8, or as Big5 when they are not valid UTF-8. */
export function decodeText(data: ArrayBuffer | Uint8Array): string {
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (BOM.every((b, i) => bytes[i] === b)) bytes = bytes.subarray(BOM.length)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('big5').decode(bytes)
  }
}

/** Reads a dropped or chosen file and decodes it with {@link decodeText}. */
export function readTextFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(decodeText(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}
