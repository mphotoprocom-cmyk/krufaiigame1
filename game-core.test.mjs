import assert from "node:assert/strict";
import {
  DEFAULT_QUESTION_COUNT,
  GROUPS,
  QUESTION_COUNT_OPTIONS,
  allLetters,
  groupForLetter,
  initialConsonant,
  scoreDelta,
  shuffled,
} from "./game-core.js";
import { VOCAB_WORDS } from "./vocab-data.js";

const letters = allLetters();
const uniqueLetters = new Set(letters.map(({ letter }) => letter));

assert.equal(GROUPS.high.letters.length, 11, "อักษรสูงต้องมี 11 ตัว");
assert.equal(GROUPS.middle.letters.length, 9, "อักษรกลางต้องมี 9 ตัว");
assert.equal(GROUPS.low.letters.length, 24, "อักษรต่ำต้องมี 24 ตัว");
assert.equal(letters.length, 44, "ต้องมีพยัญชนะรวม 44 ตัว");
assert.equal(uniqueLetters.size, 44, "พยัญชนะต้องไม่ซ้ำกัน");
assert.equal(DEFAULT_QUESTION_COUNT, 12, "ค่าเริ่มต้นของหนึ่งรอบต้องมี 12 ข้อ");
assert.deepEqual(QUESTION_COUNT_OPTIONS, [5, 10, 12, 15], "ตัวเลือกจำนวนข้อต้องตรงตามที่กำหนด");
assert.equal(scoreDelta(true), 1, "ตอบถูกต้องได้ 1 คะแนน");
assert.equal(scoreDelta(false), -1, "ตอบผิดต้องลบ 1 คะแนน");
assert.ok(VOCAB_WORDS.length >= 90, "คลังคำศัพท์ควรมีอย่างน้อยประมาณ 100 คำ");
assert.ok(VOCAB_WORDS.length <= 140, "คลังคำศัพท์ไม่ควรเยอะเกินไปสำหรับเกมรอบแรก");
VOCAB_WORDS.forEach((item) => {
  assert.equal(groupForLetter(item.initial), item.group, `หมู่ของคำว่า ${item.word} ต้องถูกต้อง`);
  assert.equal(initialConsonant(item.word), item.initial, `คำว่า ${item.word} ต้องมีพยัญชนะต้นเป็น ${item.initial}`);
});

const deterministicShuffle = shuffled([1, 2, 3, 4], () => 0);
assert.deepEqual(deterministicShuffle, [2, 3, 4, 1]);

console.log("✓ ผ่านการทดสอบข้อมูลอักษร 3 หมู่และกติกาคะแนนทั้งหมด");
