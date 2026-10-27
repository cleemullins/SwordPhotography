# LightingSetupSkill: Nihonto Photography

## Purpose and current status

Handoff for reproducing and continuing a discussion about lighting a polished
Japanese sword blade (nihonto). Recorded October 27, 2026.

The immediate goal is to determine useful tube-light heights and lateral offsets
for an overhead camera. The user wants concrete placement instructions, supported
by reflection geometry, rather than further discussion of stitching technique.

**No optimal arrangement has been established experimentally.** The blade's
cross-section and its actual orientation on the table have not been supplied.
The placement below is a proposed trial, not a measured optimum. No photographs,
cross-sectional measurements, or results from changing the lights were provided.

## Confirmed equipment and arrangement

| Item | Confirmed information |
|---|---|
| Subject | Old Japanese nihonto with a highly reflective polished metal surface |
| Support/background | Blade resting on a flat black table |
| Camera | Nikon Z5II, full frame, mounted directly overhead |
| Lens | 60 mm macro; exact model not supplied |
| Lights | Two 48-inch tube lights, each specified as 5600 K |
| Original light positions | Essentially on the table, next to the blade, one along each long edge |
| Capture method | Approximately 15 overlapping close-up photographs, stitched into a full-length image |
| Movement | Translation only, not a pivoting panorama |
| Settings | User says everything is locked |

"Top" and "bottom" in the user's description mean the two long sides of the
blade in the overhead image, not its tip and tang. The tubes run along its length.
Actual camera height, tube diameter, offsets, blade dimensions, and frame coverage
have not been measured in this conversation.

Repository context: the [README](../../README.md) describes a fixed overhead
camera with the slider moving the object underneath it, and identifies the lights
as GVM BD45R units. Those details come from the existing repository documentation,
not new measurements of the current blade setup.

## Latest practical recommendation

For the next trial, raise the tubes rather than committing to table-level
placement:

| Quantity | Proposed initial setting for each tube |
|---|---|
| Tube height | **250 mm (approximately 10 in) above the table, to the tube center** |
| Lateral offset | **60 mm (approximately 2.4 in) outside the nearest long blade edge, to the tube center** |
| Orientation | Parallel to the blade, emitting side directed toward it |
| Symmetry | Start with the same height and edge offset on both sides |

Measurement conventions matter:

- The 250 mm height is measured from the **table**, not from the blade surface.
- The 60 mm lateral offset is measured horizontally from the **nearest blade
  edge**, not from the blade centerline.
- Both measurements locate the **tube center**, not its outer surface.
- If measuring clear space from blade edge to tube surface, subtract the tube
  radius from the stated edge-to-center offset.

### Proposed comparison

1. Keep the 60 mm edge-to-center lateral offset fixed.
2. Switch on only one tube and compare the same blade patch at tube-center
   heights of **100, 250, and 450 mm above the table**.
3. Keep the original table-level arrangement as a comparison.
4. Use the same camera settings for comparable exposures; record clipping or
   unusably dark frames rather than treating brightness alone as success.
5. Select for visibility of the intended features, then switch on the second
   tube and assess whether it helps.

These are proposed experiments, not completed actions. Table-level illumination
may still be preferable for some details. Do not equate maximum mirror brightness
with maximum visibility of the hamon, grain, or other surface features.

## Geometry: what determines the light positions

### Central point directly under the camera

Let:

- `alpha` = signed local surface-normal tilt from vertical. Its magnitude equals
  the local surface's tilt relative to horizontal.
- `d` = horizontal offset from that surface point to the tube center.
- `h` = tube-center height above that surface point.
- `H` = camera entrance-pupil height above that surface point.

For direct specular reflection from the tube center into the camera:

```text
alpha = 0.5 * atan2(d, h)
d / h = tan(2 * alpha)
h = d / tan(2 * alpha)
```

The normal bisects the directions from the surface toward the light and camera.
**H does not appear in the central-point angle relationship** because the camera
direction is vertical at that point. Camera and light distances do not need to
be equal.

Use a consistent angular unit in calculations. The displayed angles here are
degrees; programming-language trigonometric functions usually use radians.

For a fixed tube-center offset `d = 100 mm`, the calculated matches are:

| Local tilt magnitude | Required height above the selected blade surface |
|---|---:|
| 5 degrees | 567 mm |
| 10 degrees | 275 mm |
| 15 degrees | 173 mm |
| 20 degrees | 119 mm |
| 30 degrees | 58 mm |

These are conditional geometric matches, **not measured slopes of this blade**.

### Converting the proposed physical placement into the model

For a centerline reference point, define:

```text
W = blade width
b = height of the photographed blade surface above the table
e = edge-to-tube-center horizontal offset
Zlight = tube-center height above the table

d = W/2 + e
h = Zlight - b
```

Illustration only: with `W = 35 mm`, `b = 5 mm`, `e = 60 mm`, and
`Zlight = 250 mm`, the model has `d = 77.5 mm`, `h = 245 mm`.
The matching normal tilt is approximately **8.8 degrees**.
Neither W nor b has been measured for the user's blade.

### Two lights and a flat surface

Two symmetric tube centers match opposite local normal tilts. They do not both
provide the ideal mirror reflection from the same perfectly smooth patch.

At the point directly beneath the camera, a horizontal mirror surface requires
an overhead source direction. A laterally offset tube center cannot supply that
central mirror ray. Finite source width and surface roughness broaden the response.

Low side lights can still reveal scattered surface detail while the smooth
specular reflection misses the camera. This is the reason not to dismiss the
original low-light arrangement without comparing photographs.

### Points away from the image center

Use an end-on coordinate system with the reference blade point at `(0, 0)`.
The vertical coordinate increases upward:

```text
Camera pupil:        C = (0, H)
Tube center:         L = (d, h)
Selected surface:   P = (x, z)

Required normal tilt:

alpha = 0.5 * [atan2(d - x, h - z) + atan2(-x, H - z)]
```

Use negative d for the opposite tube. This scalar expression applies to the
upper-facing, end-on geometry considered here; use the vector form for general 3D
geometry.

Camera height matters away from the center because it changes the viewing angle.
Increasing H reduces viewing-angle variation across a fixed physical section,
although it also changes framing for a given lens.

For a horizontal plane at `z = 0`, the tube-center reflection point is:

```text
x = H * d / (H + h)
```

Example: `H = 180 mm`, `d = 80 mm`, `h = 250 mm` gives `x = 33.5 mm`.
That point is outside a hypothetical 35 mm-wide blade, whose edges are at
`x = +/-17.5 mm`.

### General 3D form

All direction vectors below point away from the surface point P:

```text
v = normalize(C - P)             # direction toward camera
l = normalize(L - P)             # direction toward light
n = normalize(l + v)             # normal that produces the specular match
q = 2 * dot(n, v) * n - v         # required source direction for a given normal
```

For an actual finite emitter, the ray `P + t*q`, with `t > 0`, must intersect
an emitting part of the light, with unobstructed paths.

### Tube diameter and angular coverage

For an ideal emitting cylindrical tube in the central end-on cross-section:

```text
r = tube radius
R = sqrt(d*d + h*h)

Tube angular diameter = 2 * asin(r/R)
Matching normal interval = central alpha +/- 0.5 * asin(r/R)
```

Example only: a 25 mm diameter tube at `d = 80 mm`, `h = 250 mm` covers central
normal tilts of approximately **7.51 to 10.24 degrees**.

The 48-inch length extends the emitter along the blade, not across its width.
The actual luminous diameter and emission pattern are still unknown.

## Camera distance: secondary context

Camera height should first produce the desired framing. Do not confuse:

- entrance-pupil height, used for viewing-ray geometry;
- front principal-plane distance, used in the thin-lens equation;
- sensor-to-subject distance;
- working clearance from the lens front.

The Z5II FX sensor is 35.9 x 23.9 mm. With sensor dimension S along the blade,
frame length F, and nominal focal length f:

```text
m = S/F
u = f * (1 + F/S)
v_image = f * (1 + S/F)
thin-lens subject-to-sensor estimate = u + v_image
```

For `f = 60 mm`, `S = 35.9 mm`, and `F = 70 mm`, this yields:

- magnification about 0.513x;
- front principal-plane distance about 177 mm;
- thin-lens subject-to-sensor estimate about 268 mm.

These are estimates, not a calibration of the unspecified lens. Establish actual
framing using a ruler temporarily placed at blade height.

For reference only, 15 frames of 70 mm length with 35% overlap cover 707 mm, with
45.5 mm translation per step. These were illustrative values, not user settings.
Translation and locked settings are already agreed; do not make stitching advice
the focus of the next discussion.

## Existing simulator and reproduction

The following companion files were created:

| File | Purpose |
|---|---|
| `nihonto-lighting.html` | Self-contained offline interactive geometry simulator |
| `nihonto-geometry.excalidraw` | Editable end-on diagram |
| `nihonto-lighting-preview.png` | Screenshot of the simulator with a matching tilted surface |
| `verify-nihonto.cjs` | Node-based mathematical checks; regenerates the Excalidraw diagram |
| `check-nihonto-browser.cjs` | Windows Edge browser smoke checks; generates the preview |

All companion files are stored beside this document in `docs/lighting`.
The mathematical checks use paths relative to their own file, so no original
home-directory or session path is required.

Open `nihonto-lighting.html` directly in a browser; no server or dependencies are
required. From the repository root, run:

```powershell
Set-Location .\docs\lighting
node .\verify-nihonto.cjs
```

Optional browser checks:

```powershell
node .\check-nihonto-browser.cjs
```

The browser check requires a recent Node runtime with built-in fetch and WebSocket,
and currently uses this Windows-specific Edge executable path:

```text
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

It creates an isolated `nihonto-browser-profile` directory beside the files. That
temporary profile was removed after the original run; a later run creates it again.
The directory is excluded by the local `.gitignore`.

### Simulator conventions and limitations

- H is camera entrance-pupil height above the reference blade surface.
- h is tube-center height above that surface, **not table height**.
- d is offset from the blade centerline, **not from its edge**.
- The default is `H = 180`, `h = 250`, `d = 80`, diameter `25`, width `35`,
  all in mm; these are illustrative defaults, not measured equipment settings.
- The latest physical trial setting must be converted using W and b before
  comparing it with the simulator.
- It traces ideal mirror reflections into finite 1219.2 mm (48 in) cylinders.
- It models one uniformly tilted plane, not a measured sword cross-section.
- It treats the whole tube surface as emitting.
- It ignores finite camera aperture, equipment occlusion, roughness, Fresnel
  weighting, actual lamp emission patterns, and the blade's scattering properties.
- A dark footprint means no ideal reflected ray hits a modeled tube; it does
  not predict a black real photograph.
- It does not predict hamon or grain contrast.

The original mathematical and browser checks passed. Browser checks exercised
the initial display, matching-normal control, invalid inputs, narrow-screen
layout, and dark theme. The preview was visually inspected.

## Next measurements and continuation guidance

The user identified obtaining the blade cross-section/dimensions as the next step.
Useful inputs are:

1. Width and cross-sectional profile of a representative photographed section,
   including ridge/facet positions and any curvature.
2. How the blade rests relative to the table: local face slopes and the height
   of the photographed surface above the table. Dimensions alone do not establish
   the mounted orientation.
3. Tube diameter, actual emitting area, and emission direction.
4. Actual edge-to-tube-center offsets and table-to-tube-center heights.
5. Camera entrance-pupil height estimate, frame coverage, and exact lens model
   if refining off-center geometry or working distance.
6. Which visual features are the priority, and comparison photographs from the
   proposed one-light height sweep.

Prefer existing dimensions or non-contact observations where possible; do not
suggest measurement methods that could scratch the polished blade.

For the next response:

- Lead with actionable physical dimensions, with clear measurement endpoints.
- Use table-relative height and edge-relative offset for setup instructions.
- Keep calculated matches separate from experimental recommendations.
- Do not assume the two faces/facets need identical light positions.
- Do not promise that cross-section alone determines the best detail contrast.
- Preserve the low-angle arrangement as a valid comparison.
- Avoid repeating camera/stitching explanations unless they affect the geometry
  or the user specifically asks.

## Reference material

- [PBRT: Specular Reflection and Transmission](https://pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission)
- [PBRT: Roughness Using Microfacet Theory](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory)
- [KEYENCE: Lighting Selection](https://www.keyence.com/products/vision/resources/vision-resources/basics-of-lighting-selection.jsp)
- [Nikon Z5II Specifications](https://onlinemanual.nikonimglib.com/z5II/en/specifications_379.html)
- [OpenStax: Image Formation by Lenses](https://openstax.org/books/college-physics-2e/pages/25-6-image-formation-by-lenses)
- [Edmund Optics: Imaging System Parameter Calculator](https://www.edmundoptics.com/knowledge-center/tech-tools/imaging-system-parameter-calculator/)

The placement recommendations and numerical examples are calculations or proposed
experiments from this discussion, not source-prescribed nihonto lighting standards.
