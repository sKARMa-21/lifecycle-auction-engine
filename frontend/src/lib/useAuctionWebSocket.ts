import { useEffect, useRef } from 'react'
import type { AuctionBidEvent } from '../types/auction'

const WS_BASE_URL = 'ws://127.0.0.1:8000/ws/auctions'

export function useAuctionWebSocket(
  auctionId: number | null,
  onBid: (event: AuctionBidEvent) => void
) {
  const onBidRef = useRef(onBid)
  onBidRef.current = onBid

  useEffect(() => {
    if (!auctionId) return

    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let isCancelled = false

    const connect = () => {
      if (isCancelled) return
      socket = new WebSocket(`${WS_BASE_URL}/${auctionId}`)

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload && payload.type === 'NEW_BID') {
            onBidRef.current(payload)
          }
        } catch {}
      }

      socket.onclose = () => {
        if (!isCancelled) {
          reconnectTimer = window.setTimeout(connect, 3000)
        }
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      isCancelled = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [auctionId])
}

export function useAuctionSubscriptions(
  auctionIds: number[],
  onBid: (auctionId: number, event: AuctionBidEvent) => void
) {
  const onBidRef = useRef(onBid)
  onBidRef.current = onBid
  const idsKey = auctionIds.slice().sort().join(',')

  useEffect(() => {
    if (auctionIds.length === 0) return

    const sockets: WebSocket[] = []
    let isCancelled = false

    auctionIds.forEach((id) => {
      const socket = new WebSocket(`${WS_BASE_URL}/${id}`)

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload && payload.type === 'NEW_BID') {
            onBidRef.current(id, payload)
          }
        } catch {}
      }

      socket.onerror = () => {
        socket.close()
      }

      sockets.push(socket)
    })

    return () => {
      isCancelled = true
      sockets.forEach((s) => s.close())
    }
  }, [idsKey])
}
