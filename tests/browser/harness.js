import * as THREE from "/node_modules/three/build/three.module.js";
import { GLTFLoader } from "/node_modules/three/examples/jsm/loaders/GLTFLoader.js";

// Minimal native-card contract, real GLTFLoader/WebGLRenderer. No HA connection or services.
class SyntheticCard extends HTMLElement {
  constructor() {
    super();
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x172936);
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setSize(850, 490);
    this._renderer.shadowMap.enabled = true;
    this.appendChild(this._renderer.domElement);
    this._ambient_light = new THREE.AmbientLight(0xffffff, 0.5);
    this._torch = new THREE.PointLight(0xffffff, 0.7);
    this._torch.position.set(100, 200, 150);
    this._scene.add(this._ambient_light, this._torch);
    this._camera = new THREE.PerspectiveCamera(40, 850 / 490, 1, 2000);
    this._camera.position.set(290, 240, 350);
    this._camera.lookAt(0, 30, 0);
    this._modelready = false;
  }
  setConfig(config) {
    this._config = config;
    this._object_ids = [{ objects: [{ object_id: "Demo_Lamp" }] }];
  }
  _initobjects(model) {
    const objects = [];
    model.traverse((object) => objects.push(object));
    this._levels = [new THREE.Group()];
    for (const object of objects) this._levels[0].add(object);
    this._scene.add(this._levels[0]);
  }
  _getintersect() {
    return [];
  }
  _firEvent(event) {
    return this._getintersect(event);
  }
  _initAmbient() {
    this._renderer.outputEncoding = THREE.LinearEncoding;
    this._renderer.toneMapping = THREE.LinearToneMapping;
    this._renderer.toneMappingExposure = 0.6;
  }
  _onLoaded3DModel(model) {
    this._initobjects(model);
    const light = new THREE.SpotLight(0xffd8a0, 4, 700, Math.PI / 3, 0.6, 1);
    light.name = "Demo_Lamp_light";
    light.position.set(0, 100, 0);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    this._scene.add(light, light.target);
    const floor = this._scene.getObjectByName("Demo_Floor");
    floor.receiveShadow = true;
    this._modelready = true;
    this._setCamera();
    this._initAmbient();
  }
  _updatelight() {}
  _requestRender() {
    if (this._modelready) this._renderer.render(this._scene, this._camera);
  }
  _setCamera() {}
  _cancelScheduledRender() {}
  connectedCallback() {
    this._isConnected = true;
    if (this._modelready) this._requestRender("connected");
  }
  disconnectedCallback() {
    this._isConnected = false;
    this._cancelScheduledRender();
  }
}

try {
  // Load before definition to exercise the deferred installation path in the actual bundle.
  await import("/dist/floor3d-pro-addons.js");
  customElements.define("floor3dpro-card", SyntheticCard);
  await Promise.resolve();
  const card = document.querySelector("floor3dpro-card");
  card.setConfig({
    objfile: "demo.glb",
    entities: [
      { entity: "light.demo", type3d: "light", object_id: "Demo_Lamp" },
    ],
    render_upgrade: { light_pool: { spots: 2, points: 0, shadows: 1 } },
  });
  const gltf = await new GLTFLoader().loadAsync("/examples/demo.glb");
  // A generic canvas texture exercises generated environment creation too.
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 2;
  const context = textureCanvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 2, 2);
  gltf.scene.getObjectByName("Demo_Floor").material.map =
    new THREE.CanvasTexture(textureCanvas);
  card._onLoaded3DModel(gltf.scene);
  card._requestRender("test");
  const meshesRestored = card._floor3dproGlbHierarchyFix.attachedMeshes;
  const lights = () =>
    card._scene.children.filter((object) =>
      object.name.startsWith("f3d_pool_"),
    );
  const initial = lights();
  const source = card._scene.getObjectByName("Demo_Lamp_light");
  source.intensity = 0;
  card._updatelight();
  await Promise.resolve();
  source.intensity = 4;
  card._updatelight();
  await Promise.resolve();
  const lightCountStable =
    lights().length === initial.length &&
    initial.every((object, index) => lights()[index] === object);
  const encoding = card._renderer.outputEncoding;
  const programs = card._renderer.info.programs.length;
  card.remove();
  const cleanup =
    lights().length === 0 &&
    source.visible &&
    card._renderer.outputEncoding === THREE.LinearEncoding;
  document
    .querySelector("main")
    .insertBefore(card, document.querySelector("footer"));
  card._requestRender("test");
  window.smokeResult = {
    status: window.floor3dProAddons.status,
    meshesRestored,
    pooledLights: lights().length,
    encoding,
    programs,
    lightCountStable,
    cleanup,
    reconnected: card._renderer.outputEncoding === THREE.sRGBEncoding,
  };
} catch (error) {
  window.smokeError = String(error);
}
