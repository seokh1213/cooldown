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

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

interface AdvisorStorageProps {
  onDelete: () => Promise<void>;
  /** 모델을 받지 않은 기기에서 받기 시작하는 길. 받을 수 없는 기기면 없다. */
  onDownload?: () => void;
}

export function AdvisorStorage({ onDelete, onDownload }: AdvisorStorageProps) {
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
          <p className="text-muted-foreground">{done ? copy.removed : copy.empty}</p>
          {onDownload && (
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

      <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{copy.note}</p>
    </div>
  );
}
