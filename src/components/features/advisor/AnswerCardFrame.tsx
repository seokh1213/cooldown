/**
 * 답 카드들이 함께 쓰는 틀과 칸 — 머리·몸·꼬리 틀, 슬롯 칩, 라벨·값 표, 접는 칸, 운용 노트 목록
 */
import { Link } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";

/** 카드 틀. 머리(아이콘·이름·종류 칩) / 몸 / 꼬리(출처·링크). */
export function Frame(props: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tool: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full overflow-hidden rounded-xl border bg-background text-sm">
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        {props.icon}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-semibold">{props.title}</div>
          {props.subtitle && <div className="truncate text-xs text-muted-foreground">{props.subtitle}</div>}
        </div>
        <span className="shrink-0 rounded-full border px-2 py-px text-[11px] text-muted-foreground">{props.tool}</span>
      </div>
      <div className="px-3 py-2.5">{props.children}</div>
      {props.footer && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          {props.footer}
        </div>
      )}
    </div>
  );
}

/** 카드 꼬리: 패치와 그 화면으로 가는 링크. */
export function PatchLinkFooter({ patch, to, label, onNavigate }: { patch: string; to: string; label: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <span>{fill(t.advisor.card.patch, { patch })}</span>
      <Link to={to} onClick={onNavigate} className="text-primary hover:underline">
        {label}
      </Link>
    </>
  );
}

/** 슬롯 글자 칩. 스킬 아이콘 id 가 카드 데이터에 없어 글자로 대신한다. */
export function SlotBadge({ slot }: { slot: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
      {slot}
    </span>
  );
}

/** 라벨·값 표. `hit` 행은 굵게, `dim` 행은 흐리게. */
export function KvTable({ rows }: { rows: Array<{ label: string; value: React.ReactNode; hit?: boolean; dim?: boolean }> }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full border-collapse text-[13px]">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className={`border-b last:border-b-0 ${row.hit ? "font-semibold" : ""} ${row.dim ? "text-muted-foreground" : ""}`}
          >
            <td className={`w-[34%] py-1.5 pr-2 align-top ${row.hit ? "" : "text-muted-foreground"}`}>{row.label}</td>
            <td className="py-1.5 align-top tabular-nums">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer select-none py-1 text-primary marker:content-none">▸ {summary}</summary>
      <div className="pt-1 leading-relaxed text-foreground/85">{children}</div>
    </details>
  );
}

/*
 * 운용 노트는 전부 접어 둔다.
 *
 * 예전에는 둘을 펼쳐 두었다. 그때는 해설이 태그와 능력치로만 쓰여 노트와 겹치지
 * 않았다. 지금은 해설이 노트를 재료로 쓰고, 재보니 문장의 95%가 거기서 온다.
 * 그러면 서랍 안에서 같은 글을 두 번 읽게 된다 — 대화에서 한 번, 카드에서 또 한 번.
 *
 * 읽는 길은 해설로 두고, 카드의 노트는 근거를 확인하러 펼치는 자리로 둔다.
 * 지우지 않는 이유는 사람이 검증한 원문이 해설의 근거이기 때문이다.
 */
const NOTES_OPEN = 0;

function NoteItems({ items }: { items: string[] }) {
  return (
    <>
      {items.map((note) => (
        <li key={note} className="flex gap-1.5">
          <span className="select-none text-muted-foreground">·</span>
          <span>{note}</span>
        </li>
      ))}
    </>
  );
}

/** 운용 노트 목록. 앞 `NOTES_OPEN` 개만 펼치고 나머지는 접는다. */
export function NoteList({ items }: { items: string[] }) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="space-y-1.5 text-[13px] leading-relaxed">
        <NoteItems items={items.slice(0, NOTES_OPEN)} />
      </ul>
      {items.length > NOTES_OPEN && (
        <Disclosure summary={fill(t.advisor.card.moreNotes, { count: items.length - NOTES_OPEN })}>
          <ul className="space-y-1.5 text-[13px]">
            <NoteItems items={items.slice(NOTES_OPEN)} />
          </ul>
        </Disclosure>
      )}
    </>
  );
}
