import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface DriftIssue {
  number: number;
  body: string;
  comments: Array<{ body: string; author: { login: string } }>;
}

type GitHubCli = (args: string[]) => string;
const githubCli: GitHubCli = args => execFileSync("gh", args, { encoding: "utf8" });

export function updateKnowledgeDriftIssue(reportFile: string, gh: GitHubCli = githubCli) {
  const body = readFileSync(reportFile, "utf8").trim();
  if (!body) return "empty";
  const title = "지식 계층 점검 필요";
  const issues = JSON.parse(gh(["issue", "list", "--state", "open", "--search", `${title} in:title`, "--json", "number,title"])) as Array<{ number: number; title: string }>;
  const issue = issues.find(issue => issue.title === title);
  if (!issue) {
    gh(["issue", "create", "--title", title, "--body-file", reportFile]);
    return "created";
  }
  const current = JSON.parse(gh(["issue", "view", String(issue.number), "--json", "number,body,comments"])) as DriftIssue;
  const previous = current.comments.filter(comment => /^github-actions(?:\[bot\])?$/.test(comment.author.login)).at(-1)?.body ?? current.body;
  // 본문 지문이 보고서에 포함되어 있어 다른 원문 변경은 새 알림으로 남는다.
  if (previous.trim() === body) return "unchanged";
  gh(["issue", "comment", String(issue.number), "--body-file", reportFile]);
  return "updated";
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`지식 계층 이슈: ${updateKnowledgeDriftIssue("knowledge-drift-report.md")}`);
}
