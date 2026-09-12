/**
 * 상성 코치 진입점
 *
 * 화면 오른쪽 아래에 떠 있는 버튼과 대화 패널을 함께 들고 있다.
 * 훅은 여기서 한 번만 잡는다. 패널을 닫아도 모델을 내린다거나 대화를 잃지 않게
 * 상태를 위젯 쪽에 두고, 패널은 보여 주기만 한다.
 */
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAdvisor } from "@/hooks/useAdvisor";
import { useTranslation } from "@/i18n";
import { AdvisorPanel } from "./AdvisorPanel";

interface AdvisorWidgetProps {
  patch: string;
}

export function AdvisorWidget({ patch }: AdvisorWidgetProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const advisor = useAdvisor();

  // 이미 동의한 사용자는 대화창을 여는 순간부터 모델을 준비한다.
  // 질문을 받고 나서 받기 시작하면 첫 답변을 몇 분씩 기다리게 된다.
  const { consented, ensureLoaded } = advisor;
  useEffect(() => {
    if (open && consented) ensureLoaded();
  }, [open, consented, ensureLoaded]);

  return (
    <>
      {open && <AdvisorPanel advisor={advisor} patch={patch} onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? t.advisor.close : t.advisor.open}
        aria-expanded={open}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <MessageCircle className="h-6 w-6" />
        {advisor.status === "generating" && (
          <span className="absolute right-1 top-1 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
        )}
      </button>
    </>
  );
}
