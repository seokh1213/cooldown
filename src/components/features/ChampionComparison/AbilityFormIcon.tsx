import type { AbilityForm } from "@/data/contracts/championData";
import { formIconUrl } from "@/data/assets/riotAssetUrls";

/**
 * 변신 스킬은 꼴이 둘이라 아이콘도 둘이다. 한 칸에 대각선으로 겹쳐 그린다.
 *
 * 아이콘은 우리 자리에서 온다. 예전에는 `raw.communitydragon.org` 를 직접 봤는데,
 * 서비스워커가 맡지 못해 볼 때마다 밖으로 나갔고 그쪽이 흔들리면 그림이 빈다.
 */
export function AbilityFormIcon(props: { forms: AbilityForm[]; label: string; ddragonVersion: string; className?: string }) {
  const [a, b] = props.forms;
  return (
    <span role="img" aria-label={props.label} className={"relative inline-block size-10 shrink-0 overflow-hidden rounded bg-muted " + (props.className ?? "")} data-form-icon data-skill-icon>
      {[a, b].map((form, index) => (
        <img key={form.key} src={formIconUrl(props.ddragonVersion, form.iconPath)} alt="" decoding="async" className="absolute inset-0 size-full object-cover shadow-none" style={{ boxShadow: "none", clipPath: index === 0 ? "polygon(0 0, 0 100%, 100% 100%)" : "polygon(0 0, 100% 0, 100% 100%)" }} data-form-half={form.key} />
      ))}
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" aria-hidden="true"><path d="M0 0L40 40" stroke="white" strokeWidth="1.5" /></svg>
      <span aria-hidden="true" className="absolute bottom-0 left-0 bg-black/80 px-0.5 text-[9px] leading-3 text-white">A</span>
      <span aria-hidden="true" className="absolute right-0 top-0 bg-black/80 px-0.5 text-[9px] leading-3 text-white">B</span>
    </span>
  );
}
