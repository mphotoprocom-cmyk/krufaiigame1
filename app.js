import { GROUPS, QUESTION_COUNT, allLetters, scoreDelta, shuffled } from "./game-core.js";

const HOLD_DURATION = 1000;
const MEDIAPIPE_VERSION = "0.10.35";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const screens = {
  start: document.querySelector("#start-screen"),
  game: document.querySelector("#game-screen"),
  result: document.querySelector("#result-screen"),
};

const elements = {
  startButton: document.querySelector("#start-button"),
  howButton: document.querySelector("#how-button"),
  howDialog: document.querySelector("#how-dialog"),
  closeHow: document.querySelector("#close-how"),
  dialogPlay: document.querySelector("#dialog-play"),
  homeButton: document.querySelector("#home-button"),
  resultHomeButton: document.querySelector("#result-home-button"),
  replayButton: document.querySelector("#replay-button"),
  questionLetter: document.querySelector("#question-letter"),
  scoreValue: document.querySelector("#score-value"),
  questionNumber: document.querySelector("#question-number"),
  totalQuestions: document.querySelector("#total-questions"),
  answerCards: [...document.querySelectorAll(".answer-card")],
  feedback: document.querySelector("#feedback"),
  finalScore: document.querySelector("#final-score"),
  correctCount: document.querySelector("#correct-count"),
  wrongCount: document.querySelector("#wrong-count"),
  resultTitle: document.querySelector("#result-title"),
  resultMedal: document.querySelector("#result-medal"),
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

let cameraStream = null;
let handLandmarker = null;
let cameraLoopId = null;
let cameraStarting = false;
let gestureZone = null;
let gestureStart = 0;
let gestureNeedsReset = false;
let noHandSince = 0;
let lastVideoTime = -1;

elements.totalQuestions.textContent = String(QUESTION_COUNT);

function setScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("active", key === name);
  });
}

function beginGame() {
  questions = shuffled(allLetters()).slice(0, QUESTION_COUNT);
  questionIndex = 0;
  score = 0;
  correctAnswers = 0;
  wrongAnswers = 0;
  elements.scoreValue.textContent = "0";
  setScreen("game");
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
  elements.questionLetter.textContent = question.letter;
  elements.questionLetter.classList.remove("pop");
  requestAnimationFrame(() => elements.questionLetter.classList.add("pop"));
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
  const selectedCard = elements.answerCards.find((card) => card.dataset.group === group);
  const correctCard = elements.answerCards.find((card) => card.dataset.group === current.group);
  const isCorrect = group === current.group;

  if (isCorrect) {
    score += scoreDelta(true);
    correctAnswers += 1;
    selectedCard.classList.add("correct-answer");
    showFeedback("ถูกต้อง! +1 ⭐", "good");
    playTone(660, 0.12, "sine");
    setTimeout(() => playTone(880, 0.16, "sine"), 110);
  } else {
    score += scoreDelta(false);
    wrongAnswers += 1;
    selectedCard.classList.add("wrong-answer");
    correctCard.classList.add("correct-answer");
    showFeedback(`ยังไม่ถูก −1 · คำตอบคือ ${GROUPS[current.group].label}`, "bad");
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

function showResult() {
  acceptingAnswer = false;
  clearGestureSelection();
  stopCamera();
  elements.finalScore.textContent = String(score);
  elements.correctCount.textContent = String(correctAnswers);
  elements.wrongCount.textContent = String(wrongAnswers);

  if (score >= 9) {
    elements.resultTitle.textContent = "ยอดเยี่ยมมาก!";
    elements.resultMedal.textContent = "🏆";
  } else if (score >= 5) {
    elements.resultTitle.textContent = "เก่งมาก!";
    elements.resultMedal.textContent = "🥇";
  } else {
    elements.resultTitle.textContent = "ลองอีกครั้งนะ!";
    elements.resultMedal.textContent = "🌟";
  }
  setScreen("result");
}

function goHome() {
  acceptingAnswer = false;
  clearGestureSelection();
  stopCamera();
  setScreen("start");
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
    elements.cameraStatus.textContent = "ยกฝ่ามือให้เห็นในกรอบ";
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

  if (!landmarks) {
    handleNoOpenPalm(now, "ยกฝ่ามือให้เห็นในกรอบ");
    return;
  }

  drawHandCursor(landmarks);
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

  context.setLineDash([8, 8]);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255,255,255,0.5)";
  [1 / 3, 2 / 3].forEach((ratio) => {
    context.beginPath();
    context.moveTo(canvas.width * ratio, 0);
    context.lineTo(canvas.width * ratio, canvas.height);
    context.stroke();
  });
  context.setLineDash([]);
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
