/**
 * 내려받은 모델을 보고 지우는 화면
 *
 * 모델은 570MB 다. 한 번 받으면 브라우저 저장 공간에 남고, 안 쓰기로 해도 계속 남는다.
 * 지울 길이 없으면 브라우저 설정에서 사이트 데이터를 통째로 지우는 수밖에 없는데
 * 그러면 다른 설정도 같이 날아간다. 그래서 여기서 지울 수 있게 둔다.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useTranslation } from "@/shared/i18n";
import { readModelCache, type ModelCacheInfo } from "@/features/advisor/storage/storage";
import { ADVISOR_MODEL, ADVISOR_MODEL_LABEL } from "@/features/advisor/model/config";

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
}

export function AdvisorStorage({ onDelete, onDownload, unavailable }: AdvisorStorageProps) {
  const { t } = useTranslation();
  const copy = t.advisor.storage;
  const [info, setInfo] = useState<ModelCacheInfo | null>(null);
  // 받아 둔 저장소 이름. 예전 모델(Qwen3 4B)이 남아 있으면 그 이름이 그대로 보인다.
  const cachedLabel = info?.repos.includes(ADVISOR_MODEL.id) ? ADVISOR_MODEL_LABEL : info?.repos[0];
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const measure = useCallback(() => {
    // 용량은 응답 본문을 다 읽어 재므로 파일이 많으면 잠깐 걸린다. 먼저 비워 두고 채운다.
    setInfo(null);
    void readModelCache().then(setInfo);
  }, []);

  useEffect(measure, [measure]);

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
    <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 text-sm">
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
          {/*
            무엇이 들어 있는지 먼저 적는다. 용량만 보이면 "1,734MB 가 있다" 는 알아도
            그것이 어느 모델인지는 모른다. 고른 줄과 받아 둔 것이 다를 수 있다 —
            받다 만 채로 바꾸면 그렇다.
          */}
          {cachedLabel && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{copy.cached}</dt>
              <dd className="min-w-0 truncate font-semibold">{cachedLabel}</dd>
            </div>
          )}
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

      <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
    </div>
  );
}
