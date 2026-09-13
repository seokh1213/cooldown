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

export function AdvisorWidget({ patch }: AdvisorWidgetProps) {
  const { t } = useTranslation();
  const device = useDeviceType();
  const [open, setOpen] = useState(false);
  const advisor = useAdvisor();

  /**
   * 모델을 권할 만한 기기인지.
   *
   * 모바일에서는 권하지 않는다. 모델이 3GB 라 셀룰러로 받으면 요금이 나가고,
   * 휴대폰 브라우저가 한 출처에 주는 저장 공간은 그보다 작은 경우가 많아 받다가
   * 끊긴다. 받아도 WebGPU 를 제대로 주는 모바일 브라우저가 드물다.
   * 화면 폭으로 가른다(768px). user agent 로 기기를 맞히는 것보다 틀릴 일이 적다.
   *
   * WebGPU 가 없으면 데스크톱에서도 권하지 않는다. 받아 놓고 WASM 으로 떨어지면
   * 3GB 를 쓰고도 답을 못 받는다.
   *
   * **위젯을 감추지는 않는다.** 챔피언·아이템·규칙 조회는 모델 없이 코드가 답하고,
   * 평가에서 적중 63/66 으로 모델(64/66)과 거의 같았다. 내려받을 수 없는 기기라고
   * 해서 그 답까지 뺏을 이유가 없다. 막는 것은 내려받기지 기능이 아니다.
   */
  const canUseModel = device === "desktop" && advisor.webgpu?.supported === true;

  // 이미 동의한 사용자는 대화창을 여는 순간부터 모델을 준비한다.
  // 질문을 받고 나서 받기 시작하면 첫 답변을 몇 분씩 기다리게 된다.
  const { consented, ensureLoaded } = advisor;
  useEffect(() => {
    if (open && consented && canUseModel) ensureLoaded();
  }, [open, consented, canUseModel, ensureLoaded]);

  return (
    <>
      {open && <AdvisorPanel advisor={advisor} patch={patch} canUseModel={canUseModel} onClose={() => setOpen(false)} />}
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
