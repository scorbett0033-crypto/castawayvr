# Human models

The character models (`*.glb` except the `anims_*` files) and animations (`anims_m.glb`, `anims_f.glb`) are from the
[Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox), converted from FBX to optimised glTF
(textures resized and WebP-compressed; animations trimmed to idle / walk / run / sit). Used under the MIT License:

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Base people (base_bm / base_bf, *_lo, anims_bm / anims_bf)
The bald base man and woman were generated for Ready Player 2 with Meshy (image-to-3D, auto-rigging
and animation library), then cleaned up for the game: smoothed shading, evened skin and fabric tones,
padded texture seams, new skin-pore / knit / denim-twill normal maps, fabric masks for dyeing and
lighter crowd meshes (*_lo).
