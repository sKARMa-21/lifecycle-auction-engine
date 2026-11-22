import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

prepareZXingModule({ overrides: { locateFile: () => wasmUrl } })

export async function readQR(photo: File, signal: AbortSignal) {
  const url = URL.createObjectURL(photo)
  const image = new Image()
  const canvas = document.createElement('canvas')
  try {
    image.src = url
    await image.decode().catch(() => { throw new Error('Could not open the photo. Try taking another one.') })
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not read the photo.')

    // Retry the middle at higher detail when a small sticker is centered in the photo.
    for (const fraction of [1, 0.5]) {
      signal.throwIfAborted()
      const width = image.naturalWidth * fraction
      const height = image.naturalHeight * fraction
      const scale = Math.min(1, 2600 / Math.max(width, height))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2,
        width, height, 0, 0, canvas.width, canvas.height)
      const [code] = await readBarcodes(context.getImageData(0, 0, canvas.width, canvas.height), {
        formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryDenoise: true,
      })
      if (code?.text.trim()) return code.text.trim()
    }
    throw new Error('No QR code found. Center the entire sticker in the photo and avoid glare.')
  } finally {
    canvas.width = 0
    canvas.height = 0
    URL.revokeObjectURL(url)
  }
}
