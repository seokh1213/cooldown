import unittest
from span_candidates import candidates, choose


class SpanCandidatesTest(unittest.TestCase):
    def test_units_ranges_signs_and_composite_time_are_complete(self):
        for value in ["2분 55초", "2~7번", "-5 LP", "0.25초", "7%"]:
            entries = candidates(f"조건에 해당하면 {value}입니다.", "값은 얼마야?")
            self.assertIn(value, [entry["answer"] for entry in entries])

    def test_repeated_value_is_not_false_ambiguity(self):
        entries = [{"answer":"7%"},{"answer":"7%"},{"answer":"0.25초"}]
        self.assertEqual(choose(entries,[.9,.89,.2],.8,.1),"7%")
        self.assertEqual(choose(entries,[.9,.89,.88],.8,.1),"NOT_FOUND")
        self.assertEqual(choose([],[],.8,.1),"NOT_FOUND")


if __name__ == "__main__": unittest.main()
