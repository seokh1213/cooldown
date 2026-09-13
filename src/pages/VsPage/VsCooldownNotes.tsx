import { useTranslation } from "@/i18n";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { ACTIVE_SLOTS, cooldownNotes } from "./vsCooldownTable";
import type { VsSideKey } from "./vsState";

export function VsCooldownNotes({ sides }: { sides: { side: VsSideKey; detail?: ChampionDetailV2 }[] }) {
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
    <section className="mt-8" aria-label={t.comparison.cooldownReference}>
      <h2 className="mb-3 px-0.5 text-sm font-semibold tracking-tight">{t.comparison.cooldownReference}</h2>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.side} className="min-w-0">
            <h3 className="mb-2 text-xs text-muted-foreground">{group.name}</h3>
            <div className="space-y-2.5">
              {group.notes.map((note) => (
                <p key={note.slot + note.name} data-cooldown-notes data-side={group.side} data-slot={note.slot} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="mr-2 font-semibold text-foreground">{note.slot} {note.name}</span>{note.text}
                </p>
              ))}
              {!group.notes.length && <span className="text-xs text-muted-foreground/60">—</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
