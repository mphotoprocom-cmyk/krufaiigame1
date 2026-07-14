import {
  DEFAULT_QUESTION_COUNT,
  GROUPS,
  QUESTION_COUNT_OPTIONS,
  allLetters,
  groupForLetter,
  scoreDelta,
  shuffled,
} from "./game-core.js";
import { VOCAB_WORDS } from "./vocab-data.js";

const HOLD_DURATION = 1000;
const MEDIAPIPE_VERSION = "0.10.35";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const TEACHER_STATES = {
  normal: {
    image: "assets/teacher-normal.png",
    message: "พร้อมเรียนแล้ว ยกมือเลือกคำตอบได้เลย",
  },
  happy: {
    image: "assets/teacher-happy.png",
    message: "เก่งมากเลย! ตอบถูกแล้ว ไปข้อต่อไปกัน",
  },
  encourage: {
    image: "assets/teacher-encourage.png",
    message: "ไม่เป็นไรนะ ลองตั้งใจดูใหม่ คุณครูเป็นกำลังใจให้",
  },
};
const TEACHER_NAME = "ครูสุพรรษา";
const GAME_MODES = {
  letters: {
    title: "ตัวอักษร",
    heading: "พยัญชนะตัวนี้อยู่ในหมู่ใด?",
    teacher: "มาอ่านตัวอักษรแล้วเลือกหมู่ให้ถูกกันนะ",
  },
  vocab: {
    title: "คำศัพท์",
    heading: "คำศัพท์นี้ขึ้นต้นด้วยอักษรหมู่ใด?",
    teacher: "ดูภาพและคำศัพท์ แล้วคิดว่าอักษรตัวแรกอยู่หมู่ไหน",
  },
};

const screens = {
  start: document.querySelector("#start-screen"),
  game: document.querySelector("#game-screen"),
  result: document.querySelector("#result-screen"),
};

const elements = {
  startButton: document.querySelector("#start-button"),
  selectedQuestionCount: document.querySelector("#selected-question-count"),
  modeOptions: [...document.querySelectorAll(".mode-option")],
  countOptions: [...document.querySelectorAll(".count-option")],
  howButton: document.querySelector("#how-button"),
  howDialog: document.querySelector("#how-dialog"),
  closeHow: document.querySelector("#close-how"),
  dialogPlay: document.querySelector("#dialog-play"),
  homeButton: document.querySelector("#home-button"),
  resultHomeButton: document.querySelector("#result-home-button"),
  replayButton: document.querySelector("#replay-button"),
  questionPanel: document.querySelector("#question-panel"),
  questionHeading: document.querySelector("#question-heading"),
  questionLetter: document.querySelector("#question-letter"),
  questionVocab: document.querySelector("#question-vocab"),
  questionImage: document.querySelector("#question-image"),
  questionWord: document.querySelector("#question-word"),
  startTeacherImage: document.querySelector("#start-teacher-image"),
  gameTeacherImage: document.querySelector("#game-teacher-image"),
  teacherMessage: document.querySelector("#teacher-message"),
  scoreValue: document.querySelector("#score-value"),
  questionNumber: document.querySelector("#question-number"),
  totalQuestions: document.querySelector("#total-questions"),
  timerValue: document.querySelector("#timer-value"),
  answerCards: [...document.querySelectorAll(".answer-card")],
  feedback: document.querySelector("#feedback"),
  finalScore: document.querySelector("#final-score"),
  correctCount: document.querySelector("#correct-count"),
  wrongCount: document.querySelector("#wrong-count"),
  finalTime: document.querySelector("#final-time"),
  resultTitle: document.querySelector("#result-title"),
  resultMedal: document.querySelector("#result-medal"),
  resultTeacherImage: document.querySelector("#result-teacher-image"),
  resultTeacherMessage: document.querySelector("#result-teacher-message"),
  gameScreen: document.querySelector("#game-screen"),
  cameraToggle: document.querySelector("#camera-toggle"),
  cameraWidget: document.querySelector(".camera-widget"),
  cameraStage: document.querySelector("#camera-stage"),
  cameraVideo: document.querySelector("#camera-video"),
  cameraCanvas: document.querySelector("#camera-canvas"),
  cameraStatus: document.querySelector("#camera-status"),
};

let questions = [];
let questionIndex = 0;
let score = 0;
let correctAnswers = 0;
let wrongAnswers = 0;
let acceptingAnswer = false;
let selectedQuestionCount = DEFAULT_QUESTION_COUNT;
let currentMode = "letters";
let gameStartTime = 0;
let elapsedGameTime = 0;
let timerLoopId = null;

let cameraStream = null;
let handLandmarker = null;
let cameraLoopId = null;
let cameraStarting = false;
let gestureZone = null;
let gestureStart = 0;
let gestureNeedsReset = false;
let noHandSince = 0;
let lastVideoTime = -1;

syncQuestionCountUi();

function setScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("active", key === name);
  });
}

function beginGame() {
  const source = currentMode === "letters" ? allLetters() : VOCAB_WORDS;
  questions = shuffled(source).slice(0, selectedQuestionCount);
  questionIndex = 0;
  score = 0;
  correctAnswers = 0;
  wrongAnswers = 0;
  elements.scoreValue.textContent = "0";
  resetGameTimer();
  setTeacherState("normal");
  setScreen("game");
  startGameTimer();
  showQuestion();
  void startCamera();
}

function showQuestion() {
  acceptingAnswer = true;
  clearAnswerStyles();
  clearGestureSelection();
  gestureNeedsReset = Boolean(cameraStream);
  noHandSince = performance.now();

  const question = questions[questionIndex];
  elements.questionNumber.textContent = String(questionIndex + 1);
  renderQuestion(question);
  elements.cameraStatus.textContent = cameraStream
    ? "ลดมือลง แล้วเตรียมยกมือเลือกคำตอบ"
    : "พร้อมเล่นด้วยการแตะ หรือเปิดกล้องเพื่อยกมือ";
}

function chooseAnswer(group, source = "click") {
  if (!acceptingAnswer) return;
  acceptingAnswer = false;
  gestureNeedsReset = true;
  clearGestureSelection();

  const current = questions[questionIndex];
  const answerGroup = current.group ?? groupForLetter(current.letter ?? current.initial);
  const selectedCard = elements.answerCards.find((card) => card.dataset.group === group);
  const correctCard = elements.answerCards.find((card) => card.dataset.group === answerGroup);
  const isCorrect = group === answerGroup;

  if (isCorrect) {
    score += scoreDelta(true);
    correctAnswers += 1;
    selectedCard.classList.add("correct-answer");
    setTeacherState("happy");
    showFeedback("ถูกต้อง! +1 ⭐", "good");
    playTone(660, 0.12, "sine");
    setTimeout(() => playTone(880, 0.16, "sine"), 110);
  } else {
    score += scoreDelta(false);
    wrongAnswers += 1;
    selectedCard.classList.add("wrong-answer");
    correctCard.classList.add("correct-answer");
    setTeacherState("encourage");
    showFeedback(`ยังไม่ถูก −1 · คำตอบคือ ${GROUPS[answerGroup].label}`, "bad");
    playTone(210, 0.22, "triangle");
  }

  elements.scoreValue.textContent = String(score);
  elements.scoreValue.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }],
    { duration: 420, easing: "ease-out" },
  );

  const delay = source === "gesture" ? 1300 : 1100;
  window.setTimeout(nextQuestion, delay);
}

function nextQuestion() {
  questionIndex += 1;
  if (questionIndex >= questions.length) {
    showResult();
    return;
  }
  showQuestion();
}

function showFeedback(message, type) {
  elements.feedback.textContent = message;
  elements.feedback.className = `feedback ${type}`;
  void elements.feedback.offsetWidth;
  elements.feedback.classList.add("show");
}

function clearAnswerStyles() {
  elements.answerCards.forEach((card) => {
    card.classList.remove("correct-answer", "wrong-answer");
  });
}

function clearGestureSelection() {
  gestureZone = null;
  gestureStart = 0;
  elements.answerCards.forEach((card) => {
    card.classList.remove("gesture-active");
    card.style.setProperty("--hold-progress", "0%");
  });
}

function syncQuestionCountUi() {
  elements.selectedQuestionCount.textContent = String(selectedQuestionCount);
  elements.totalQuestions.textContent = String(selectedQuestionCount);

  elements.countOptions.forEach((button) => {
    const isActive = Number(button.dataset.count) === selectedQuestionCount;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function syncModeUi() {
  elements.modeOptions.forEach((button) => {
    const isActive = button.dataset.mode === currentMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setQuestionCount(count) {
  if (!QUESTION_COUNT_OPTIONS.includes(count)) return;
  selectedQuestionCount = count;
  syncQuestionCountUi();
}

function setGameMode(mode) {
  if (!(mode in GAME_MODES)) return;
  currentMode = mode;
  syncModeUi();
}

function setTeacherState(state) {
  const teacher = TEACHER_STATES[state] ?? TEACHER_STATES.normal;
  if (elements.startTeacherImage) elements.startTeacherImage.src = teacher.image;
  if (elements.gameTeacherImage) elements.gameTeacherImage.src = teacher.image;
  if (elements.teacherMessage) elements.teacherMessage.textContent = teacher.message;
}

function setResultTeacherState(state, message) {
  const teacher = TEACHER_STATES[state] ?? TEACHER_STATES.normal;
  elements.resultTeacherImage.src = teacher.image;
  elements.resultTeacherMessage.textContent = message;
}

function showResult() {
  acceptingAnswer = false;
  clearGestureSelection();
  stopGameTimer();
  stopCamera();
  elements.finalScore.textContent = String(score);
  elements.correctCount.textContent = String(correctAnswers);
  elements.wrongCount.textContent = String(wrongAnswers);
  elements.finalTime.textContent = formatGameTime(elapsedGameTime);

  if (score >= 9) {
    elements.resultTitle.textContent = "ยอดเยี่ยมมาก!";
    elements.resultMedal.textContent = "🏆";
    setResultTeacherState("happy", `${TEACHER_NAME}ภูมิใจมาก หนูทำได้ยอดเยี่ยมเลย`);
  } else if (score >= 5) {
    elements.resultTitle.textContent = "เก่งมาก!";
    elements.resultMedal.textContent = "🥇";
    setResultTeacherState("normal", `${TEACHER_NAME}ดีใจมาก ฝึกอีกนิดก็ยิ่งเก่งขึ้นแน่นอน`);
  } else {
    elements.resultTitle.textContent = "ลองอีกครั้งนะ!";
    elements.resultMedal.textContent = "🌟";
    setResultTeacherState("encourage", `${TEACHER_NAME}ขอเป็นกำลังใจให้ ลองใหม่อีกครั้งนะคนเก่ง`);
  }
  setScreen("result");
}

function renderQuestion(question) {
  elements.questionHeading.textContent = GAME_MODES[currentMode].heading;
  elements.questionPanel.classList.toggle("mode-letters", currentMode === "letters");
  elements.questionPanel.classList.toggle("mode-vocab", currentMode === "vocab");

  if (currentMode === "letters") {
    elements.questionLetter.hidden = false;
    elements.questionVocab.hidden = true;
    elements.questionLetter.classList.remove("is-hidden");
    elements.questionVocab.classList.add("is-hidden");
    elements.questionLetter.textContent = question.letter;
    elements.questionLetter.classList.remove("pop");
    requestAnimationFrame(() => elements.questionLetter.classList.add("pop"));
    return;
  }

  elements.questionLetter.hidden = true;
  elements.questionVocab.hidden = false;
  elements.questionLetter.classList.add("is-hidden");
  elements.questionVocab.classList.remove("is-hidden");
  elements.questionWord.textContent = question.word;
  elements.questionImage.src = vocabIllustrationDataUrl(question);
  elements.questionImage.alt = `ภาพประกอบคำว่า ${question.word}`;
}

function vocabIllustrationDataUrl(question) {
  const accent = {
    high: ["#8ad0ff", "#dff3ff"],
    middle: ["#ffd97d", "#fff3c8"],
    low: ["#9de39b", "#e6f9de"],
  }[question.group] ?? ["#d9e6f2", "#f7fbff"];
  const safeWord = escapeXml(question.word);
  const safeEmoji = escapeXml(question.emoji);
  const safeInitial = escapeXml(question.initial);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent[1]}"/>
          <stop offset="100%" stop-color="${accent[0]}"/>
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="220" height="220" rx="40" fill="url(#bg)"/>
      <circle cx="120" cy="96" r="58" fill="rgba(255,255,255,0.82)"/>
      <text x="120" y="116" text-anchor="middle" font-size="66">${safeEmoji}</text>
      <rect x="44" y="164" width="152" height="42" rx="21" fill="rgba(255,255,255,0.92)"/>
      <text x="120" y="192" text-anchor="middle" font-size="24" font-weight="700" fill="#6d4412">${safeWord}</text>
      <text x="36" y="40" font-size="22" font-weight="700" fill="rgba(23,63,58,0.7)">${safeInitial}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function goHome() {
  acceptingAnswer = false;
  clearGestureSelection();
  stopGameTimer();
  stopCamera();
  setTeacherState("normal");
  setScreen("start");
}

function resetGameTimer() {
  gameStartTime = 0;
  elapsedGameTime = 0;
  if (timerLoopId) cancelAnimationFrame(timerLoopId);
  timerLoopId = null;
  updateTimerDisplay(0);
}

function startGameTimer() {
  gameStartTime = performance.now();
  elapsedGameTime = 0;
  updateTimerDisplay(0);
  timerLoopId = requestAnimationFrame(updateGameTimer);
}

function updateGameTimer(now) {
  if (!gameStartTime) return;
  elapsedGameTime = Math.max(0, now - gameStartTime);
  updateTimerDisplay(elapsedGameTime);
  timerLoopId = requestAnimationFrame(updateGameTimer);
}

function stopGameTimer() {
  if (timerLoopId) cancelAnimationFrame(timerLoopId);
  timerLoopId = null;
  if (gameStartTime) {
    elapsedGameTime = Math.max(0, performance.now() - gameStartTime);
    updateTimerDisplay(elapsedGameTime);
  }
}

function updateTimerDisplay(milliseconds) {
  elements.timerValue.textContent = formatGameTime(milliseconds);
}

function formatGameTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playTone(frequency, duration, wave) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // The game remains fully usable if audio is unavailable.
  }
}

async function toggleCamera() {
  if (cameraStream) {
    stopCamera();
    return;
  }
  await startCamera();
}

async function startCamera() {
  if (cameraStarting || cameraStream) return;
  cameraStarting = true;
  elements.cameraToggle.disabled = true;
  elements.cameraToggle.textContent = "กำลังเปิด...";
  elements.cameraStatus.textContent = "กำลังเตรียมระบบตรวจจับมือ";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("เบราว์เซอร์นี้ไม่รองรับการใช้กล้อง");
    }

    if (!handLandmarker) {
      const visionModule = await import(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`
      );
      const vision = await visionModule.FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
      );
      const trackingOptions = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      };
      try {
        handLandmarker = await visionModule.HandLandmarker.createFromOptions(vision, trackingOptions);
      } catch {
        trackingOptions.baseOptions = { modelAssetPath: MODEL_URL, delegate: "CPU" };
        handLandmarker = await visionModule.HandLandmarker.createFromOptions(vision, trackingOptions);
      }
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 360 },
      },
      audio: false,
    });
    elements.cameraVideo.srcObject = cameraStream;
    await elements.cameraVideo.play();
    resizeCameraCanvas();
    elements.cameraWidget.classList.add("on");
    elements.cameraStage.classList.add("on");
    elements.gameScreen.classList.add("camera-on");
    elements.cameraToggle.textContent = "ปิดกล้อง";
    elements.cameraStatus.textContent = "ยกฝ่ามือให้กล้องเห็น";
    lastVideoTime = -1;
    cameraLoopId = requestAnimationFrame(processCameraFrame);
  } catch (error) {
    console.error(error);
    elements.cameraStatus.textContent = cameraErrorMessage(error);
    elements.cameraToggle.textContent = "ลองเปิดอีกครั้ง";
    stopCameraTracks();
    elements.cameraStage.classList.remove("on");
    elements.gameScreen.classList.remove("camera-on");
  } finally {
    cameraStarting = false;
    elements.cameraToggle.disabled = false;
  }
}

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError") return "ไม่ได้รับอนุญาตใช้กล้อง — ยังแตะคำตอบได้";
  if (error?.name === "NotFoundError") return "ไม่พบกล้อง — ยังแตะคำตอบได้";
  if (!window.isSecureContext) return "กล้องต้องเปิดผ่าน HTTPS หรือ localhost";
  return "เปิดกล้องไม่สำเร็จ — ยังแตะคำตอบได้";
}

function stopCameraTracks() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  elements.cameraVideo.srcObject = null;
}

function stopCamera() {
  if (cameraLoopId) cancelAnimationFrame(cameraLoopId);
  cameraLoopId = null;
  stopCameraTracks();
  clearCameraCanvas();
  clearGestureSelection();
  elements.cameraWidget.classList.remove("on");
  elements.cameraStage.classList.remove("on");
  elements.gameScreen.classList.remove("camera-on");
  elements.cameraToggle.textContent = "เปิดกล้อง";
  elements.cameraStatus.textContent = "พร้อมเล่นด้วยการแตะ";
}

function resizeCameraCanvas() {
  const canvas = elements.cameraCanvas;
  canvas.width = elements.cameraVideo.videoWidth || 640;
  canvas.height = elements.cameraVideo.videoHeight || 360;
}

function clearCameraCanvas() {
  const context = elements.cameraCanvas.getContext("2d");
  context.clearRect(0, 0, elements.cameraCanvas.width, elements.cameraCanvas.height);
}

function processCameraFrame(now) {
  if (!cameraStream || !handLandmarker) return;

  if (
    elements.cameraVideo.readyState >= 2 &&
    elements.cameraVideo.currentTime !== lastVideoTime
  ) {
    lastVideoTime = elements.cameraVideo.currentTime;
    try {
      const result = handLandmarker.detectForVideo(elements.cameraVideo, now);
      processHandResult(result, now);
    } catch (error) {
      console.error("Hand tracking error", error);
      elements.cameraStatus.textContent = "ระบบตรวจจับมือสะดุด กรุณาปิดและเปิดกล้องใหม่";
    }
  }

  cameraLoopId = requestAnimationFrame(processCameraFrame);
}

function processHandResult(result, now) {
  const landmarks = result.landmarks?.[0];
  clearCameraCanvas();
  if (landmarks) {
    drawHandCursor(landmarks);
  }

  if (!landmarks) {
    handleNoOpenPalm(now, "ยกฝ่ามือให้กล้องเห็น");
    return;
  }

  if (!isOpenPalm(landmarks)) {
    handleNoOpenPalm(now, "กางนิ้วมือให้เห็นชัด ๆ");
    return;
  }

  noHandSince = 0;
  if (gestureNeedsReset) {
    elements.cameraStatus.textContent = "ลดมือลงสักครู่ก่อนตอบข้อถัดไป";
    clearGestureSelection();
    return;
  }

  if (!acceptingAnswer || !screens.game.classList.contains("active")) {
    clearGestureSelection();
    return;
  }

  const rawPalmX = average([landmarks[0].x, landmarks[5].x, landmarks[9].x, landmarks[13].x, landmarks[17].x]);
  const mirroredX = 1 - rawPalmX;
  const zone = mirroredX < 1 / 3 ? "high" : mirroredX < 2 / 3 ? "middle" : "low";

  if (zone !== gestureZone) {
    clearGestureSelection();
    gestureZone = zone;
    gestureStart = now;
  }

  const elapsed = now - gestureStart;
  const progress = Math.min(100, (elapsed / HOLD_DURATION) * 100);
  const activeCard = elements.answerCards.find((card) => card.dataset.group === zone);
  activeCard.classList.add("gesture-active");
  activeCard.style.setProperty("--hold-progress", `${progress}%`);
  elements.cameraStatus.textContent = `กำลังเลือก “${GROUPS[zone].label}” ${Math.round(progress)}%`;

  if (elapsed >= HOLD_DURATION) {
    chooseAnswer(zone, "gesture");
  }
}

function handleNoOpenPalm(now, message) {
  clearGestureSelection();
  elements.cameraStatus.textContent = message;
  if (!noHandSince) noHandSince = now;
  if (gestureNeedsReset && now - noHandSince > 450) {
    gestureNeedsReset = false;
    elements.cameraStatus.textContent = "พร้อมแล้ว — ยกฝ่ามือเลือกคำตอบ";
  }
}

function isOpenPalm(landmarks) {
  const wrist = landmarks[0];
  const fingerPairs = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  const extendedFingers = fingerPairs.filter(([tip, joint]) => {
    return distance(landmarks[tip], wrist) > distance(landmarks[joint], wrist) * 1.12;
  }).length;
  return extendedFingers >= 3;
}

function drawHandCursor(landmarks) {
  const canvas = elements.cameraCanvas;
  const context = canvas.getContext("2d");
  const palmX = average([landmarks[0].x, landmarks[5].x, landmarks[9].x, landmarks[13].x, landmarks[17].x]);
  const palmY = average([landmarks[0].y, landmarks[5].y, landmarks[9].y, landmarks[13].y, landmarks[17].y]);
  const x = palmX * canvas.width;
  const y = palmY * canvas.height;

  context.beginPath();
  context.arc(x, y, Math.max(16, canvas.width * 0.035), 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 213, 75, 0.9)";
  context.fill();
  context.lineWidth = Math.max(3, canvas.width * 0.006);
  context.strokeStyle = "white";
  context.stroke();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

elements.answerCards.forEach((card) => {
  card.addEventListener("click", () => chooseAnswer(card.dataset.group));
});
elements.modeOptions.forEach((button) => {
  button.addEventListener("click", () => setGameMode(button.dataset.mode));
});
elements.countOptions.forEach((button) => {
  button.addEventListener("click", () => setQuestionCount(Number(button.dataset.count)));
});
elements.startButton.addEventListener("click", beginGame);
elements.replayButton.addEventListener("click", beginGame);
elements.homeButton.addEventListener("click", goHome);
elements.resultHomeButton.addEventListener("click", goHome);
elements.cameraToggle.addEventListener("click", toggleCamera);
elements.howButton.addEventListener("click", () => elements.howDialog.showModal());
elements.closeHow.addEventListener("click", () => elements.howDialog.close());
elements.dialogPlay.addEventListener("click", () => elements.howDialog.close());
elements.howDialog.addEventListener("click", (event) => {
  if (event.target === elements.howDialog) elements.howDialog.close();
});
window.addEventListener("resize", () => {
  if (cameraStream) resizeCameraCanvas();
});
window.addEventListener("beforeunload", stopCameraTracks);
window.addEventListener("beforeunload", stopGameTimer);

syncModeUi();
