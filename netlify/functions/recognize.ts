import { Handler } from '@netlify/functions';
import * as faceapi from 'face-api.js';
import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import { get } from '@netlify/blobs';

// Monkey patch the environment for face-api.js to work in Node.js
faceapi.env.monkeyPatch({ Canvas, Image });

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
    if (faceMatcher) return faceMatcher;

    console.log('Fetching known faces from Blobs...');
    const store = await get('faces', { type: 'json' });
    
    if (!store || !Array.isArray(store) || store.length === 0) {
        console.log('No faces found in Blob store. Creating empty matcher.');
        faceMatcher = new faceapi.FaceMatcher([], FACE_MATCH_TOLERANCE);
        return faceMatcher;
    }

    const labeledDescriptors = store.map(
        (data: { name: string; descriptor: number[] }) =>
            new faceapi.LabeledFaceDescriptors(data.name, [new Float32Array(data.descriptor)])
    );

    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, FACE_MATCH_TOLERANCE);
    console.log(`FaceMatcher created with ${labeledDescriptors.length} known faces.`);
    return faceMatcher;
};


// --- Recognition Handler ---
const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    // Ensure models are loaded
    if (!modelsLoaded) {
      await loadModels();
    }

    // Get the face matcher (it will be created on first run and cached for warm invocations)
    const matcher = await getFaceMatcher();

    const body = JSON.parse(event.body || '{}');
    const { image } = body; // Expecting a base64 data URL

    if (!image) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Image (base64) is required.' }) };
    }

    // Decode image and load it into a canvas
    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const img = await loadImage(imgBuffer);
    const canvas = createCanvas(img.width, img.height);
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, img.width, img.height);

    // Detect and recognize faces
    const detections = await faceapi
      .detectAllFaces(img)
      .withFaceLandmarks()
      .withFaceDescriptors();

    const results = detections.map(d => {
      const bestMatch = matcher.findBestMatch(d.descriptor);
      return {
        box: d.detection.box,
        label: bestMatch.toString(),
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify(results),
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
