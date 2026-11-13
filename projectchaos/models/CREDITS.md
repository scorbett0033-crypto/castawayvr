# Models

All models in this folder are original assets generated for PROJECT CHAOS with [Meshy](https://www.meshy.ai) (text-to-3D, PBR refine).
They were then optimized with glTF-Transform: textures were resized and WebP-compressed, and vertices were welded.

- `ted.glb`: the TED test android. It was rigged with Meshy's auto-rigger. Its clips come from Meshy's animation library: idle, walk, run, wave, look-around, hit reactions, arise, dance, cower, cheer, angry, shrug, flee, and "wave for help". All the clips were merged into this one file.
- `hand.glb`: the first-person hand. At runtime it is skinned onto a procedural finger skeleton (`js/hands.js`), and the left hand is a mirrored copy.
- Weapons and tools: `volt_blaster`, `toy_pistol`, `grav_gun`, `mender`, `wrench`, `frying_pan`, `sledgehammer`.
- Props: `crate`, `barrel`, `explosive_barrel`, `cone`, `extinguisher`, `monitor`, `watermelon`, `duck`, `tire`, `toolbox`, `lab_chair`, `bowling_pin`, `server_rack`, `plant`.
