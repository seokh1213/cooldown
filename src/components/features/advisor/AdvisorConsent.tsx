/**
 * 모델 내려받기 동의
 *
 * 수 기가바이트를 사용자 기기에 내려받는 일이므로 **묻기 전에 받지 않는다.**
 * 용량, 저장 위치, 기기를 벗어나지 않는다는 점을 먼저 밝힌다.
 */
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import type { AdvisorModel, WebGpuSupport } from "@/lib/advisor/config";
import { detectPlatform } from "@/lib/advisor/platform";

/**
 * 내려받기 용량을 사람이 체감하는 단위로 적는다.
 *
 * "2970MB" 는 이동통신 요금제의 단위가 아니다. 요금이 얼마나 나갈지 가늠하려면
 * GB 로 보여야 한다. 1000 으로 나누는 것은 통신사가 데이터를 세는 방식이기 때문이다.
 */
function formatSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)}GB` : `${mb}MB`;
}

/**
 * 이 운영체제에서 실제로 쓸 수 있는 브라우저만 적는다.
 *
 * Safari 는 맥에만 있고, 없는 브라우저를 권하면 안내가 아니라 소음이다.
 * WebGPU 를 싣는 판만 적는다 — Safari 26, Firefox 는 윈도우·맥 모두 최근 판부터다.
 */
function browsersFor(): string {
  switch (detectPlatform()) {
    case "mac":
      return "Safari 26+, Chrome, Edge, Firefox";
    case "windows":
      return "Chrome, Edge, Firefox";
    case "linux":
      return "Chrome, Edge";
    default:
      return "Chrome, Edge";
  }
}

interface AdvisorConsentProps {
  /** 받으려는 모델. 화면에서 바꿀 수 있으므로 훅이 든 값을 받는다. */
  model: AdvisorModel;
  webgpu: WebGpuSupport | null;
  storage: { quotaMb?: number; usageMb?: number };
  onAccept: () => void;
  onCancel: () => void;
  /** 모델을 받지 않고 코드 답변만으로 써 본다 */
  onSkip: () => void;
}

export function AdvisorConsent({
  model,
  webgpu,
  storage,
  onAccept,
  onCancel,
  onSkip,
}: AdvisorConsentProps) {
  const { t } = useTranslation();
  const copy = t.advisor;

  if (webgpu && !webgpu.supported) {
    const reason =
      webgpu.reason === "no-api"
        ? copy.unsupported.noApi.replace("{browsers}", browsersFor())
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
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6 text-sm">
      <h3 className="text-base font-semibold">{copy.consent.title}</h3>
      <p className="text-muted-foreground">{copy.consent.lead}</p>
      <ul className="flex flex-col gap-2 text-muted-foreground">
        <li>· {copy.consent.sizeNotice.replace("{size}", formatSize(model.downloadMb))}</li>
        <li>· {copy.consent.sourceNotice}</li>
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
