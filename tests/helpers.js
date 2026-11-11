import * as THREE from "three";

export { THREE };

export function installCanvas() {
  globalThis.document = {
    createElement(tag) {
      if (tag !== "canvas") throw new Error("Unexpected DOM request");
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          createLinearGradient: () => ({ addColorStop() {} }),
          createRadialGradient: () => ({ addColorStop() {} }),
          fillRect() {},
          fillStyle: null,
        }),
      };
    },
  };
}

export function cardClass() {
  return class Card {
    constructor() {
      this._scene = new THREE.Scene();
      this.renders = [];
      let ratio = 1;
      this._renderer = {
        outputEncoding: THREE.LinearEncoding,
        toneMapping: THREE.LinearToneMapping,
        toneMappingExposure: 0.6,
        shadowMap: { needsUpdate: false },
        getPixelRatio() {
          return ratio;
        },
        setPixelRatio(value) {
          ratio = value;
        },
      };
      this._ambient_light = new THREE.AmbientLight(0xffffff, 0.5);
      this._torch = new THREE.PointLight(0xffffff, 0.7);
      this._modelready = false;
      this.intersections = [];
    }
    setConfig(config) {
      this._config = config;
      this._object_ids = (config.entities ?? []).map((entity) => ({
        objects: [{ object_id: entity.object_id }],
      }));
    }
    _initobjects(model) {
      const level = new THREE.Group();
      const objects = [];
      model.traverse((object) => objects.push(object));
      for (const object of objects) level.add(object);
      this._levels = [level];
      this._scene.add(level);
      return "initialized";
    }
    _firEvent(event) {
      this.clicked = this._getintersect(event)?.[0]?.object;
      if (this.throwOnClick) throw new Error("native-click-error");
      return "clicked";
    }
    _getintersect() {
      return this.intersections;
    }
    _initAmbient() {
      this._renderer.outputEncoding = THREE.LinearEncoding;
      this._renderer.toneMapping = THREE.LinearToneMapping;
      this._renderer.toneMappingExposure = 0.6;
      this._ambient_light.intensity = 0.5;
      this._torch.intensity = 0.7;
    }
    _onLoaded3DModel(model) {
      if (model) this._initobjects(model);
      this._modelready = true;
      this._setCamera();
      this._renderer.setPixelRatio(2);
      this._initAmbient();
    }
    _updatelight() {
      return "native-light-update";
    }
    _requestRender(reason) {
      this.renders.push(reason);
      return "rendered";
    }
    _setCamera() {
      return "camera";
    }
    _cancelScheduledRender() {}
    connectedCallback() {
      this.connected = true;
      this._isConnected = true;
      if (this._modelready) this._requestRender("connected");
    }
    disconnectedCallback() {
      this.connected = false;
      this._isConnected = false;
      this._cancelScheduledRender();
    }
  };
}

export function texturedModel() {
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
  );
  mesh.name = "Demo_Floor";
  mesh.castShadow = true;
  model.add(mesh);
  return { model, mesh };
}

export function addLight(
  card,
  {
    name = "Demo_Lamp",
    point = false,
    x = 0,
    intensity = 1,
    shadow = false,
    parent = card._scene,
  } = {},
) {
  const light = point
    ? new THREE.PointLight(0xffffff, intensity, 500, 1)
    : new THREE.SpotLight(0xffffff, intensity, 500, Math.PI / 6, 0.5, 1);
  light.name = `${name}_light`;
  light.position.set(x, 100, 0);
  light.castShadow = shadow;
  parent.add(light);
  if (light.isSpotLight) {
    light.target.position.set(x, 0, 0);
    parent.add(light.target);
  }
  return light;
}

export const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
