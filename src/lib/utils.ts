import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Hangul from "hangul-js"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * QWERTY 키보드 레이아웃 기반 한영 변환
 * 한글 자모를 영어 키로 변환하는 매핑
 */
const HANGUL_TO_ENGLISH_MAP: Record<string, string> = {
  // 자음
  'ㄱ': 'r', 'ㄲ': 'R', 'ㄴ': 's', 'ㄷ': 'e', 'ㄸ': 'E',
  'ㄹ': 'f', 'ㅁ': 'a', 'ㅂ': 'q', 'ㅃ': 'Q', 'ㅅ': 't',
  'ㅆ': 'T', 'ㅇ': 'd', 'ㅈ': 'w', 'ㅉ': 'W', 'ㅊ': 'c',
  'ㅋ': 'z', 'ㅌ': 'x', 'ㅍ': 'v', 'ㅎ': 'g',
  // 모음
  'ㅏ': 'k', 'ㅐ': 'o', 'ㅑ': 'i', 'ㅒ': 'O', 'ㅓ': 'j',
  'ㅔ': 'p', 'ㅕ': 'u', 'ㅖ': 'P', 'ㅗ': 'h', 'ㅘ': 'hk',
  'ㅙ': 'ho', 'ㅚ': 'hl', 'ㅛ': 'y', 'ㅜ': 'n', 'ㅝ': 'nj',
  'ㅞ': 'np', 'ㅟ': 'nl', 'ㅠ': 'b', 'ㅡ': 'm', 'ㅢ': 'ml',
  'ㅣ': 'l',
};

/**
 * 영어 키를 한글 자모로 변환하는 매핑
 */
const ENGLISH_TO_HANGUL_MAP: Record<string, string> = {
  // 자음
  'r': 'ㄱ', 'R': 'ㄲ', 's': 'ㄴ', 'e': 'ㄷ', 'E': 'ㄸ',
  'f': 'ㄹ', 'a': 'ㅁ', 'q': 'ㅂ', 'Q': 'ㅃ', 't': 'ㅅ',
  'T': 'ㅆ', 'd': 'ㅇ', 'w': 'ㅈ', 'W': 'ㅉ', 'c': 'ㅊ',
  'z': 'ㅋ', 'x': 'ㅌ', 'v': 'ㅍ', 'g': 'ㅎ',
  // 모음
  'k': 'ㅏ', 'o': 'ㅐ', 'i': 'ㅑ', 'O': 'ㅒ', 'j': 'ㅓ',
  'p': 'ㅔ', 'u': 'ㅕ', 'P': 'ㅖ', 'h': 'ㅗ', 'y': 'ㅛ',
  'n': 'ㅜ', 'b': 'ㅠ', 'm': 'ㅡ', 'l': 'ㅣ',
};

/**
 * 한글 문자열을 QWERTY 키보드 입력으로 변환
 * 예: "안녕" -> "dkssud"
 */
export function hangulToEnglish(text: string): string {
  // hangul-js를 사용하여 한글을 자모 배열로 분해
  const disassembled = Hangul.d(text, true);
  
  return disassembled
    .map((charArray: string[]) => {
      // 각 글자의 자모 배열을 QWERTY 키로 변환
      return charArray
        .map((jamo: string) => {
          // 복합 자모 처리 (예: ㅘ, ㅙ 등)
          if (jamo.length > 1) {
            return jamo
              .split('')
              .map((singleJamo: string) => HANGUL_TO_ENGLISH_MAP[singleJamo] || singleJamo)
              .join('');
          }
          return HANGUL_TO_ENGLISH_MAP[jamo] || jamo;
        })
        .join('');
    })
    .join('');
}

/**
 * 영어 문자열을 한글 자모로 변환
 * 예: "dkssud" -> "ㅇㅏㄴㄴㅕㅇ"
 */
export function englishToHangul(text: string): string {
  return text
    .split('')
    .map((char) => {
      if (ENGLISH_TO_HANGUL_MAP[char]) {
        return ENGLISH_TO_HANGUL_MAP[char];
      }
      return char;
    })
    .join('');
}

/**
 * 검색어를 한영 변환하여 모든 가능한 검색어 배열 반환
 * 기존 검색어 + 한글->영어 변환 + 영어->한글 변환
 */
export function getSearchVariants(searchValue: string): string[] {
  const variants = new Set<string>();
  
  // 원본 검색어 추가
  variants.add(searchValue.toLowerCase());
  
  // 한글을 영어로 변환
  const englishVariant = hangulToEnglish(searchValue).toLowerCase();
  if (englishVariant && englishVariant !== searchValue.toLowerCase()) {
    variants.add(englishVariant);
  }
  
  // 영어를 한글로 변환
  const hangulVariant = englishToHangul(searchValue.toLowerCase());
  if (hangulVariant && hangulVariant !== searchValue.toLowerCase()) {
    variants.add(hangulVariant);
  }
  
  return Array.from(variants);
}

