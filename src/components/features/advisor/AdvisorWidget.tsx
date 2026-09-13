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
import { useDeviceType } from "@/hooks/useDeviceType";
import { useTranslation } from "@/i18n";
import { AdvisorPanel } from "./AdvisorPanel";

interface AdvisorWidgetProps {
  patch: string;
}

/**
 * 모바일에서는 띄우지 않는다.
 *
 * 모델이 3GB 다. 셀룰러로 받으면 요금이 나가고, 휴대폰 브라우저가 한 출처에 주는
 * 저장 공간은 그보다 작은 경우가 많아 받다가 중간에 끊긴다. 받아도 WebGPU 를
 * 제대로 주는 모바일 브라우저가 드물다. 셋 중 하나만 걸려도 사용자는 몇 분을
 * 기다린 끝에 실패를 본다.
 *
 * 화면 폭으로 가른다(`useDeviceType`, 768px). 기기 종류를 user agent 로 맞히는 것보다
 * 틀릴 일이 적고, 창을 줄인 데스크톱에서도 자리를 안 뺏는다.
 *
 * **위젯 자체를 그리지 않는다.** 버튼만 숨기면 훅이 붙어 워커를 만들 길이 남는다.
 */
export function AdvisorWidget({ patch }: AdvisorWidgetProps) {
  const device = useDeviceType();
  if (device === "mobile") return null;
  return <AdvisorLauncher patch={patch} />;
}

function AdvisorLauncher({ patch }: AdvisorWidgetProps) {
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
