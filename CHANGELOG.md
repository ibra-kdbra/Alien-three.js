# CHANGELOG - ASTRA: LOST SIGNAL

## Project Transformation & Recovery

### Core Engine & Architecture

- **package.json**: Updated dependencies to latest versions (`vite`, `three`, `typescript`, `stats.js`, `rapier`). Added `setup-assets` script.
- **src/main.ts**: Refactored into a clean entry point for the `Game` class.
- **src/core/Game.ts**: Implemented central orchestrator, game loop, system initialization, and mission logic.
- **src/core/ResourceManager.ts**: Created singleton for optimized asset loading, caching, and progress tracking.
- **src/core/SceneManager.ts**: Implemented rendering pipeline, post-processing (tuned Bloom), and concentrated space lighting.
- **src/core/InputManager.ts**: Enhanced with state transition tracking (`isKeyPressed`) and pointer lock management.
- **src/core/RapierPhysicsWorld.ts**: Migrated from Cannon.js to Rapier (WASM). Implemented custom spherical gravity system and fixed initialization warnings.
- **src/core/OrbitCamera.ts**: Created a spherical orbit camera that aligns with planetary curvature; tuned for responsiveness.

### Entities & Systems

- **src/entities/PlayerController.ts**: Replaced "Alien" logic with an "Astronaut" controller using Dynamic RigidBody physics, walk/run modes, and camera switching.
- **src/entities/Vehicle.ts**: Implemented a Hover Rover with a complex Raycast Suspension system to prevent ground clipping.
- **src/entities/Planet.ts**: Updated with high-detail procedural textures and atmospheric scattering shaders.
- **src/entities/Beacon.ts**: Created new gameplay objective entity with pulsing light and proximity collection.
- **src/world/EnvironmentSystem.ts**: Implemented instanced rendering for trees/rocks with corresponding static physics colliders for every instance.

### Shaders & Visuals

- **src/shaders/Atmosphere.ts**: Custom GLSL for planetary "glow" effect.
- **src/shaders/Skybox.ts**: Procedural procedural starfield/nebula shader.
- **src/utils/TextureGenerator.ts**: Created noise-based planetary texture generator to remove "cartoonish" look.

### Assets & UX

- **index.html**: Modernized HUD with OS-style interface (Oxygen, Signal, Mission Logs) and functional Loading Screen.
- **src/style.css**: Clean "NASA-punk" aesthetic styling with blur effects and glitch animations.
- **scripts/download_assets.cjs**: Created automated script to fetch high-quality CC0 assets for the project.

---
*Note: Each file represents a logical commit in the development history.*
