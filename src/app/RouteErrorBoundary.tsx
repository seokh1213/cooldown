import { Component, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { useTranslation } from "@/shared/i18n";

export function RouteLoadError() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 pt-4 text-sm text-muted-foreground md:px-6">
      <span>{t.app.loadError}</span>
      <Button variant="outline" className="h-11 shrink-0" onClick={() => window.location.reload()}>{t.app.retry}</Button>
    </div>
  );
}

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <RouteLoadError /> : this.props.children;
  }
}
