import { Handler, HandlerEvent } from '@netlify/functions';
import * as faceapi from 'face-api.js';
import { Canvas, Image, createCanvas, loadImage } from 'canvas';
import { getStore } from '@netlify/blobs';

// Monkey patch the environment
faceapi.env.monkeyPatch({ Canvas: Canvas as any, Image: Image as any });

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// --- Globals for caching ---
let modelsLoaded = false;
let faceMatcher: faceapi.FaceMatcher | null = null;
const FACE_MATCH_TOLERANCE = 0.6;

// --- Model and Face Matcher Loading ---
const loadModels = async () => {
  if (modelsLoaded) return;
  console.log('Loading face-api.js models...');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
  console.log('Models loaded.');
};

const getFaceMatcher = async () => {
  // In a real high-traffic app, you'd want a more robust caching strategy,
  // but for this prototype, rebuilding the matcher on each cold start is fine.
  console.log('Fetching known faces from Blobs to build FaceMatcher...');
  const store = getStore('faces');
  const { blobs } = await store.list();

  if (!blobs || blobs.length === 0) {
    console.log('No faces found in Blob store. Using empty matcher.');
    return new faceapi.FaceMatcher([], FACE_MATCH_TOLERANCE);
  }

  const labeledDescriptors = await Promise.all(
    blobs.map(async (blob) => {
      const data = await store.get(blob.key, { type: 'json' });
      if (data && data.name && data.descriptor) {
        return new faceapi.LabeledFaceDescriptors(data.name, [new Float32Array(data.descriptor)]);
      }
      return null;
    })
  );

  // Filter out any nulls from failed reads
  const validDescriptors = labeledDescriptors.filter(d => d !== null) as faceapi.LabeledFaceDescriptors[];

  faceMatcher = new faceapi.FaceMatcher(validDescriptors, FACE_MATCH_TOLERANCE);
  console.log(`FaceMatcher created with ${validDescriptors.length} known faces.`);
  return faceMatcher;
};


// --- Recognition Handler ---
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    await loadModels();
    const matcher = await getFaceMatcher();

    const body = JSON.parse(event.body || '{}');
    const { image } = body;

    if (!image) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Image (base64) is required.' }) };
    }

    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const img = await loadImage(imgBuffer);
    const canvas = createCanvas(img.width, img.height);
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, img.width, img.height);

    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
        return { statusCode: 200, body: JSON.stringify({ label: 'Unknown' }) };
    }

    const bestMatch = matcher.findBestMatch(detection.descriptor);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ label: bestMatch.toString() }),
    };
  } catch (error) {
    console.error('Error during recognition:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error during recognition.', error: error.message }),
    };
  }
};

export { handler };