# Nihonto Lighting Studio: Technical Choices

**Design and implementation notes | November 4, 2026**

Companion to the [product requirements](NIHONTO_STUDIO_PRD.md).
The application is implemented in [`studio`](../../studio/README.md). This
document describes the current architecture and invariants, with deferred work
and physical-calibration limits called out explicitly. Automated rendering
coverage is not a benchmark or validation against a measured real blade/fixture.

## Direction and decision status

The browser app is separate from `nihonto-lighting.html`, which remains an
unchanged geometric reference. A parameterized blade and procedural materials
are edited through the Nihonto Designer. The primary workflow configures a rig
once, locks it, and translates only the blade/table through a simulated scan.

## Implemented stack

| Layer | Choice | Rationale |
|---|---|---|
| Application | React, TypeScript, Vite | Structured controls, typed scene settings, and static deployment. |
| Scene representation | Three.js | Cameras, meshes, transforms, materials, and asset loading. |
| Rendering | WebGPU with `three-gpu-pathtracer` | Existing GPU path tracing and progressive refinement rather than a new engine from scratch. |
| Main viewport | One WebGPU-backed HTML canvas | Keep rendering, pixel-based diagnostics, and compositing on the GPU. |
| Interaction overlays | SVG and HTML layered over the canvas | Crisp measurements, labels, coverage guides, and handles. |
| Setup diagrams | SVG | Top and end-on positioning aids without another photorealistic viewport. |
| Spatial overview | Three.js WebGLRenderer and OrbitControls | Shaded, orbitable table/blade/camera/tube model driven by the same setup, separate from photographic light transport. |
| Saved setups | Versioned JSON, localStorage autosave, IndexedDB captures | Local persistence without a backend, with portable setup files and PNG previews. |
| Verification | Vitest and Playwright, plus numerical/render comparisons | Exercise optics, geometry, controls, persistence, and browser behavior. |

The renderer pins Three.js 0.186.1, `three-gpu-pathtracer` 0.0.27 and
`three-mesh-bvh` 0.9.15. `pathtracer.d.ts` declares only APIs used and verified in
that combination. Revalidate the integration when upgrading those dependencies.
GLB/glTF interchange remains deferred; JSON stores editable definitions and
material choices, not imported meshes.

## Canvas and rendering architecture

World X runs along the blade, Y across it and Z vertically. Settings use
millimeters; Three.js geometry uses meters. The stationary camera is above
world X=0, Y=0, looking down at the reference plane Z=0.

The top-view SVG in `TubeSpan` projects the actual X/Y coordinates of both tubes
and the blade; it never assigns sources to decorative fixed rows. Use one scale
for both axes, including tube length/diameter, the `bladeSection` silhouette and
the camera footprint at Z=0. Positive Y projects upward. Its camera origin is
fixed at (350, 140) in a 700 by 280 viewBox. Fit the full base-to-tip scan envelope
as well as the tube extents and camera footprint, keeping the scale unchanged
through ordinary scanning. Larger out-of-range translations may require refitting.
The blade outline includes its table X/Y offsets and curvature. A source may be
on either side, or both may be on the same side; names/colors are identities,
not positional constraints. Height is deliberately absent from this projection.

The end-on setup SVG uses a fixed bottom-center world origin at (230, 330) in a
460 by 432 viewBox. Fit scale derives from current camera height, tube bounds, and
blade extent, including tube portions below the blade plane. View-only zoom is
local UI state, not a physical or serialized camera setting. Pointer capture uses
a fixed projection until the selected handle approaches the diagram boundary.
Then reduce scale and rebase the drag's pointer/physical start together, so a
stationary pointer never introduces physical motion. Clip manual zoom at the SVG
boundary; Fit rig and selecting a cropped handle restore access.
Dimension and extension lines with arrowheads show all three heights and both
signed tube offsets in the current mm/in units. Reserve outer lanes for vertical
dimensions and two rows below the blade plane for offsets. There are no separate
position inputs or object-selector buttons. Focusable handles retain keyboard
adjustment and bring overlapping objects forward; a screen-reader readout reports
the focused object's position. Focal length and coverage remain visible below.

`RigOverviewScene` builds the shaded overview from the same `StudioState`, using
meters and the same `makeBlade` geometry. Blade and illustrative table/legs share
one translated group. Camera and finite tube meshes use the fixed-rig coordinates;
the coverage wireframe uses `fieldOfView`. Rebuild blade geometry only when its
definition changes, and dispose the replaced buffers. Table support follows the
blade's minimum Z. Table/camera-body dimensions and overview surface shading are
illustrative, not calibrated equipment or photometry.
`RigOverview` owns a separate viewing camera, OrbitControls and WebGL canvas.
Orbit/pan/zoom never write to `StudioState`. Initial/reset framing fits the current
rig's individual mesh bounds with a perspective-aware 88% limit on the constraining
viewport dimension. Do not frame the empty corners of one overall box or reserve
the entire scan travel. Adapt that fit to viewport resizing until the user adjusts the view;
ordinary rig/table movement does not refit or chase the table. Render on state,
view, theme or size changes, suspending redraws offscreen.
Release controls, observers, GPU resources and queued frames on cleanup, without
forcibly losing the canvas context that React Strict Mode or hot reload may reuse.

WebGPU provides GPU computation, not a complete ray tracer. The path tracer
performs light transport and intersection work using GPU shaders and acceleration
structures. Do not assume browser WebGPU exposes desktop RTX/DXR-style hardware
ray-tracing acceleration.

Maintain a serializable scene definition as the source of truth. React edits that
definition; the rendering integration updates camera, object transforms, materials,
or lights as appropriate. Do not run individual ray samples through React state.

Use the main canvas for the camera image and pixel-based overlays. Use SVG/HTML
for measurements and interaction. Display zoom remains separate from focal
length, camera height, and physical blade movement. The main canvas renders two
source-isolated copies of the physical scene, retaining both reflecting/occluding
tubes in each copy. Combine their scene-linear contribution buffers before
exposure and display mapping, rather than adding already-tone-mapped images.

A custom renderer is not part of the current implementation.

## Finite tube lights and hardware reference

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

Exact diffuser dimensions, angular emission and absolute calibration remain
unmeasured. An RGB approximation to 5600 K is not a measured LED spectrum.

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

Save definitions and material settings with setups. If GLB export is added later,
it should be a derived asset, not a replacement for the editable source definition.
The Designer manipulates the same parameters without changing the lighting workflow.

Use the downloaded museum photographs as appearance and proportion references,
not as relightable textures or calibrated material measurements. Do not paint
existing photographic highlights onto the simulated blade. Hamon fidelity remains
a separate modeling and validation problem.

Hada selection is stored separately as `blade.hada`, with Itame for new rigs and
None retained for legacy/missing values or explicit off settings. Both pickers
show generated ray-traced PNG swatches; see `scripts/render-hada-swatches.mjs`.
A deterministic millimeter-coordinate sampler supplies Itame warped grain,
Mokume nested cellular rings, Masame longitudinal layers, and irregular Ayasugi waves.
Domain warping, nested layers, intermittent chikei-like strands and sparse
ji-nie-like microfacets supply roughness, neutral metallic reflectance and submicron
normal maps. These are original material parameters, not photographed highlights.
Sample actual section width to maintain transverse scale through taper.
Generate 8187 x 512 samples; pack overlapping halves with gutters into 4096 x 1028
textures because the tracer's atlas caps dimensions at 4096. Split only UVs at the
blade midpoint, preserving computed geometry normals. Encode normal slopes at 32x
strength and undo with normalScale=1/32 to survive the atlas's RGBA8 quantization.
Derive encoded Z from quantized X/Y to keep the stored normals near unit length.
Suppress unresolved microfacet relief. Update both material atlases and dispose all
replaced maps. Grain-map replacement rebuilds scene bindings because adding maps
changes the shader texture-info array capacity; scalar roughness edits still use
the material-only update. Keep the uncalibrated treatment independent of historical attribution.
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

Convert UI mm/in values explicitly to the millimeter settings model and meter
geometry. Lens focal length stays in mm and the reference tape stays metric.
The Nikon Z5II sensor specification is fixed application metadata in `SENSOR`,
not a user-selectable sensor preset. `TUBE_FIXTURE` similarly holds the supplied
GVM reference, while diameter remains an editable approximation.

Define the camera's optical reference point and distinguish it from real-world
sensor-to-blade or lens-front distances. Thin-lens optics will not reproduce exact
focus breathing or close-focus behavior of an arbitrary real lens.

Accumulate scene-linear light, apply explicit exposure, then display tone mapping.
Keep fixed exposure as the default. Aperture exposure compensation, if enabled,
must be explicit. Evaluate aperture-dependent throughput separately from blur;
a renderer's depth-of-field support alone does not establish exposure correctness.

At fixed ISO 100, multiply throughput by shutter seconds times 125, preserving
the default 1/125-second reference. The former one-shot percentile meter and
its separate render target have been removed. Manual and Auto shutter are the
two exposure choices in the camera-adjacent strip; EV and compensation remain
explicit. This is relative simulation exposure, not absolute photometry.
ISO noise and motion blur are absent.

Auto shutter reads the full tracing resolution through a blade-depth-mask
composition into a dedicated FloatType target. It protects
the maximum RGB channel at 0.9, not a percentile. Solve shutter with the current
aperture gain, EV and source gains, within 1/8000-30 seconds. Gate on 32 stable
samples, run at most once per second, discard stale readbacks and ignore changes
within 0.02 stops. Manual shutter changes disable the mode. Lock pauses it and
cancels pending application; unlocking resumes the saved choice. Locking also
waits for a reading matching the current exposure-input signature, or the user
can explicitly switch to manual. Dark/empty views and limits have visible status.

## Analysis overlays

| Control | Current implementation |
|---|---|
| Inspect lighting | Select ordinary camera view, left-only, right-only or false-colored light contributions from the two linear buffers. This is not a traced-ray diagram. |
| Highlight clipping | Flag exposed linear channels >= 1 before Reinhard tone mapping; real sensor saturation remains uncalibrated. |
| Metric tape | SVG ruler above the blade, independent of lighting; the same layout is drawn into PNG exports. |

Clipping and metric tape are independent toggles; source modes are mutually exclusive.
Clean view selects the ordinary camera image and clears overlays without modifying
the simulation. Captures save the selected view and analysis state. The framing
grid is removed; legacy grid state is cleared on restore.

The image fills the scan column. A compact sticky panel above it holds shutter,
aperture, source brightness and inspection controls. Flexible control headings
align labels, sliders and toggles without requiring the shutter readout to be an
editable number field. Four control columns collapse to two below 500 px.

### Fixed-rig scan state and reference tape

Version-1 JSON adds `setupName`, `referenceTape`, and `scan` (start/end/step in mm,
lock state). Validate ranges against blade length; supply defaults for older files.
On load, disable legacy continuous light-following. Preserve the Auto shutter
choice, but do not execute it while locked. `updateRig` enforces
locked-state invariants centrally, not merely through disabled controls: only table
X, scan-plan parameters and display-only tape visibility change. Unlocking derives setup focus again.
Restoring a capture or importing a setup explicitly opens Edit rig.
`withCenteredTubes` normalizes both longitudinal tube offsets to X=0 during
preparation, updates and Auto placement, including restored legacy offsets.
The old X fields remain readable for file compatibility, but are no longer UI
controls. This normalization does not change table X/Y. Default table coordinates
are zero; scanning and transverse alignment remain explicit user operations.

Scan coordinates are measured from the base: viewed position is half blade length
minus table X. Calculate frame indices without allocating a frame array, include
the final partial step, and report minimum reference-plane overlap and any gap.
Rig-only restore retains the current blade and table coordinates.
The draggable navigator and numeric viewed-position field share the same position
handler; the redundant range slider is removed.

Both light cylinders have a 1200 mm modeled length along X and fixed centers at
X=0. Suggestions solve Y/Z against points on that finite span, not a point emitter.
There is no centering action and neither span follows scan translation.

Automatic placement runs in a worker. Sample 17 body and three kissaki positions
with the table translated independently under the fixed camera. At each position,
sample eight transverse bands spanning the cutting edge, ha, hamon, ji and shinogi.
Use interpolated mesh normals and the same base-polish formula that generates the
roughness texture. The finite-strip model uses a projected GGX marginal rather
than a heavier-tailed Cauchy approximation, with conservative grain-roughness and
normal-variation bounds. This remains an approximation, not the GPU tracer.

Candidate centers are capped at camera height minus tube radius, also respecting
rig bounds, tube separation and clear camera/pupil paths. Retain candidates serving
difficult regions. Rank pairs by weakest transverse-region and scan-section
coverage, minimum ha/ji coverage at every scan position, dynamic range and signed
contrast response. Reassess the top 64 camera-clear pairs with per-sample
inter-tube visibility and relative powers down to 10%, keeping at least one
enabled source at full reference power before exposure headroom scaling.
Auto never uses the manual 100-200% boost range. At extreme EV/aperture settings,
reduce both powers if their conservative radiance bound could clip even at the
shortest shutter. `TUBE_RADIANCE` is shared with emitter construction.
An occluded source/target path contributes zero at that sample; it does not reject
the entire pair. Rejecting every such pair incorrectly excludes complementary
body/kissaki lighting when a source is shadowed only in a region it does not serve.

Preserve fixed-origin centers and on/off states, but brightness may change and
enabled zero-brightness sources may be raised. Application of a successful
suggestion enables Auto shutter to meter the real result. No light follows later
table movement, and locking freezes exposure as well. Source positions/powers
cannot be applied after concurrent setup edits. Report weak predicted coverage or
no feasible below-camera solution explicitly instead of raising tubes above the
ceiling or claiming uniform illumination.

The metric tape is an SVG overlay, not scene geometry. `metricTapeLayout` projects
the old blade-facing datum at Z=0, 3 mm beyond maximum spine Y, and positions the
bar above it. Both generated blade profiles reach maximum spine Y at the base;
the shared `bladeSection` function supplies that coordinate. Keep the bar and its
caption inside the image when the datum is outside the frame.
Ticks follow table X and physical camera coverage; transverse table movement
updates vertical placement. Use zero at the blade base, centimeter labels and
zoom-adaptive tick density. `drawMetricTape` uses the same layout and scales logical
pixels to the captured render dimensions. Its brightness is independent of
exposure, and it never participates in metering or resets ray accumulation.
Visibility is serialized and editable while locked. The physical tape mesh and
Include tape in frame action are removed. Neither the overlay nor scan overlap
is a calibrated measurement at raised blade features.

Per-light buffers implement immediate brightness/on-off adjustments without
resampling when geometry, materials and light emission patterns are unchanged.
Shutter, EV and aperture-throughput changes also recompose those same buffers.
Moving lights or the blade invalidates accumulation. The current environment is
black; a non-tube environment contribution would require separate accounting.

## Photographic references

The exact-blade collection is separate from the Met study gallery.
`public/blade-references/manifest.json` maps the ten historical preset names to
source files, published lengths, reviewed approximate base/tip endpoints, crop
bounds, orientation, checksums and user-confirmed reuse permission. Original
images remain unchanged and accessible through More. The automatic enlarged
comparison panel and transform code are removed because source detail, especially
for Ayanokoji and Tametsugu, cannot support meaningful camera-sized detail crops.
Calibration metadata is retained for provenance, not used for live registration.
Perspective, relief and endpoint uncertainty remain uncalibrated. Reference imagery
is never placed into the blade material or simulation PNG.

The Met collection retains ten object records with three additional Gassan
images verified against the museum API's public-domain flag. Its in-app viewer
supports original-resolution inspection, zoom/pan, alternative views and museum/
CC0 links. It does not claim that a museum specimen is one of the dealer presets.

## Interaction, refinement, and image integrity

Continue ray tracing during interaction at reduced resolution and sample count.
Refine when stationary. Reset invalid accumulation after scene changes so the
image does not retain reflections from a previous setup.

The implementation uses a 131072 frame budget per tracer, six scattering events,
and no denoiser, glossy filter or highlight clamp. For 400 ms after a scene/quality
change, interaction rendering is capped at 360 pixels wide. At rest, Fast preview
caps width at 480, Balanced at 1200, and Fine detail uses 1200-2400 pixels, with
device pixel ratio honored up to 2x. Resolution changes invalidate accumulation
and asynchronous progress readbacks.

Captures temporarily composite at the actual tracing dimensions, copy the image,
and restore the display drawing buffer. They do not wait for the sample target.
These are simulated previews, not native 6048 x 4032 Nikon files. Future denoising
or filtering must be evaluated for lost fine detail and biased highlight
measurements, rather than silently replacing the raw lighting response.

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

## Verification and remaining validation

The repository includes Vitest numerical/state tests and Playwright coverage
using installed Edge with real WebGPU. Layout/error-path tests can deliberately
disable WebGPU; rendering tests must exercise the tracer rather than skip or
substitute rasterized results.

| Area | Coverage |
|---|---|
| Geometry/materials | Dimensions, curvature, normals, deterministic grain, packed UV/texture seams and quantization-safe normal slopes. |
| Emitters and Auto | Finite tube intersections, outward-facing area panels, source power, current-position independence and explicit unavailable solutions. |
| Fixed scan and controls | Lock enforcement, start/end/step behavior, quick-control synchronization, persistence and capture restoration. |
| Top view and setup | Actual X/Y offsets, equal scale, same-side/opposite-side arrangements, stable tubes/camera across scanning, dragging and responsive layout. |
| Shaded overview | Shared blade geometry, table/blade grouping, fixed camera/tubes during scans, footprint updates, source state, independent orbiting and resource disposal. |
| Real GPU output | Independent source contributions, grain at base/middle/kissaki under one rig, fine-detail capture resolution, shutter/aperture/brightness recomposition and an exposure-independent metric overlay in PNG captures. |

These are software regressions, not measured photometric accuracy or universal
performance guarantees. Remaining work includes comparison against known real
fixture emission and camera response, measured blade geometry/polish, and a
repeatable performance benchmark on agreed hardware. GLB/glTF interchange and
directional/spectral material extensions are future options, not shipped features.

## Sources reviewed

Upstream documentation reviewed November 3, 2026; these links may evolve.

- [three-gpu-pathtracer overview and limitations](https://github.com/gkjohnson/three-gpu-pathtracer)
- [WebGPU path-tracer API](https://github.com/gkjohnson/three-gpu-pathtracer/blob/main/src/webgpu/API.md)
- [MDN: WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU specification](https://gpuweb.github.io/gpuweb/)
