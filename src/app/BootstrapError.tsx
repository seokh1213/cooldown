interface BootstrapErrorProps {
  message: string;
  onRetry: () => void;
}

export function BootstrapError({ message, onRetry }: BootstrapErrorProps) {
  const { t } = useTranslation();
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-lg font-semibold">{t.app.loadError}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-[background-color,box-shadow] duration-150 hover:bg-primary-hover hover:shadow-sm hover:shadow-primary/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
        >
          {t.app.retry}
        </button>
      </div>
    </main>
  );
}
import { useTranslation } from "@/i18n";
