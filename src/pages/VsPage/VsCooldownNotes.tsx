import { useTranslation } from "@/i18n";
import { ACTIVE_SLOTS, cooldownNotes } from "./vsCooldownTable";
import type { MatrixSide } from "./VsCooldownMatrix";

export function VsCooldownNotes({ sides }: { sides: MatrixSide[] }) {
  const { t } = useTranslation();
  const groups = sides.map(({ side, detail }) => ({
    side, name: detail?.champion.name ?? t.comparison[side],
    notes: ACTIVE_SLOTS.flatMap((slot) => {
      const ability = detail?.champion.abilities[slot];
      const bodies = ability?.forms?.map((form) => ({ name: form.key + " " + form.label + " · " + form.name, html: form.bodyHtml })) ?? [{ name: ability?.name, html: ability?.bodyHtml || ability?.summary || "" }];
      return bodies.flatMap(({ name, html }) => {
        const notes = cooldownNotes(html);
        return notes.length ? [{ slot, name, text: notes.join(" ") }] : [];
      });
    }),
  }));
  if (groups.every((group) => !group.notes.length)) return null;
  return (
    <section className="mt-6 border-b border-border pb-5" aria-label={t.comparison.cooldownReference}>
      <h2 className="text-sm font-semibold">{t.comparison.cooldownReference}</h2>
      <div className="grid gap-x-8 gap-y-4 pt-3 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.side}>
            <h3 className="mb-2 text-xs font-semibold">{group.name} <span className="ml-1 font-normal text-muted-foreground">{t.comparison[group.side]}</span></h3>
            <div className="space-y-3">
              {group.notes.map((note) => (
                <p key={note.slot + note.name} data-cooldown-notes data-side={group.side} data-slot={note.slot} className="text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                  <span className="mr-2 font-semibold text-foreground">{note.slot} · {note.name}</span>{note.text}
                </p>
              ))}
              {!group.notes.length && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
