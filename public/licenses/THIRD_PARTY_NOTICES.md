# Third-party notices

Forest Crew contains or builds upon the following third-party software and assets. This file records their provenance and license identifiers; the linked license texts govern their use.

| Component | Version / artifact | License | Source |
| --- | --- | --- | --- |
| Babylon.js Core | 9.25.0 | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [Babylon.js](https://github.com/BabylonJS/Babylon.js) |
| Babylon.js Loaders | 9.25.0 | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [Babylon.js](https://github.com/BabylonJS/Babylon.js) |
| Babylon.js Havok | 1.3.14 | [MIT](https://opensource.org/license/mit) | [Babylon.js Havok package](https://www.npmjs.com/package/@babylonjs/havok) |
| MediaPipe Tasks Vision runtime | 1.0.1 | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [MediaPipe](https://github.com/google-ai-edge/mediapipe) |
| MediaPipe Hand Landmarker | float16, version 1 | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [Google model storage](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task) |
| Rigged Astronaut | modified GLB | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [J-Toastie on Poly Pizza](https://poly.pizza/m/0oBRDJ9Zl9) |
| TypeScript | 5.9.3 | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | [TypeScript](https://github.com/microsoft/TypeScript) |
| Vite | 8.2.2 | [MIT](https://opensource.org/license/mit) | [Vite](https://github.com/vitejs/vite) |

The astronaut's required attribution and modification notice are preserved in [`../models/ASTRONAUT-LICENSE.md`](../models/ASTRONAUT-LICENSE.md). Dependency distributions installed by `npm ci` include their license and notice files in `node_modules`; retain those license materials when redistributing the corresponding software. Transitive dependency license information remains available in each installed package and its package metadata.

This notice does not grant a license to the Forest Crew source code.

## Babylon.js notice

Babylon.js
Copyright 2023 The Babylon.js team

The Babylon.js package includes Draco Compression 1.5.6, Basis transcoder, GLSLang 11.8.0, TWGSL, and meshoptimizer. Draco, Basis, GLSLang, and TWGSL are licensed under Apache-2.0. meshoptimizer is Copyright (c) 2016–2026 Arseny Kapoulkine and licensed under MIT. This notice is reproduced from `@babylonjs/core` 9.25.0; source links and full terms are available in that installed package and at the license links above.

Environment scans and textures are CC0, with source attribution in ../models/FERN-LICENSE.md, ../models/COAST-ROCKS-LICENSE.md and ../textures/LICENSE.md.
