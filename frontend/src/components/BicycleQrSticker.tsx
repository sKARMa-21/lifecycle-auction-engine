import { QRCodeSVG } from 'qrcode.react'

const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || location.origin).replace(/\/+$/, '')
const LOCAL_ONLY = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(PUBLIC_URL)

export const scanLink = (token: string) => `${PUBLIC_URL}/s/${token}`

export default function BicycleQrSticker({ assetTag, token }: { assetTag: string; token: string }) {
  return (
    <div className="card-wide">
      <h3>QR Sticker</h3>
      {LOCAL_ONLY && (
        <p className="alert alert-error">
          This QR points to {PUBLIC_URL}, which a phone cannot open. Set VITE_PUBLIC_URL or open the app by its network address before printing.
        </p>
      )}
      <div className="qr-sticker">
        <QRCodeSVG value={scanLink(token)} size={176} marginSize={2} level="M" title={`QR code for bicycle ${assetTag}`} />
        <strong>{assetTag}</strong>
        <span>{token}</span>
      </div>
      <button type="button" className="btn-submit btn-sm qr-print" onClick={() => window.print()}>Print sticker</button>
    </div>
  )
}
