# Asset Setup Instructions

The game comes with built-in procedural placeholders (Capsules for Humans, Glowing Spheres for Aliens, Blocky Cars).
To upgrade the visuals to high-quality models, please download the following assets and place them in the `public/models/` directory.

### Directory Structure
Create a folder named `models` inside the `public` folder:
```
public/
  models/
    human.glb
    alien.glb
    vehicle.glb
```

### Download Links

1.  **Human Character** (`human.glb`)
    *   **Source**: [Quaternius Ultimate Platformer Pack](https://quaternius.com/packs/ultimateplatformer.html)
    *   **Action**: Download the pack, unzip, find the "Character_Astronaut" or similar `.glb` or `.gltf` file. Rename it to `human.glb`.

2.  **Alien Character** (`alien.glb`)
    *   **Source**: [Quaternius Sci-Fi Enemies](https://quaternius.com/packs/scifienemies.html)
    *   **Action**: Download the pack, find a suitable Alien model. Rename it to `alien.glb`.

3.  **Vehicle** (`vehicle.glb`)
    *   **Source**: [Sketchfab Cyberpunk Car](https://sketchfab.com/3d-models/cyberpunk-car-free-2303c734491741279144368b6938a16c)
    *   **Action**: Download the GLB format. Rename it to `vehicle.glb`. (Note: You might need to adjust scaling in `PlayerController.ts` or `Vehicle.ts` if the model is too big/small).

### Troubleshooting
If the models do not appear, check the browser console (F12) for 404 errors. The game will automatically fall back to placeholders if the files are missing.
