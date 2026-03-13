import {
  TextureLoader,
  Texture,
  LoadingManager,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";
import { events } from "../utils/EventBus";

export class AssetManager {
  private loadingManager: LoadingManager;
  private gltfLoader: GLTFLoader;
  private textureLoader: TextureLoader;

  public models: Record<string, GLTF> = {};
  public textures: Record<string, Texture> = {};

  constructor() {
    this.loadingManager = new LoadingManager(
      () => {
        events.emit("assets:loaded");
      },
      (_url, itemsLoaded, itemsTotal) => {
        events.emit("assets:progress", itemsLoaded / itemsTotal);
      },
      (url) => {
        console.error(`Error loading ${url}`);
      },
    );

    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.textureLoader = new TextureLoader(this.loadingManager);
  }

  public async loadModel(name: string, path: string): Promise<GLTF> {
    if (this.models[name]) return this.models[name];

    const gltf = await this.gltfLoader.loadAsync(path);
    this.models[name] = gltf;
    return gltf;
  }

  public async loadAllAssets(): Promise<void> {
    // We can define a list of required assets here
    const promises = [
      this.loadModel("robot", "/models/player/robot.glb"),
      this.loadTexture("terrain_diffuse", "/textures/planet/rock_diffuse.jpg"),
      this.loadTexture("terrain_normal", "/textures/planet/rock_normal.jpg"),
      this.loadTexture(
        "terrain_roughness",
        "/textures/planet/rock_roughness.jpg",
      ),
    ];

    await Promise.all(promises);
  }

  public async loadTexture(
    name: string,
    path: string,
    pixelated = false,
  ): Promise<Texture> {
    if (this.textures[name]) return this.textures[name];

    const texture = await this.textureLoader.loadAsync(path);

    // Default nice settings
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;

    if (pixelated) {
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
    }

    this.textures[name] = texture;
    return texture;
  }
}

export const assetManager = new AssetManager();
