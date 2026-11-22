import { useEffect, useRef } from 'react'
import type { AuctionBidEvent } from '../types/auction'

const WS_BASE_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/auctions`

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

    const activeSockets: WebSocket[] = []
    const timers: number[] = []
    let isCancelled = false

    auctionIds.forEach((id) => {
      const connect = () => {
        if (isCancelled) return
        const socket = new WebSocket(`${WS_BASE_URL}/${id}`)

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data)
            if (payload && payload.type === 'NEW_BID') {
              onBidRef.current(id, payload)
            }
          } catch {}
        }

        socket.onclose = () => {
          if (!isCancelled) {
            const timer = window.setTimeout(connect, 3000)
            timers.push(timer)
          }
        }

        socket.onerror = () => {
          socket.close()
        }

        activeSockets.push(socket)
      }

      connect()
    })

    return () => {
      isCancelled = true
      timers.forEach((t) => window.clearTimeout(t))
      activeSockets.forEach((s) => s.close())
    }
  }, [idsKey])
}
