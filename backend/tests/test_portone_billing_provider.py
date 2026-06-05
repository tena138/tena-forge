import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services import portone_billing  # noqa: E402


def settings(**overrides):
    base = {
        "portone_store_id": "store-test",
        "portone_channel_key": "",
        "portone_channel_key_inicis": "",
        "portone_channel_key_nice": "",
        "portone_billing_channel_key_inicis": "",
        "portone_general_channel_key_inicis": "",
        "portone_billing_channel_key_toss": "",
        "portone_general_channel_key_toss": "",
        "portone_api_secret": "",
        "portone_webhook_secret": "",
        "portone_primary_pg_provider": "inicis",
        "portone_billing_key_method": "CARD",
        "portone_easy_pay_provider": "",
        "portone_easy_pay_available_methods": "",
        "portone_is_test_channel": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class PortOneBillingProviderTests(unittest.TestCase):
    def test_inicis_billing_channel_is_primary(self):
        with patch.object(
            portone_billing,
            "get_settings",
            return_value=settings(
                portone_billing_channel_key_inicis="inicis-billing",
                portone_billing_channel_key_toss="toss-billing",
            ),
        ), patch.dict(os.environ, {}, clear=True):
            config = portone_billing.portone_public_config("billing")

        self.assertEqual(config["channel_key"], "inicis-billing")
        self.assertEqual(config["pg_provider"], "inicis")
        self.assertEqual(config["pg_provider_label"], "KG Inicis")

    def test_inicis_general_channel_is_primary(self):
        with patch.object(
            portone_billing,
            "get_settings",
            return_value=settings(
                portone_general_channel_key_inicis="inicis-general",
                portone_general_channel_key_toss="toss-general",
            ),
        ), patch.dict(os.environ, {}, clear=True):
            config = portone_billing.portone_public_config("general")

        self.assertEqual(config["channel_key"], "inicis-general")
        self.assertEqual(config["pg_provider"], "inicis")

    def test_toss_channel_remains_fallback(self):
        with patch.object(
            portone_billing,
            "get_settings",
            return_value=settings(portone_billing_channel_key_toss="toss-billing"),
        ), patch.dict(os.environ, {}, clear=True):
            config = portone_billing.portone_public_config("billing")

        self.assertEqual(config["channel_key"], "toss-billing")
        self.assertEqual(config["pg_provider"], "toss")

    def test_primary_provider_can_be_switched_back_to_toss(self):
        with patch.object(
            portone_billing,
            "get_settings",
            return_value=settings(
                portone_primary_pg_provider="toss",
                portone_billing_channel_key_inicis="inicis-billing",
                portone_billing_channel_key_toss="toss-billing",
            ),
        ), patch.dict(os.environ, {}, clear=True):
            config = portone_billing.portone_public_config("billing")

        self.assertEqual(config["channel_key"], "toss-billing")
        self.assertEqual(config["pg_provider"], "toss")


if __name__ == "__main__":
    unittest.main()
