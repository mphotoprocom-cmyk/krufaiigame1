export const GROUPS = {
  high: {
    label: "อักษรสูง",
    letters: ["ข", "ฃ", "ฉ", "ฐ", "ถ", "ผ", "ฝ", "ศ", "ษ", "ส", "ห"],
  },
  middle: {
    label: "อักษรกลาง",
    letters: ["ก", "จ", "ฎ", "ฏ", "ด", "ต", "บ", "ป", "อ"],
  },
  low: {
    label: "อักษรต่ำ",
    letters: [
      "ค", "ฅ", "ฆ", "ง", "ช", "ซ", "ฌ", "ญ", "ฑ", "ฒ", "ณ", "ท",
      "ธ", "น", "พ", "ฟ", "ภ", "ม", "ย", "ร", "ล", "ว", "ฬ", "ฮ",
    ],
  },
};

export const DEFAULT_QUESTION_COUNT = 12;
export const QUESTION_COUNT_OPTIONS = [5, 10, 12, 15];

export function allLetters() {
  return Object.entries(GROUPS).flatMap(([group, data]) =>
    data.letters.map((letter) => ({ letter, group })),
  );
}

export function groupForLetter(letter) {
  return Object.entries(GROUPS).find(([, data]) => data.letters.includes(letter))?.[0] ?? null;
}

export function initialConsonant(word) {
  return [...word].find((character) => groupForLetter(character)) ?? null;
}

export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function scoreDelta(isCorrect) {
  return isCorrect ? 1 : -1;
}
