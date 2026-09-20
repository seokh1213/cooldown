/**
 * 내려받은 모델을 보고 지우는 화면
 *
 * 모델은 3GB 다. 한 번 받으면 브라우저 저장 공간에 남고, 안 쓰기로 해도 계속 남는다.
 * 지울 길이 없으면 브라우저 설정에서 사이트 데이터를 통째로 지우는 수밖에 없는데
 * 그러면 다른 설정도 같이 날아간다. 그래서 여기서 지울 수 있게 둔다.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { readModelCache, type ModelCacheInfo } from "@/lib/advisor/storage";
import { MODEL_CHOICES, type WebGpuSupport } from "@/lib/advisor/config";

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

interface AdvisorStorageProps {
  onDelete: () => Promise<void>;
  /** 모델을 받지 않은 기기에서 받기 시작하는 길. 받을 수 없는 기기면 없다. */
  onDownload?: () => void;
  /**
   * 이 기기가 모델을 못 쓰는 이유. 있으면 내려받기 대신 이 말을 보여 준다.
   *
   * 없을 때는 "모델이 없습니다" 만 뜨고 단추도 없어서, 받을 길이 막힌 것인지
   * 화면이 덜 그려진 것인지 알 수 없었다. 못 받는 기기라면 그렇다고 말해야 한다.
   */
  unavailable?: string;
  /** 어느 줄을 못 고르게 할지 가리는 데 쓴다. */
  webgpu: WebGpuSupport | null;
  /** 지금 고른 줄. */
  choice: string;
  /** 다른 줄을 골랐을 때. 화면을 다시 띄우지 않고 워커만 바꾼다. */
  onChoose: (key: string) => Promise<void>;
}

export function AdvisorStorage({ onDelete, onDownload, unavailable, webgpu, choice, onChoose }: AdvisorStorageProps) {
  const { t } = useTranslation();
  const copy = t.advisor.storage;
  const [info, setInfo] = useState<ModelCacheInfo | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const measure = useCallback(() => {
    // 용량은 응답 본문을 다 읽어 재므로 파일이 많으면 잠깐 걸린다. 먼저 비워 두고 채운다.
    setInfo(null);
    void readModelCache().then(setInfo);
  }, []);

  useEffect(measure, [measure]);

  /** 다른 모델로 바꾼다. 워커만 갈아 끼우므로 이 화면은 그대로 있다. */
  const pick = async (key: string) => {
    if (key === choice || busy) return;
    setBusy(true);
    try {
      await onChoose(key);
      measure();
    } finally {
      setBusy(false);
    }
  };


  const remove = async () => {
    setBusy(true);
    try {
      await onDelete();
      setDone(true);
      measure();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
      {info === null ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </p>
      ) : info.entries === 0 ? (
        <div className="space-y-3">
          <p className="text-muted-foreground">{done ? copy.removed : unavailable ?? copy.empty}</p>
          {onDownload && !unavailable && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {copy.download}
            </Button>
          )}
        </div>
      ) : (
        <dl className="space-y-2">
          {info.bytes !== undefined && (
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">{copy.used}</dt>
              <dd className="font-semibold tabular-nums">{formatMb(info.bytes)} MB</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <dt className="text-muted-foreground">{copy.files}</dt>
            <dd className="tabular-nums">{info.entries}</dd>
          </div>
        </dl>
      )}

      {info !== null && info.entries > 0 && (
        <div className="space-y-2">
          {asking ? (
            <>
              <p className="text-xs text-muted-foreground">{copy.confirm}</p>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
                  {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {busy ? copy.removing : copy.remove}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(false)}>
                  {copy.cancel}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {copy.remove}
            </Button>
          )}
        </div>
      )}

      {/*
        어느 모델을 쓸지 고르는 자리.

        f16 이 없는 카드(Pascal 등)에서는 기본 모델이 안 돈다. 그렇다고 그 기기가
        아무것도 못 쓰는 것은 아니라서, 16비트를 안 쓰는 판본을 여기서 고를 수 있게
        둔다. 어디까지 올라가는지는 그래픽 백엔드마다 달라 미리 정할 수 없다 —
        **고르고 눌러 보는 것이 유일한 확인 방법이다.**

        못 쓸 것이 분명한 줄은 눌리지 않게 하고 사유를 적는다. 3GB 를 받고 나서
        실패하는 것보다 받기 전에 아는 편이 낫다.
      */}
      <div className="border-t pt-3">
        <div className="mb-2 text-[11px] font-medium text-muted-foreground">{copy.pickTitle}</div>
        <div role="radiogroup" aria-label={copy.pickTitle} className="space-y-1">
          {MODEL_CHOICES.map(({ key, model, label, note, detail }) => {
            const blocked = model.needsF16 && webgpu?.supported === true && !webgpu.f16;
            const active = key === choice;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={blocked || busy}
                onClick={() => pick(key)}
                title={blocked ? `${detail}\n\n${copy.pickNeedsF16}` : detail}
                className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  active ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span className="min-w-0">
                  <span className={`block text-[13px] ${active ? "font-semibold text-foreground" : ""}`}>{label}</span>
                  <span className="block text-[11px] leading-relaxed text-muted-foreground">
                    {blocked ? copy.pickNeedsF16 : note}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{model.downloadMb} MB</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{copy.pickNote}</p>
      </div>

      <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
    </div>
  );
}
