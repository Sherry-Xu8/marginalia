// Turns a photo you choose into a small JPEG that is saved inside the app (and in backups).
export async function fileToDataUrl(file: File, maxSide = 720, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > 25_000_000) throw new Error('That photo is too large. Try one under 25 MB.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That photo format can’t be read here. Try a JPEG or PNG.')
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}
