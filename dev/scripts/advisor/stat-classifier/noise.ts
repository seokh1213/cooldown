const keyboard = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const consonants = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
const consonantKeys = "rsef aqtdwczxvg".replace(/ /g, "");
const vowels = "ㅏㅐㅑㅓㅔㅕㅗㅛㅜㅠㅡㅣ";
const vowelKeys = "koijpu hynbml".replace(/ /g, "");
const initial = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const medial = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const final = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
const keys = new Map([...consonants].map((letter, index) => [letter, consonantKeys[index]]));
[...vowels].forEach((letter, index) => keys.set(letter, vowelKeys[index]));

function neighbors(letter: string, alphabet: string): string[] {
  const key = keys.get(letter);
  if (!key) return [];
  const row = keyboard.findIndex(line => line.includes(key));
  const col = keyboard[row].indexOf(key);
  return [...alphabet].filter(candidate => {
    const candidateKey = keys.get(candidate);
    if (!candidateKey || candidateKey === key) return false;
    const candidateRow = keyboard.findIndex(line => line.includes(candidateKey));
    return Math.abs(candidateRow - row) <= 1 && Math.abs(keyboard[candidateRow].indexOf(candidateKey) - col) <= 1;
  });
}

/** 한 글자의 자음·모음을 인접 키로 바꾼다. 질문이나 정답 목록을 참조하지 않는다. */
export function keyboardNoise(phrase: string): string[] {
  const variants = new Set<string>();
  for (let index = 0; index < phrase.length; index++) {
    const offset = phrase.charCodeAt(index) - 0xac00;
    if (offset < 0 || offset > 11171) continue;
    const components = [Math.floor(offset / 588), Math.floor(offset % 588 / 28), offset % 28];
    for (const [part, alphabet] of [initial, medial, final].entries()) {
      for (const letter of neighbors(alphabet[components[part]], alphabet)) {
        const changed = [...components]; changed[part] = alphabet.indexOf(letter);
        const typo = String.fromCharCode(0xac00 + changed[0] * 588 + changed[1] * 28 + changed[2]);
        variants.add(phrase.slice(0, index) + typo + phrase.slice(index + 1));
      }
    }
  }
  return [...variants];
}
