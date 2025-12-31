import { Handler } from '@netlify/functions';
import * as faceapi from 'face-api.js';
import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import { get and set } from '@netlify/blobs';

// This is necessary for face-api.js to work in Node.js
faceapi.env.monkeyPatch({ Canvas, Image });

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const loadModels = async () => {
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
};

let modelsLoaded = false;

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // Load models only once per cold start
    if (!modelsLoaded) {
      console.log('Loading face-api.js models...');
      await loadModels();
      modelsLoaded = true;
      console.log('Models loaded.');
    }

    const body = JSON.parse(event.body || '{}');
    const { name, image } = body; // image is expected to be a base64 data URL

    if (!name || !image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Name and image are required.' }),
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

    // Store the face descriptor in Netlify Blobs
    const faceData = {
      name: name,
      descriptor: Array.from(detection.descriptor), // Convert Float32Array to regular Array for JSON
    };

    // Use Netlify Blobs to save the data
    await set(`face-${name.toLowerCase()}`, JSON.stringify(faceData));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Successfully enrolled ${name}.` }),
    };
  } catch (error) {
    console.error('Error during enrollment:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error during enrollment.', error: error.message }),
    };
  }
};

export { handler };
