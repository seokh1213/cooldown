import { useMemo } from "react";
import { Champion } from "@/types";
import { getSearchVariants } from "@/lib/utils";
import { useTranslation } from "@/i18n";

export function useChampionSearch(
  championList: Champion[] | null,
  searchValue: string
) {
  const { lang } = useTranslation();
  
  const filteredChampions = useMemo(() => {
    if (!championList) return [];
    if (!searchValue) return championList;

    // 한영 변환된 모든 검색어 변형 가져오기 (한국어일 때만 변환)
    const searchVariants = getSearchVariants(searchValue, lang);

    return championList.filter((champ) => {
      // 각 검색어 변형에 대해 매칭 확인
      return searchVariants.some((variant) => {
        const lowerVariant = variant.toLowerCase();

        // 기본 검색: 이름, 한글명, ID
        if (
          champ.name.toLowerCase().includes(lowerVariant) ||
          (champ.hangul && champ.hangul.toLowerCase().includes(lowerVariant)) ||
          champ.id.toLowerCase().includes(lowerVariant)
        ) {
          return true;
        }

        // 한국어일 때만 챔피언 이름의 한영 변환 변형들과 비교
        if (lang === "ko_KR") {
          const champNameVariants = getSearchVariants(champ.name, lang);
          if (
            champNameVariants.some((champVariant) =>
              champVariant.toLowerCase().includes(lowerVariant)
            )
          ) {
            return true;
          }

          // 챔피언 한글명의 한영 변환 변형들과도 비교
          if (champ.hangul) {
            const champHangulVariants = getSearchVariants(champ.hangul, lang);
            if (
              champHangulVariants.some((champVariant) =>
                champVariant.toLowerCase().includes(lowerVariant)
              )
            ) {
              return true;
            }
          }
        }

        return false;
      });
    });
  }, [championList, searchValue, lang]);

  return filteredChampions;
}

