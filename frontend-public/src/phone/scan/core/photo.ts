/**
 * The selfie, redrawn as a JPEG before it is sent (the live scanner uses `compressImageToJpeg` from the staff build's
 * receiving client, which pulls IndexedDB code the phone does not need: this is the same 30 lines on their own).
 * The server reads photos with Pillow and refuses HEIC, so a phone's photo is always redrawn: at most `maxEdge` px on its
 * long side, JPEG at `quality`.
 */

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode_failed'))
    }
    img.src = url
  })
}

/** Resize so the longest edge is at most `maxEdge` px, then encode as JPEG. Same defaults as the staff build's. */
export async function compressImageToJpeg(input: Blob, maxEdge = 2048, quality = 0.8): Promise<Blob> {
  const img = await loadImage(input)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const longest = Math.max(w, h)
  const scale = longest > maxEdge ? maxEdge / longest : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no_canvas')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality)
  })
}

/**
 * The selfie as the live Finish joining sends it (FinishJoining.tsx `selfieJpeg`): 1280 px, quality 0.85. Null when this
 * browser cannot read the photo.
 */
export async function selfieJpeg(file: Blob): Promise<Blob | null> {
  try {
    return await compressImageToJpeg(file, 1280, 0.85)
  } catch {
    return null
  }
}
