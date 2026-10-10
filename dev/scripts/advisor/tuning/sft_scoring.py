"""Separate exact answers, abstention, formatting errors, and weak support checks."""
import re

VALUE = r"[-+]?\d+(?:\.\d+)?(?:[~–]\d+(?:\.\d+)?)?"
UNIT = r"(?:%|초|분|시간|골드|회|번|LP)"
SPAN = re.compile(r"(?<![\d.])" + VALUE + r"(?:\s*" + UNIT + r")?(?:\s+" + VALUE + r"\s*" + UNIT + r")*")


def supported_scalar(answer, context):
    if answer == "NOT_FOUND": return False
    if not SPAN.fullmatch(answer): return False
    return answer in {match.group(0) for match in SPAN.finditer(context)}


def error_kind(answer, row):
    if answer == row["answer"]: return None
    if not row["answerable"]: return "unsupported-answer"
    if answer == "NOT_FOUND": return "false-abstention"
    values = lambda text: re.findall(VALUE, text)
    return "unit-or-format" if values(answer) == values(row["answer"]) else "wrong-value"


def summarize(rows):
    result = {"correct": sum(row["correct"] for row in rows), "total": len(rows)}
    for key, subset in [("positive", [row for row in rows if row["answerable"]]),
                        ("negative", [row for row in rows if not row["answerable"]])]:
        result[key] = {"correct": sum(row["correct"] for row in subset), "total": len(subset)}
    groups = {}
    for row in rows:
        if row["kind"] == "supported": groups.setdefault(row["factGroup"], []).append(row["correct"])
    result["factGroupsAllCorrect"] = {"correct": sum(all(values) for values in groups.values()), "total": len(groups)}
    result["errors"] = {kind: sum(row["error"] == kind for row in rows)
                        for kind in ["unsupported-answer", "false-abstention", "unit-or-format", "wrong-value"]}
    result["wrongButVerbatim"] = sum(not row["correct"] and row["verbatimScalar"] for row in rows)
    return result
