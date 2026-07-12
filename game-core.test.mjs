import assert from "node:assert/strict";
import { GROUPS, QUESTION_COUNT, allLetters, scoreDelta, shuffled } from "./game-core.js";

const letters = allLetters();
const uniqueLetters = new Set(letters.map(({ letter }) => letter));

assert.equal(GROUPS.high.letters.length, 11, "อักษรสูงต้องมี 11 ตัว");
assert.equal(GROUPS.middle.letters.length, 9, "อักษรกลางต้องมี 9 ตัว");
assert.equal(GROUPS.low.letters.length, 24, "อักษรต่ำต้องมี 24 ตัว");
assert.equal(letters.length, 44, "ต้องมีพยัญชนะรวม 44 ตัว");
assert.equal(uniqueLetters.size, 44, "พยัญชนะต้องไม่ซ้ำกัน");
assert.equal(QUESTION_COUNT, 12, "หนึ่งรอบต้องมี 12 ข้อ");
assert.equal(scoreDelta(true), 1, "ตอบถูกต้องได้ 1 คะแนน");
assert.equal(scoreDelta(false), -1, "ตอบผิดต้องลบ 1 คะแนน");

const deterministicShuffle = shuffled([1, 2, 3, 4], () => 0);
assert.deepEqual(deterministicShuffle, [2, 3, 4, 1]);

console.log("✓ ผ่านการทดสอบข้อมูลอักษร 3 หมู่และกติกาคะแนนทั้งหมด");
