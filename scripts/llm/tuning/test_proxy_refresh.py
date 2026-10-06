from types import SimpleNamespace
import unittest
from unittest.mock import patch
from colab_transport import perform


class ProxyRefreshTest(unittest.TestCase):
    def test_expired_proxy_disguised_as_missing_file_retries_after_owned_refresh(self):
        expired = SimpleNamespace(token="expired", url="runtime")
        renewed = SimpleNamespace(token="renewed", url="runtime")
        with patch("colab_transport.owned_session", return_value=expired), \
             patch("colab_transport.refreshed_session", return_value=renewed), \
             patch("colab_transport.operate", side_effect=[FileNotFoundError(), None]) as operate:
            perform({"metadata": {}})
            self.assertIs(operate.call_args_list[1].args[1], renewed)
            self.assertEqual(operate.call_count, 2)

    def test_real_missing_file_does_not_loop_when_credentials_are_unchanged(self):
        session = SimpleNamespace(token="unchanged", url="runtime")
        with patch("colab_transport.owned_session", return_value=session), \
             patch("colab_transport.refreshed_session", return_value=session), \
             patch("colab_transport.operate", side_effect=FileNotFoundError()) as operate:
            with self.assertRaises(FileNotFoundError): perform({"metadata": {}})
            self.assertEqual(operate.call_count, 1)


if __name__ == "__main__": unittest.main()
