import unittest
from sft_scoring import error_kind, supported_scalar


class ScoringTest(unittest.TestCase):
    def test_support_rejects_lost_unit_and_partial_number(self):
        self.assertFalse(supported_scalar("125", "방패를 깨면 125골드입니다."))
        self.assertFalse(supported_scalar("800", "최대 체력 1800입니다."))
        self.assertTrue(supported_scalar("175", "반경은 175입니다."))

    def test_compound_range_and_signed_units_are_preserved(self):
        for answer in ["2분 55초", "2~7번", "-5 LP"]:
            self.assertTrue(supported_scalar(answer, f"자료의 값은 {answer}입니다."))

    def test_verbatim_support_does_not_claim_semantic_correctness(self):
        self.assertTrue(supported_scalar("48초", "48초부터 90초마다 충전됩니다."))
        self.assertEqual(error_kind("48초", {"answer": "90초", "answerable": True}), "wrong-value")
        self.assertEqual(error_kind("125", {"answer": "125골드", "answerable": True}), "unit-or-format")
        self.assertEqual(error_kind("NOT_FOUND", {"answer": "90초", "answerable": True}), "false-abstention")


if __name__ == "__main__": unittest.main()
