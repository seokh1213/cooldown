/**
 * 모델 내려받기 동의
 *
 * 수 기가바이트를 사용자 기기에 내려받는 일이므로 **묻기 전에 받지 않는다.**
 * 용량, 저장 위치, 기기를 벗어나지 않는다는 점을 먼저 밝힌다.
 */
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { resolveModel, type WebGpuSupport } from "@/lib/advisor/config";

interface AdvisorConsentProps {
  webgpu: WebGpuSupport | null;
  storage: { quotaMb?: number; usageMb?: number };
  onAccept: () => void;
  onCancel: () => void;
  /** 모델을 받지 않고 코드 답변만으로 써 본다 */
  onSkip: () => void;
}

export function AdvisorConsent({
  webgpu,
  storage,
  onAccept,
  onCancel,
  onSkip,
}: AdvisorConsentProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  const model = resolveModel();

  if (webgpu && !webgpu.supported) {
    const reason =
      webgpu.reason === "no-api"
        ? copy.unsupported.noApi
        : webgpu.reason === "no-adapter"
          ? copy.unsupported.noAdapter
          : copy.unsupported.error;
    return (
      <div className="flex flex-1 flex-col justify-center gap-3 p-6 text-sm">
        <h3 className="text-base font-semibold">{copy.unsupported.title}</h3>
        <p className="text-muted-foreground">{reason}</p>
        {/* 모델을 못 써도 코드가 만드는 답은 줄 수 있다 */}
        <Button variant="outline" onClick={onSkip} className="mt-2">
          {copy.consent.skipModel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 text-sm">
      <h3 className="text-base font-semibold">{copy.consent.title}</h3>
      <p className="text-muted-foreground">{copy.consent.lead}</p>
      <ul className="flex flex-col gap-2 text-muted-foreground">
        <li>· {copy.consent.sizeNotice.replace("{size}", String(model.downloadMb))}</li>
        {storage.quotaMb !== undefined && (
          <li>· {copy.consent.storageNotice.replace("{quota}", String(storage.quotaMb))}</li>
        )}
        <li>· {copy.consent.privacyNotice}</li>
      </ul>
      <p className="break-all font-mono text-xs text-muted-foreground/80">{model.id}</p>
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <div className="flex gap-2">
          <Button onClick={onAccept} disabled={webgpu === null} className="flex-1">
            {copy.consent.accept}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {copy.consent.cancel}
          </Button>
        </div>
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          {copy.consent.skipModel}
        </Button>
      </div>
    </div>
  );
}
