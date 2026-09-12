import type { AbilityForm } from "@/data/contracts/championData";

export function AbilityFormIcon(props: { forms: AbilityForm[]; label: string; className?: string }) {
  const [a, b] = props.forms;
  return (
    <span role="img" aria-label={props.label} className={"relative inline-block size-10 shrink-0 overflow-hidden rounded bg-muted " + (props.className ?? "")} data-form-icon data-skill-icon>
      {[a, b].map((form, index) => (
        <img key={form.key} src={"https://raw.communitydragon.org/" + form.iconVersion + "/game/" + form.iconPath} alt="" className="absolute inset-0 size-full object-cover shadow-none" style={{ boxShadow: "none", clipPath: index === 0 ? "polygon(0 0, 0 100%, 100% 100%)" : "polygon(0 0, 100% 0, 100% 100%)" }} data-form-half={form.key} />
      ))}
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" aria-hidden="true"><path d="M0 0L40 40" stroke="white" strokeWidth="1.5" /></svg>
      <span aria-hidden="true" className="absolute bottom-0 left-0 bg-black/80 px-0.5 text-[9px] leading-3 text-white">A</span>
      <span aria-hidden="true" className="absolute right-0 top-0 bg-black/80 px-0.5 text-[9px] leading-3 text-white">B</span>
    </span>
  );
}
