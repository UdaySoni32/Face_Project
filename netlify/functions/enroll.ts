import { Handler, HandlerEvent } from '@netlify/functions';
import * as faceapi from 'face-api.js';
import { Canvas, Image, createCanvas, loadImage } from 'canvas';
import { getStore, set } from '@netlify/blobs';

// Monkey patch the environment for face-api.js to work in a Node.js environment
faceapi.env.monkeyPatch({ Canvas: Canvas as any, Image: Image as any });

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// Cache models globally across function invocations for performance
let modelsLoaded = false;
const loadModels = async () => {
  if (modelsLoaded) return;
  console.log('Loading face-api.js models...');
  // These are the specific models needed for face detection and recognition
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  modelsLoaded = true;
  console.log('Models loaded.');
};

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  // --- Authentication Check ---
  if (!event.context || !event.context.clientContext || !event.context.clientContext.user) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized: You must be logged in to enroll.' }) };
  }
  // --- End Authentication Check ---

  try {
    // Ensure models are loaded before processing
    if (!modelsLoaded) {
      await loadModels();
    }

    const body = JSON.parse(event.body || '{}');
    const { name, image } = body; // image is expected to be a base64 data URL

    if (!name || !image) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Name and image (base64 data URL) are required.' }) };
    }

    // Convert base64 image data to a format face-api.js can use
    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const img = await loadImage(imgBuffer);

    // Create a canvas to draw the image on, which is what face-api expects
    const canvas = createCanvas(img.width, img.height);
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, img.width, img.height);

    // Detect the face and compute the descriptor (the mathematical representation)
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No face detected in the provided image. Please provide a clear, forward-facing photo.' }) };
    }

    // Prepare data for storage. We must convert the Float32Array to a regular array for JSON compatibility.
    const faceData = {
      name: name,
      descriptor: Array.from(detection.descriptor),
    };

    // Get the blob store for faces and save the data.
    // The key will be the person's name, sanitized for use as a key.
    const store = getStore('faces');
    const key = name.trim().toLowerCase().replace(/\s+/g, '-');
    await store.setJSON(key, faceData);

    console.log(`Successfully enrolled and saved data for ${name} with key ${key}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Successfully enrolled ${name}.` }),
    };
  } catch (error) {
    console.error('Error during enrollment:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'An internal server error occurred during enrollment.', error: error.message }),
    };
  }
};

export { handler };
