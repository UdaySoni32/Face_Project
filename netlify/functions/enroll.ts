import { Handler } from '@netlify/functions';
import * as faceapi from 'face-api.js';
import { createCanvas, loadImage, Image } from 'canvas'; // Only Image needed for monkey patch, Canvas for temporary
import { get and set } from '@netlify/blobs';

// This is necessary for face-api.js to work in Node.js
// face-api.js requires HTMLImageElement, HTMLCanvasElement, HTMLVideoElement, etc.
// The 'canvas' library provides Node.js equivalents.
faceapi.env.monkeyPatch({
  Canvas: HTMLCanvasElement, // This will be the actual canvas element for drawing
  Image: HTMLImageElement,  // This will be the actual Image element for loading
});

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// Cache loaded models globally across warm function invocations
let modelsLoaded = false;
let faceMatcher: faceapi.FaceMatcher | null = null;
const TOLERANCE = 0.6; // Threshold for face matching

const loadModels = async () => {
  if (modelsLoaded) return;
  console.log('Loading face-api.js models from CDN...');
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
  console.log('Models loaded.');
};

// --- Helper to get all known faces from Netlify Blobs ---
const loadLabeledFaceDescriptors = async () => {
  const store = await get('faces', { type: 'json' }); // Get the main store of face data

  if (!store || !Array.isArray(store)) {
    return []; // No faces yet
  }

  const labeledDescriptors = store.map((data: { name: string; descriptor: number[] }) => {
    // face-api.js expects Float32Array for descriptors
    return new faceapi.LabeledFaceDescriptors(data.name, [new Float32Array(data.descriptor)]);
  });

  return labeledDescriptors;
};

const updateFaceMatcher = async () => {
  const labeledDescriptors = await loadLabeledFaceDescriptors();
  faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, TOLERANCE);
  console.log(`FaceMatcher updated with ${labeledDescriptors.length} known faces.`);
};

// --- Enrollment Handler ---
const enrollHandler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    if (!modelsLoaded) {
      await loadModels();
    }

    const body = JSON.parse(event.body || '{}');
    const { name, image } = body; // image is expected to be a base64 data URL

    if (!name || !image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Name and image (base64) are required.' }),
      };
    }

    // Decode base64 image
    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const img = await loadImage(imgBuffer);

    // Create a temporary canvas for face-api.js
    const canvas = createCanvas(img.width, img.height);
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, img.width, img.height);

    // Detect face and compute descriptor
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No face detected in the image. Please try again.' }),
      };
    }

    // Prepare face data for storage
    const newFaceData = {
      name: name,
      descriptor: Array.from(detection.descriptor), // Convert Float32Array to regular Array for JSON
    };

    // Load existing faces, add new one, and save back to blobs
    const facesStore = await get('faces', { type: 'json' });
    let currentFaces: Array<{ name: string; descriptor: number[] }> = [];

    if (facesStore && Array.isArray(facesStore)) {
        // Filter out old descriptor for the same person if exists
        currentFaces = facesStore.filter(face => face.name.toLowerCase() !== name.toLowerCase());
    }

    currentFaces.push(newFaceData);
    await set('faces', JSON.stringify(currentFaces)); // Overwrite with updated list

    // Update FaceMatcher in memory for subsequent recognition calls (if warm)
    await updateFaceMatcher(); 

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Successfully enrolled ${name}.` }),
    };
  } catch (error) {
    console.error('Error during enrollment:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error during enrollment.', error: error instanceof Error ? error.message : 'Unknown error' }),
    };
  }
};

export { enrollHandler as handler };