import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { ProgressPhotoOverlayLine, ProgressPhotoOverlayShape } from '../types';
import { apiBlob } from '../services/api';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

/** MediaPipe Pose landmark indices (BlazePose 33). */
const LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24
} as const;

export type PosePoint = { x: number; y: number; visibility?: number };

export type MeasuredPoseLandmarks = {
  nose: PosePoint;
  leftShoulder: PosePoint;
  rightShoulder: PosePoint;
  leftHip: PosePoint;
  rightHip: PosePoint;
  leftEar: PosePoint;
  rightEar: PosePoint;
  leftEye: PosePoint;
  rightEye: PosePoint;
};

export type MeasuredPhotoOverlays = {
  shapes: ProgressPhotoOverlayShape[];
  /** Line-only view for API / older renderers */
  lines: ProgressPhotoOverlayLine[];
  summary: string;
};

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

async function getPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU'
          },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4
        });
      } catch {
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU'
          },
          runningMode: 'IMAGE',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4
        });
      }
    })().catch((error) => {
      poseLandmarkerPromise = null;
      throw error;
    });
  }
  return poseLandmarkerPromise;
}

function pointFrom(landmark: NormalizedLandmark | undefined): PosePoint | null {
  if (!landmark) return null;
  return {
    x: clamp01(landmark.x),
    y: clamp01(landmark.y),
    visibility: landmark.visibility
  };
}

function requirePoint(landmarks: NormalizedLandmark[], index: number, name: string): PosePoint {
  const point = pointFrom(landmarks[index]);
  if (!point) throw new Error(`Could not detect ${name} in this photo.`);
  return point;
}

export function extractMeasuredPose(landmarks: NormalizedLandmark[]): MeasuredPoseLandmarks {
  return {
    nose: requirePoint(landmarks, LM.nose, 'face'),
    leftShoulder: requirePoint(landmarks, LM.leftShoulder, 'left shoulder'),
    rightShoulder: requirePoint(landmarks, LM.rightShoulder, 'right shoulder'),
    leftHip: requirePoint(landmarks, LM.leftHip, 'left hip'),
    rightHip: requirePoint(landmarks, LM.rightHip, 'right hip'),
    leftEar: requirePoint(landmarks, LM.leftEar, 'left ear'),
    rightEar: requirePoint(landmarks, LM.rightEar, 'right ear'),
    leftEye: requirePoint(landmarks, LM.leftEye, 'left eye'),
    rightEye: requirePoint(landmarks, LM.rightEye, 'right eye')
  };
}

function horizontalLine(
  id: string,
  label: string,
  left: PosePoint,
  right: PosePoint,
  yOverride?: number
): ProgressPhotoOverlayShape {
  const y = clamp01(yOverride ?? (left.y + right.y) / 2);
  const x1 = clamp01(Math.min(left.x, right.x));
  const x2 = clamp01(Math.max(left.x, right.x));
  // Slightly extend past joints so the cue reads as a body-width mark.
  const pad = Math.max(0.01, (x2 - x1) * 0.08);
  return {
    kind: 'line',
    id,
    label,
    points: [
      { x: clamp01(x1 - pad), y },
      { x: clamp01(x2 + pad), y }
    ]
  };
}

function faceOval(pose: MeasuredPoseLandmarks): ProgressPhotoOverlayShape {
  const earSpan = Math.abs(pose.leftEar.x - pose.rightEar.x);
  const eyeSpan = Math.abs(pose.leftEye.x - pose.rightEye.x);
  const width = Math.max(earSpan, eyeSpan, 0.06);
  const rx = clamp01(width * 0.72);
  const ry = clamp01(rx * 1.25);
  // Center between eyes/nose, a touch above the nose for a natural head oval.
  const cx = clamp01((pose.leftEye.x + pose.rightEye.x + pose.nose.x) / 3);
  const cy = clamp01((pose.leftEye.y + pose.rightEye.y) / 2 - ry * 0.15);
  return { kind: 'oval', id: 'face', label: 'Face', cx, cy, rx, ry };
}

function waistFromShouldersAndHips(pose: MeasuredPoseLandmarks): ProgressPhotoOverlayShape {
  // Natural waist sits between shoulders and hips — closer to hips than mid-torso guess.
  const t = 0.55;
  const left = {
    x: pose.leftShoulder.x + (pose.leftHip.x - pose.leftShoulder.x) * t,
    y: pose.leftShoulder.y + (pose.leftHip.y - pose.leftShoulder.y) * t
  };
  const right = {
    x: pose.rightShoulder.x + (pose.rightHip.x - pose.rightShoulder.x) * t,
    y: pose.rightShoulder.y + (pose.rightHip.y - pose.rightShoulder.y) * t
  };
  // Waist is typically narrower than shoulders/hips.
  const midX = (left.x + right.x) / 2;
  const halfWidth = Math.abs(right.x - left.x) * 0.42;
  return horizontalLine(
    'waist',
    'Waist',
    { x: midX - halfWidth, y: left.y },
    { x: midX + halfWidth, y: right.y }
  );
}

export function buildOverlaysFromPose(pose: MeasuredPoseLandmarks): MeasuredPhotoOverlays {
  const shapes: ProgressPhotoOverlayShape[] = [
    faceOval(pose),
    horizontalLine('shoulders', 'Shoulders', pose.leftShoulder, pose.rightShoulder),
    waistFromShouldersAndHips(pose),
    horizontalLine('hips', 'Hips', pose.leftHip, pose.rightHip)
  ];

  const lines: ProgressPhotoOverlayLine[] = shapes
    .filter((shape): shape is Extract<ProgressPhotoOverlayShape, { kind: 'line' }> => shape.kind === 'line')
    .map((shape) => ({ id: shape.id, label: shape.label, points: shape.points }));

  const shoulderWidth = Math.abs(pose.leftShoulder.x - pose.rightShoulder.x);
  const hipWidth = Math.abs(pose.leftHip.x - pose.rightHip.x);
  const shoulderY = (pose.leftShoulder.y + pose.rightShoulder.y) / 2;
  const hipY = (pose.leftHip.y + pose.rightHip.y) / 2;

  const summary = [
    `shoulderWidth=${shoulderWidth.toFixed(3)}`,
    `hipWidth=${hipWidth.toFixed(3)}`,
    `shoulderY=${shoulderY.toFixed(3)}`,
    `hipY=${hipY.toFixed(3)}`,
    `noseY=${pose.nose.y.toFixed(3)}`
  ].join(', ');

  return { shapes, lines, summary };
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load a progress photo for pose detection.'));
    image.src = url;
  });
}

/** Load via API proxy so Firebase Storage CORS does not block MediaPipe pixel access. */
async function loadImageForDetection(
  programId: string,
  imageUrl: string
): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const blob = await apiBlob(
    `/api/programs/${programId}/progress-photos/proxy?url=${encodeURIComponent(imageUrl)}`
  );
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    return { image, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function detectPoseOverlays(programId: string, imageUrl: string): Promise<MeasuredPhotoOverlays> {
  const landmarker = await getPoseLandmarker();
  const loaded = await loadImageForDetection(programId, imageUrl);
  try {
    const result = landmarker.detect(loaded.image);
    const landmarks = result.landmarks?.[0];
    if (!landmarks?.length) {
      throw new Error('Could not detect a body pose in this photo. Try a clearer full-body shot.');
    }
    return buildOverlaysFromPose(extractMeasuredPose(landmarks));
  } finally {
    loaded.revoke();
  }
}

export async function detectBeforeAfterOverlays(programId: string, beforeUrl: string, afterUrl: string) {
  const [before, after] = await Promise.all([
    detectPoseOverlays(programId, beforeUrl),
    detectPoseOverlays(programId, afterUrl)
  ]);
  return { before, after };
}
