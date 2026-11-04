# Nihonto Lighting Studio: Technical Choices

**Design proposal | November 3, 2026**

Companion to the [product requirements](NIHONTO_STUDIO_PRD.md).
This document records the recommended technologies and their evaluation gates;
it does not imply that the renderer has been implemented or benchmarked.

**Implementation update:** the initial browser app now lives in
[`studio`](../../studio/README.md), using the pinned WebGPU renderer and two
independent light-contribution buffers. Its README documents the implemented
behavior and remaining limitations; the proposals below retain their evaluation
status unless explicitly implemented there.

## Direction and decision status

Browser-based delivery is preferred. The parameterized 3D blade is the selected
modeling direction, now exposed through a dedicated live Designer.

Recommend building a new app alongside `nihonto-lighting.html`, retaining the
existing calculator as a geometric reference. The stack below is recommended,
but adoption of the path-tracing library depends on a focused rendering prototype.

## Recommended stack

| Layer | Choice | Rationale |
|---|---|---|
| Application | React, TypeScript, Vite | Structured controls, typed scene settings, and static deployment. |
| Scene representation | Three.js | Cameras, meshes, transforms, materials, and asset loading. |
| Rendering | WebGPU with `three-gpu-pathtracer` | Existing GPU path tracing and progressive refinement rather than a new engine from scratch. |
| Main viewport | One WebGPU-backed HTML canvas | Keep rendering, pixel-based diagnostics, and compositing on the GPU. |
| Interaction overlays | SVG and HTML layered over the canvas | Crisp measurements, labels, framing guides, and handles. |
| Setup diagrams | SVG | Top and end-on positioning aids without another photorealistic viewport. |
| Model interchange | GLB/glTF and material maps | Portable derived geometry and imported assets. |
| Saved setups | Versioned JSON; IndexedDB for local collections | Local persistence without a backend, with portable setup files. |
| Verification | Vitest and Playwright, plus numerical/render comparisons | Exercise optics, geometry, controls, persistence, and browser behavior. |

Pin a tested combination of Three.js, the path tracer, and its dependencies.
Current upstream documentation describes WebGPU support; confirm the selected
release or revision includes the required APIs before implementation.

## Canvas and rendering architecture

The end-on setup SVG uses a fixed bottom-center world origin at (230, 330) in a
460 by 380 viewBox. Fit scale derives from current camera height, tube bounds, and
blade extent, including tube portions below the blade plane. View-only zoom is
local UI state, not a physical or serialized camera setting. Pointer capture uses
a fixed projection until the selected handle approaches the diagram boundary.
Then reduce scale and rebase the drag's pointer/physical start together, so a
stationary pointer never introduces physical motion. Clip manual zoom at the SVG
boundary; Fit rig and selecting a cropped handle restore access.

WebGPU provides GPU computation, not a complete ray tracer. The path tracer
performs light transport and intersection work using GPU shaders and acceleration
structures. Do not assume browser WebGPU exposes desktop RTX/DXR-style hardware
ray-tracing acceleration.

Maintain a serializable scene definition as the source of truth. React edits that
definition; the rendering integration updates camera, object transforms, materials,
or lights as appropriate. Do not run individual ray samples through React state.

Use the main canvas for the camera image and pixel-based overlays. Use SVG/HTML
for measurements and interaction. Display zoom must remain separate from focal
length, camera height, and physical blade movement.

An eventual custom renderer is a contingency, not the starting plan. First
evaluate whether the existing library can satisfy the requirements with a bounded
extension.

## Critical evaluation gate: finite tube lights

Represent both tubes as finite emitting cylinders, each 1200 mm long, with
explicit diameter, position, brightness, and independent enabled state.
Their target color temperature is 5600 K.

The pinned tracer does not importance-sample emissive mesh triangles. Represent
each physical cylinder's 48 facets with matching outward-facing analytic area-light
panels, plus circular caps. They participate in next-event sampling and MIS.
The cylinder remains reflecting/occluding but is not also emissive. Panels are
displaced 2 micrometers from its facets to avoid self-intersection; the full finite
length remains 1200 mm. This is a faceted-cylinder emitter, not a point or one
rectangular replacement source. A six-bounce budget retains indirect transport.

Tube diameter, angular emission profile, brightness units, and calibration remain
open. An RGB approximation to 5600 K is not a measured LED spectrum.

The supplied GVM-PRO-BD45R housing is 50 x 46 x 1200 mm. Use the housing length
and a default 46 mm circular cross-section as an explicitly approximate emitter;
preserve imported custom diameters and offer an explicit size-reset action.
The stated 750 lux at 1 m and 2180 lux at 0.5 m are illuminance, not lumens or
enough information to reconstruct angular emission. Record 45 W electrical input,
660 LEDs, CRI >= 97 and 2700-10000 K as hardware specifications, not calibrated
renderer parameters. See the app README for the full supplied fixture reference.

The camera reference is Nikon Z5II FX BSI-CMOS, 35.9 x 23.9 mm, 24.5 effective MP,
6048 x 4032 native pixels. Physical sensor dimensions govern projection; sensor
resolution does not force the progressive preview to allocate a 24 MP target.
Camera-adjacent quick controls share the existing camera/source settings and
lock guard. Shutter uses ordered photographic speeds across the existing range,
with logarithmic nearest-step selection for imported or metered shutter values;
rendering and persistence retain the exact value until the user moves the slider.

## Parameterized blade

Generate geometry from a physical blade definition through presets and the Model
editor. An optional version-1 profile adds explicit yokote width, base/yokote kasane,
curvature peak, kissaki type, fukura, and niku to the original dimensions. Absent
profiles retain legacy parameterization until first edit. Both paths bend toward
the cutting edge (-Y), placing the edge on the convex, larger-radius side and the
mune on the inner side. This corrects the previously reversed curvature without
changing serialized dimensions. Modern nagasa spans
100-1200 mm; kissaki spans 5-min(300, nagasa-20) mm. Relational validation enforces
yokote width <= base width and yokote kasane <= base kasane <= shinogi thickness.

Sori is piecewise quadratic with a selectable peak and equals maximum spine offset
from the base-to-tip chord. Sample the peak and yokote explicitly. Generate separate
facet/body/tip patches for creases and smooth subdivided niku bevels; omit degenerate
terminal triangles. Angle edits update the underlying thicknesses. Shared section
helpers feed SVG previews, setup cross-sections and navigation; the reflection
solver continues to use the actual generated mesh.

Ten historical definitions reproduce source-published dimensions with explicit
estimates for missing parameters. Source URLs, reported Juyo sessions, measurements
and caveats live in `studio/src/historical-presets.ts` and appear in the editor.
They are not scans. Flat mune, no grooves, tang, or fittings remain limitations.

Keep three concerns separate:

- **Definition:** physical dimensions, shape parameters, and schema version.
- **Derived geometry:** mesh topology, normals, and rendering detail level.
- **Appearance:** metal response, polish, roughness, fine normal variation, and
  any hamon-related material parameters.

Preserve facet boundaries and surface-normal behavior: these determine reflection
placement. Evaluate whether directional polishing requires an anisotropic material
extension rather than assuming ordinary roughness is sufficient.

Save definitions and material settings with setups. GLB exports are derived assets,
not replacements for the editable source definition. The Model editor manipulates
the same parameters without changing the lighting workflow.

Use the downloaded museum photographs as appearance and proportion references,
not as relightable textures or calibrated material measurements. Do not paint
existing photographic highlights onto the simulated blade. Hamon fidelity remains
a separate modeling and validation problem.

Hada selection is stored separately as `blade.hada`, with None as the legacy/default
value. A deterministic millimeter-coordinate sampler supplies Itame warped grain,
Mokume nested cellular rings, Masame longitudinal lines, and Ayasugi periodic arches.
Domain warping, nested layers, intermittent chikei-like strands and sparse
ji-nie-like microfacets supply roughness, neutral metallic reflectance and submicron
normal maps. These are original material parameters, not photographed highlights.
Sample actual section width to maintain transverse scale through taper.
Generate 8187 x 512 samples; pack overlapping halves with gutters into 4096 x 1028
textures because the tracer's atlas caps dimensions at 4096. Split only UVs at the
blade midpoint, preserving computed geometry normals. Encode normal slopes at 32x
strength and undo with normalScale=1/32 to survive the atlas's RGBA8 quantization.
Suppress unresolved microfacet relief. Update both material atlases and dispose all
replaced maps. Keep the uncalibrated treatment independent of historical attribution.
The Designer links documented Juyo/Tokubetsu Juyo examples without redistributing
their photographs.

Fine detail defaults to 1200-2400 horizontal pixels and 4096 samples/source;
Balanced and Fast preview cap samples at 1024 and 256 respectively. Export the
actual tracing dimensions, not CSS display dimensions. Save the current sample
count honestly; do not imply an early capture has fully converged.

## Camera, units, and exposure

Use thin-lens projection with zero bokeh size for an always-sharp lighting preview.
Support 20-135 mm focal lengths, f/1.2-f/11 aperture throughput, camera height, and
blade translation. Derive ridge focus during setup, but freeze all camera
parameters when the rig is locked. Do not simulate depth-of-field blur or expose
manual focus controls. This intentionally supersedes the earlier sampled-aperture
design; the result is not a real-camera sharpness prediction.

The coverage-per-frame control derives its readout from the existing camera
projection rather than storing a second coverage value. Invert the focused
thin-lens equation to solve camera height while focusing on the local blade ridge.
Preserve focal length if possible; at travel limits solve for focal length instead,
bounded to 20-135 mm. Report unreachable targets explicitly. Keep aperture/exposure
and blade position intact. It follows the rig/scan mm/in preference. Suggestions
are explicit one-shot actions, not part of state updates. Whole-blade-shot
reconfiguration uses this solver with centered geometry, a 35 mm preferred lens
and a 15% margin, including tape extents.

Establish one internal physical-unit convention and explicitly convert UI units.
Keep sensor dimensions configurable; Nikon Z5II FX dimensions are the proposed
starting point inherited from the current calculator.

Define the camera's optical reference point and distinguish it from real-world
sensor-to-blade or lens-front distances. Thin-lens optics will not reproduce exact
focus breathing or close-focus behavior of an arbitrary real lens.

Accumulate scene-linear light, apply explicit exposure, then display tone mapping.
Keep fixed exposure as the default. Aperture exposure compensation, if enabled,
must be explicit. Evaluate aperture-dependent throughput separately from blur;
a renderer's depth-of-field support alone does not establish exposure correctness.

At fixed ISO 100, multiply throughput by shutter seconds times 125, preserving old
renders at the default 1/125 second. One-shot metering renders combined
linear source radiance to a 256 x 170 FloatType target with a blade-depth alpha mask.
Read back asynchronously after at least eight samples; a revision token rejects
stale results. Meter before exposure/tone mapping
and independently of source-isolation or diagnostics. Use the 70th-percentile
luminance target 0.45 and 99th-percentile channel limit 0.95; sub-percentile glints
may clip. Limit each shutter adjustment to one stop, with a 0.08-stop deadband that
does not override highlight protection. Bound shutter to 1/8000-30 seconds.

The solver iterates against the same unexposed readback until settled.
The UI resets EV bias and disables aperture compensation when applying metering; aperture
and lights stay fixed. EV remains a post-meter user bias. Fewer than 32 blade pixels,
darkness, and shutter limits have explicit status messages; dark/off-frame metering
does not change shutter. No continuous metering runs during scan movement. This is relative
simulation exposure, not absolute photometry; ISO noise and motion blur are absent.

## Analysis overlays

| Overlay | Proposed implementation |
|---|---|
| Per-light contribution | Separate scene-linear contribution buffers, or separate evaluation passes if the renderer cannot produce these directly. |
| Highlight clipping | Compare exposed linear values with an explicit saturation threshold before tone mapping; real sensor calibration remains separate. |
| Framing and scale | Camera projection and known scene units, displayed as SVG guides. |

These are application requirements, not assumed built-in library features.
Overlays must reflect the current scene and remain independently toggleable.
Clean view hides overlays without modifying the simulation.

### Fixed-rig scan state and reference tape

Version-1 JSON adds `setupName`, `referenceTape`, and `scan` (start/end/step in mm,
lock state). Validate ranges against blade length; supply defaults for older files.
On load, disable legacy continuous-lighting/exposure flags. `updateRig` enforces
locked-state invariants centrally, not merely through disabled controls: only table
X and scan-plan parameters change. Unlocking derives setup focus again.
Restoring a capture or importing a setup explicitly opens Edit rig.

Scan coordinates are measured from the base: viewed position is half blade length
minus table X. Calculate frame indices without allocating a frame array, include
the final partial step, and report minimum reference-plane overlap and any gap.
Rig-only restore retains the current blade and table coordinates.

Both light cylinders have a 1200 mm modeled length along X. Suggestions
preserve their longitudinal centers and solve Y/Z against points on their finite
span, not a point emitter at the tube center. An explicit setup action can center
both spans on the current blade center; neither span follows scan translation.

Automatic placement samples 17 body positions and three kissaki positions with
the table translated independently to center each under the fixed camera. Evaluate
both source candidates jointly using finite-strip microfacet response estimates.
Prioritize weakest-section area-weighted coverage, then average coverage and grain
contrast; combine signed normal/polish sensitivities so cancellation is represented.
Weight responses by actual source brightness and enabled state, matching the
compositor; a dark tube still occludes but contributes no illumination.
Use conservative coverage across the average and low-roughness grain responses
with positive/negative normal perturbations, rather than only the average lobe.
Keep candidates for difficult regions when shortlisting. Sources may serve the same
facet at different scan positions rather than one source being assigned permanently
to each facet. Keep longitudinal position, brightness, on/off, camera and exposure
unchanged. Report weak predicted coverage instead of claiming uniform illumination.

The metric tape is a diffuse 20 mm-wide plane at Z=0, 3 mm beyond maximum spine Y.
It shares the blade's table translation in both traced scenes and uses a 4096 by
128 sRGB yellow/black texture with 1 mm ticks, 5 mm intermediate ticks and numbered
centimeters from the base. Rebuild/dispose geometry and texture when the blade
changes. Tape visibility is serialized; the blade-depth metering mask excludes it.
Actual image captures include the tape, unlike SVG guides. Surface relief causes
small parallax; neither tape nor scan overlap is calibrated at the raised ridge.
Include tape in frame restores visibility and transverse framing while preserving
scan position and tube positions. It is an explicit setup action, not scan-time
automation. Tape brightness remains governed by physical illumination and exposure.

Per-light buffers could also allow fast brightness adjustments: with geometry,
materials, and light emission patterns unchanged, scale and combine linear
contributions before exposure and tone mapping. Preserve any non-tube contribution
separately. Moving lights or the blade invalidates this reuse.

## Interaction, refinement, and image integrity

Continue ray tracing during interaction at reduced resolution and sample count.
Refine when stationary. Reset invalid accumulation after scene changes so the
image does not retain reflections from a previous setup.

Evaluate the library's adaptive frame budgets, resolution controls, and optional
denoising/upscaling integration. Keep a raw accumulated view available: denoising,
reflection filtering, sharpening, and sample clamping can obscure fine details
or bias highlight measurements. Diagnostics should not depend on a cosmetically
processed image.

Measure interaction latency, preview resolution, and time to a usable image, not
just frame rate. The PRD's provisional targets are feedback within 100 ms and
at least 20 fps during adjustment on agreed reference hardware. They are not
verified performance claims.

## Browser support and deployment

Start with desktop Chrome and Edge on Windows. Detect WebGPU and required device
capabilities at runtime, report unsupported configurations clearly, and handle
GPU device loss explicitly. Validate other browsers separately.

Deploy as static assets over HTTPS, or serve locally on localhost. No rendering
server, account, or image upload is required. Serve assets from the app's origin
where practical; retain source and license metadata for reference assets.

Do not present a rasterized fallback as ray tracing. The existing geometric
calculator can remain available as an explicitly different fallback tool.

## First technical milestone and adoption criteria

Build one curved, faceted parameterized blade, two movable finite tubes, a
thin-lens camera, and a per-light diagnostic view before building the full UI.

Evaluate:

1. Reflection locations against known mirror geometries and the existing calculator.
2. Tube reflection shape and convergence across mirror-like and rougher materials.
3. Camera framing, focus, aperture behavior, and translation in physical units.
4. Responsiveness while moving the blade and lights, including acceleration-
   structure update costs.
5. Access to the linear data needed for overlays and unbiased comparisons.
6. Raw versus denoised fine-detail preservation.

Adopt the library if it meets these needs; use a bounded extension for missing
sampling or diagnostics where practical. Consider a specialized WebGPU renderer
only if those gaps cannot be addressed reliably. Visual plausibility alone is
not sufficient evidence of physical accuracy.

## Sources reviewed

Upstream documentation reviewed November 3, 2026; these links may evolve.

- [three-gpu-pathtracer overview and limitations](https://github.com/gkjohnson/three-gpu-pathtracer)
- [WebGPU path-tracer API](https://github.com/gkjohnson/three-gpu-pathtracer/blob/main/src/webgpu/API.md)
- [MDN: WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU specification](https://gpuweb.github.io/gpuweb/)
