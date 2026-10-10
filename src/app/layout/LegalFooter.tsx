/**
 * 라이엇 게임즈 고지
 *
 * 라이엇의 개발자 포털 General Policies 가 요구하는 문구다. 법률이 아니라
 * 지식재산 이용 조건이며, "readily visible to players" 를 요구하므로 소개 페이지
 * 한 곳이 아니라 모든 화면 아래에 둔다.
 *
 * **영문 원문을 그대로 쓴다.** 라이엇이 이 문구의 공식 한국어 번역을 내놓은 적이
 * 없다(riotgames.com/ko/legal 에 있는 것은 "지식재산 이용 정책" 쪽 별개 문구다).
 * 임의로 옮기면 요구된 문구가 아니게 되므로 번역 파일에 넣지 않는다.
 */
const RIOT_NOTICE =
  "Cooldown isn't endorsed by Riot Games and doesn't reflect the views or opinions of " +
  "Riot Games or anyone officially involved in producing or managing Riot Games properties. " +
  "Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";

export function LegalFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-6 sm:px-6">
      <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted-foreground/80">
        {RIOT_NOTICE}
      </p>
    </footer>
  );
}

export default LegalFooter;
