import json
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from app.core.redis import publish_auction_event
from app.schemas.auction import AuctionBidEvent


class TestAuctionPubSub(unittest.TestCase):
    @patch("app.core.redis.redis_client")
    def test_publish_auction_event(self, mock_redis):
        auction_id = 42
        event_data = {
            "type": "NEW_BID",
            "bidder_id": 12,
            "amount": 650.0,
            "ends_at": datetime(2026, 11, 23, 18, 0, 0, tzinfo=timezone.utc).isoformat(),
            "extended": True,
        }

        publish_auction_event(auction_id, event_data)

        mock_redis.publish.assert_called_once()
        channel, message = mock_redis.publish.call_args[0]
        self.assertEqual(channel, "auction:42")

        parsed = json.loads(message)
        self.assertEqual(parsed["type"], "NEW_BID")
        self.assertEqual(parsed["bidder_id"], 12)
        self.assertEqual(parsed["amount"], 650.0)
        self.assertEqual(parsed["extended"], True)

    def test_auction_bid_event_schema(self):
        event = AuctionBidEvent(
            type="NEW_BID",
            bidder_id=12,
            amount=650.0,
            ends_at=datetime(2026, 11, 23, 18, 0, 0, tzinfo=timezone.utc),
            extended=True,
        )
        self.assertEqual(event.type, "NEW_BID")
        self.assertEqual(event.bidder_id, 12)
        self.assertEqual(event.amount, 650.0)
        self.assertTrue(event.extended)

    @patch("app.core.redis.redis_client")
    def test_publish_failure_does_not_raise(self, mock_redis):
        mock_redis.publish.side_effect = Exception("Redis connection error")
        event_data = {
            "type": "NEW_BID",
            "bidder_id": 1,
            "amount": 100.0,
            "ends_at": "2026-11-23T18:00:00Z",
            "extended": False,
        }
        try:
            publish_auction_event(1, event_data)
        except Exception as e:
            self.fail(f"publish_auction_event raised an unexpected exception: {e}")


if __name__ == "__main__":
    unittest.main()
