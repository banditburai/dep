import "./style.css";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { env, pipeline, RawImage } from "@xenova/transformers";

import { createNoise2D } from "simplex-noise";

// Initialize simplex noise
const noise2D = createNoise2D(Math.random);

// Global variable to store the depth canvas
let depthCanvasGlobal;
let depthMapBlob = null;
let uploadedDepthMap = null;
let globalMaterial;
let capturer;
let capturing = false;
let renderer, scene, camera;
let animateToggle = true;

// Constants
const EXAMPLE_URL =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/bread_small.png";
const DEFAULT_SCALE = 0.75;

// Reference the elements that we will need
const status = document.getElementById("status");
const imageUpload = document.getElementById("upload");
const example = document.getElementById("example");
const depthMapUpload = document.getElementById("upload-depth-map");
const imageContainer = document.getElementById("container");
const revertDepthMapButton = document.getElementById("revertDepthMap");
const toggleAnimationButton = document.getElementById("toggleAnimation");
const startRecordingButton = document.getElementById("startRecording"); // Add a button to start recording
const stopRecordingButton = document.getElementById("stopRecording"); // Add a button to stop recording

function initCapturer() {
  capturer = new CCapture({
      format: 'webm',
      framerate: 60
  });
}

// Create a new depth-estimation pipeline
status.textContent = "Loading model...";
const depth_estimator = await pipeline(
  "depth-estimation",
  "Xenova/depth-anything-small-hf",
);
// const depth_estimator = await pipeline("depth-estimation", model="Intel/dpt-large");
status.textContent = "Ready";

example.addEventListener("click", () => {
  predict(EXAMPLE_URL);
});

// Event listener for image upload
imageUpload.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    predict(e.target.result);
  };
  reader.readAsDataURL(file);
});

// Event listener for depth map upload
depthMapUpload.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  status.textContent = `Applying depth map: ${file.name}`; // Display file name
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedDepthMap = e.target.result;
    updateSceneWithUploadedDepthMap(uploadedDepthMap, file.name);
  };
  reader.readAsDataURL(file);
});

revertDepthMapButton.addEventListener("click", () => {
  if (depthCanvasGlobal) {
    updateSceneWithUploadedDepthMap(depthCanvasGlobal); // Use the stored canvas
    status.textContent = "Reverted to predicted depth map";
  }
});

let onSliderChange;

// Predict depth map for the given image
async function predict(url) {
  imageContainer.innerHTML = "";
  status.textContent = "Analysing...";
  const image = await RawImage.fromURL(url);
  const { canvas, scene, camera, renderer, setDisplacementMap } = setupScene(
    url,
    image.width,
    image.height,
  );
  imageContainer.append(canvas);

  try {
    const result = await depth_estimator(image);
    depthCanvasGlobal = result.depth;
    setDisplacementMap(depthCanvasGlobal.toCanvas());
    status.textContent = "Predicted map applied";
    depthMapBlob = await depthCanvasGlobal.toBlob("image/png");
  } catch (error) {
    console.error("Error during depth estimation or Blob creation:", error);
  }

  status.textContent = "";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.addEventListener("input", (e) => {
    onSliderChange(parseFloat(e.target.value));
  });
  slider.defaultValue = DEFAULT_SCALE;
  imageContainer.append(slider);
  status.textContent = "Ready";
  animate(scene, camera, renderer);
}

const downloadDepthMapButton = document.getElementById("downloadDepthMap");
if (downloadDepthMapButton) {
  downloadDepthMapButton.addEventListener("click", () => {
    console.log("Download button clicked"); // Confirm the click event

    if (depthMapBlob) {
      console.log("Initiating download for Blob:", depthMapBlob); // Check the state of depthMapBlob
      try {
        // Attempt to create an object URL and initiate download
        const objectURL = URL.createObjectURL(depthMapBlob);
        const link = document.createElement("a");
        link.href = objectURL;
        link.download = "depth-map.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectURL);
      } catch (error) {
        console.error("Error during download:", error);
      }
    } else {
      console.error("Depth map is not ready for download.");
    }
  });
} else {
  console.error("Download button not found in the DOM.");
}

function updateSceneWithUploadedDepthMap(
  depthMapInput,
  fileName = "predicted",
) {
  if (!depthMapInput || !globalMaterial) return;

  let depthTexture;

  if (depthMapInput instanceof HTMLCanvasElement) {
    depthTexture = new THREE.CanvasTexture(depthMapInput);
  } else if (depthMapInput instanceof Blob) {
    // Create a URL from the blob
    const url = URL.createObjectURL(depthMapInput);
    depthTexture = new THREE.TextureLoader().load(url, () => {
      URL.revokeObjectURL(url); // Clean up the object URL
    });
  } else {
    depthTexture = new THREE.TextureLoader().load(depthMapInput);
  }

  status.textContent = `Depth map '${fileName}' applied`;
  globalMaterial.displacementMap = depthTexture;
  globalMaterial.needsUpdate = true;
}

revertDepthMapButton.addEventListener("click", () => {
  if (depthMapBlob) {
    updateSceneWithUploadedDepthMap(depthMapBlob);
    status.textContent = "Reverted to predicted depth map";
  }
});


toggleAnimationButton.addEventListener("click", () => {
  console.log('button was clicked');
  animateToggle = !animateToggle; // Toggle the animation state
  if (animateToggle) animate(); // Restart animation if toggled on
});

function setupScene(url, w, h) {
  const canvas = document.createElement("canvas");
  const width = canvas.width = imageContainer.offsetWidth;
  const height = canvas.height = imageContainer.offsetHeight;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, width / height, 0.01, 10);
  camera.position.set(0, 0, 2);
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  scene.add(camera);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);  
  const light = new THREE.AmbientLight(0xffffff, 2);
  scene.add(light);
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  globalMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
  globalMaterial.displacementScale = DEFAULT_SCALE;
  const setDisplacementMap = (canvas) => {
    globalMaterial.displacementMap = new THREE.CanvasTexture(canvas);
    globalMaterial.needsUpdate = true;
  };
  const setDisplacementScale = (scale) => {
    globalMaterial.displacementScale = scale;
    globalMaterial.needsUpdate = true;
  };
  onSliderChange = setDisplacementScale;
  const [pw, ph] = w > h ? [1, h / w] : [w / h, 1];
  const geometry = new THREE.PlaneGeometry(pw, ph, w, h);
  const plane = new THREE.Mesh(geometry, globalMaterial);
  scene.add(plane);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
    controls.update();
  });
  window.addEventListener("resize", () => {
    const width = imageContainer.offsetWidth;
    const height = imageContainer.offsetHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }, false);

  initCapturer();

  return {
    canvas: renderer.domElement,
    scene,
    camera,
    renderer,
    setDisplacementMap,
  };
}

function animate() {
  if (!animateToggle) return;

  requestAnimationFrame(animate); 
  const time = performance.now();

  // Adjust these multipliers to reduce the influence of noise
  const noiseScale = 0.75; // Lower this value for subtler movement
  const lerpFactor = 0.75; // This controls the smoothness of camera movement

  const noiseX = noise2D(time * 0.0001, 0) * noiseScale; // Reduced time scale for slower movement
  const noiseY = noise2D(time * 0.0001, 1) * noiseScale;

  // Lerp (linear interpolate) the camera position for smoother movement
  camera.position.x += (noiseX - camera.position.x) * lerpFactor;
  camera.position.y += (noiseY - camera.position.y) * lerpFactor;

  // Keep the camera looking at the center of the scene
  camera.lookAt(scene.position);

  renderer.render(scene, camera);

  if (capturing) {
    capturer.capture(renderer.domElement);
}
}

startRecordingButton.addEventListener('click', () => {
  capturing=true;
  capturer.start();  
});

// Stop recording
stopRecordingButton.addEventListener('click', () => {
  capturing= false;
  capturer.stop();
  capturer.save();  
});