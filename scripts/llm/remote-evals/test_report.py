import json
from pathlib import Path
import tempfile
import unittest

from report import aggregate, render_report


class ReportTest(unittest.TestCase):
    def test_aggregate_keeps_separate_evaluation_groups(self):
        result = aggregate([{"set": "route", "ok": True}, {"set": "route", "ok": False}, {"set": "act", "ok": True}])
        self.assertEqual(result["route"], {"correct": 1, "total": 2})
        self.assertEqual(result["act"], {"correct": 1, "total": 1})

    def test_report_escapes_content_and_does_not_claim_pending_candidates_ran(self):
        with tempfile.TemporaryDirectory() as directory:
            state = {"run": "<script>bad</script>", "updated": "2026-10-05", "variants": {"baseline": "running"}, "metrics": {}}
            render_report(directory, state)
            page = (Path(directory) / "index.html").read_text()
            self.assertNotIn("<script>bad</script>", page)
            self.assertIn("&lt;script&gt;bad&lt;/script&gt;", page)
            self.assertEqual(page.count("<td>대기</td>"), 5)
            self.assertEqual(json.loads((Path(directory) / "status.json").read_text())["variants"]["baseline"], "running")


if __name__ == "__main__":
    unittest.main()
