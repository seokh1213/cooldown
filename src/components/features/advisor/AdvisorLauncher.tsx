import { MessageCircle } from "lucide-react";
import { useTranslation } from "@/i18n";

interface AdvisorLauncherProps {
  onClick: () => void;
  pending?: boolean;
  loadingModel?: boolean;
  percent?: number;
  generating?: boolean;
}

export function AdvisorLauncher({ onClick, pending, loadingModel, percent = 0, generating }: AdvisorLauncherProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-advisor-launcher
      onClick={onClick}
      aria-label={t.advisor.open}
      aria-expanded={false}
      aria-busy={pending || undefined}
      disabled={pending}
      className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary-hover hover:shadow-xl hover:shadow-primary/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none"
    >
      {loadingModel && (
        <span
          aria-hidden
          className="absolute -inset-1 rounded-full"
          style={{
            background: `conic-gradient(var(--color-primary) ${percent}%, transparent 0)`,
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            opacity: 0.55,
          }}
        />
      )}
      <MessageCircle className="h-6 w-6" />
      {generating && <span className="absolute right-1 top-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />}
    </button>
  );
}
