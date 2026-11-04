# Nihonto Lighting Studio

A browser-based lighting workbench for a parameterized Japanese sword blade.
It is a separate application; the offline calculator in
[`docs/lighting`](../docs/lighting/nihonto-lighting.html) remains unchanged.

## Run

Use Node.js 24 LTS and a current desktop Chrome or Edge with WebGPU and hardware
acceleration enabled. Serve over localhost or HTTPS, not by opening `index.html`
directly.

```powershell
cd studio
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Initial GPU shader compilation can take a moment.
Unsupported GPUs produce an explicit message, not a rasterized substitute.
`npm run dev` is a long-running preview server: Vite's **ready** message means
startup completed; the process intentionally stays running. Keep it running
while using the app, and use Ctrl+C in its terminal when finished.

```powershell
npm test
npm run lint
npm run build
npm run test:browser
```

The browser suite uses the installed Microsoft Edge channel. Its headless launch
enables WebGPU; rendering tests do not mock the renderer. Layout and input tests
also cover operation without a GPU. The GPU test must pass, not skip,
when verifying rendering. `test-results` contains captured screenshots and failure
traces. Hardware/driver support is still required.

`npm run build` creates `dist`; deploy that directory to a static HTTPS host.
The relative asset base supports subfolder hosting. No application server,
account, or cloud rendering service is needed.

## Workflow

**Set up the fixed rig → Preview the scan → Save the rig.**

- Choose a blade preset, then use **Edit model...** for dimensions, historical
  provenance, hada and polish. Three generic shapes and ten source-reported Juyo
  approximations remain available. Missing historical geometry is explicitly
  estimated; edits retain provenance. Hada supports Itame, Mokume, Masame, Ayasugi
  and None, independently of hamon and dimensions.
  **Rendered hada** is also directly available in Blade model. Both pickers show
  original ray-traced steel swatches and support keyboard selection. New rigs use
  Itame; saved/legacy None settings are preserved and visibly identified as off.
- In **Fixed rig**, move the camera or either tube directly in the end-on diagram.
  Camera height and both tube heights/offsets appear as dimension lines with
  extension lines and arrowheads. The separate position fields and object-selector
  buttons are removed. Focal length and coverage controls stay below the diagram.
  Exposure and source power have one home above the camera image, not duplicate
  controls in the inspector.
  Drag handles or use arrows (1 mm; Shift: 10 mm). Offsets use the stationary
  camera origin. Dimensions follow the mm/in preference; keyboard steps remain mm.
- **3D rig overview**, below Scan preview, shows the table, nihonto, camera and both
  tubes together. Table and blade translate as one group; camera and source
  positions update from the same settings. The blade uses the same generated
  geometry, and the camera outline uses the same field of view. Drag to orbit,
  right-drag to pan, scroll to zoom, or use **Reset 3D view**. These view changes
  never move the photographic camera or alter the saved rig.
  Initial/reset framing fits the current rig closely with a small margin rather
  than reserving empty space for the entire scan. Moving the table does not
  automatically recenter or zoom the overview.
  This is a shaded WebGL spatial guide, not another lighting simulation. Table
  and camera-body shapes are illustrative rather than measured hardware models.
  It redraws on demand and pauses drawing when offscreen.
- Both emitters are finite **1200 mm cylinders along X**, not point
  lights. The top view uses actual X/Y coordinates and one physical scale for
  tube length/diameter, the blade silhouette and camera footprint at Z=0.
  X runs horizontally along the blade and positive Y points up. In the end-on
  diagram, Y runs horizontally and height runs vertically. Opposite-side or
  same-side placements match the same rig settings; Left/Right identify sources,
  not enforced sides. Its fixed-origin framing reserves the full base-to-tip
  scan envelope so ordinary scanning does not move or rescale the tubes.
  Both tube centers are always X=0 at the fixed rig origin. Old saved longitudinal
  offsets are normalized on load/update; table movement never moves the tubes.
  There is no centering action or along-blade tube offset control. The table
  defaults to X/Y=0 but remains movable for scanning and transverse alignment.
- **Exposure & light** stays directly above the camera image: shutter speed,
  aperture, and both tube brightness sliders share the rig settings. Shutter uses
  photographic steps from 1/8000 s to 30 s; exact metered/imported values are
  retained until the slider is moved. Exposure bias and source on/off controls
  are in the same strip. The persistent readout shows
  shutter, aperture, ISO 100 and EV. Aperture compensation is explicit and can be
  toggled here. All these controls are disabled during a locked scan.
  **Auto shutter** adjusts the shutter to keep the brightest rendered blade
  highlight at 90% of clipping, accounting for both tubes, aperture, compensation
  and EV. It waits for 32 stable samples and updates during setup, even when
  accumulation is paused. Manual shutter edits turn it off. Lock rig freezes the
  last exposure; unlocking resumes Auto if selected. Auto shutter replaces the
  former Meter once action; there is no second metering workflow.
- **Suggest light positions** searches one fixed rig across the entire blade,
  including the kissaki, prioritizing coverage and grain contrast. It keeps the
  entire tubes at or below camera height, balances enabled-source brightness
  within 100%, and enables Auto shutter for highlight protection. On/off states
  are preserved and longitudinal centers stay at X=0; later camera/model edits do not move
  the tubes automatically. Locking waits for placement and a current Auto shutter
  reading, or Auto can be turned off to lock a deliberately manual exposure.
- Camera **Coverage per frame** changes height and automatic focus, adjusting the
  lens only at travel limits. It follows the rig/scan mm/in preference; lens focal
  length remains mm. **More → Reconfigure for whole-blade shot** intentionally
  selects 35 mm and centers the blade with a 15% margin.
  Use the navigator for a whole-blade overview without changing optics.
- The image is **always sharp**. Manual focus, click-to-focus and focus diagnostics
  are removed. Setup optics use automatic ridge focus; depth-of-field blur is
  disabled. Aperture still controls throughput, unless explicitly compensated.
  This preview does not predict real-camera depth of field.
- **Lock rig / Preview scan** freezes camera projection, focus, exposure, tube
  XYZ/brightness/on-off, model and transverse alignment. Along-blade table
  movement, scan-plan parameters and display overlays remain editable. Use **Edit rig** to
  change the setup. The navigator window denotes the viewed section, not a moving
  camera. Drag the navigator, type the viewed position, use left/right arrows,
  or step between frames; there is no duplicate position range slider.
- Scan start/end and step are measured from the blade base. The plan includes a
  final shorter step where necessary, reports frame count and minimum overlap,
  and warns about gaps. Overlap is calculated at the blade reference plane.
  No motor/camera control or stitching is performed.
- **Metric tape** toggles a bright yellow overlay above the blade. Its blade-facing
  edge projects the old ruler datum, 3 mm beyond the maximum spine extent; the bar
  and caption stay inside the image if that datum moves outside the frame.
  Zero is at the blade base, labels are centimeters, and tick density adapts to
  coverage. It remains metric in inch mode and is drawn into saved PNGs.
  It is independent of lighting/exposure, not traced geometry or a metering target.
- **Zoom +/−** and **Fit rig** affect only the setup diagram, keeping its bottom
  center fixed. Edge-aware drag zoom-out avoids position jumps. Selecting a
  cropped handle restores visibility. Narrow screens stack panels.
- Historical presets offer **More → Original blade photograph**, without an
  enlarged comparison panel. **Met study references** opens a separate
  full-resolution museum zoom viewer.
- The image fills the scan column. A compact pinned panel holds aligned shutter,
  aperture and brightness controls in four columns, or two on narrow screens.
  **Clipping**, **Inspect lighting** and **Metric tape** sit above the image.
  The framing grid and image badges are removed; **Clean view** is in More.
  Quality/sample/FPS controls are under Rendering details. The remaining advanced
  rig section holds linked placement, emitter diameter and transverse table
  alignment. Full Nikon/GVM
  specifications are in **More → Help**. The redundant Advanced Camera/Tube sections
  and Center blade action are removed.
- **Save preview** adds a thumbnail without opening a modal or invoking a physical
  camera. Comparisons groups lighting experiments separately from locked-rig scan
  positions. **Restore full setup** restores the table too; **Restore rig only**
  preserves the current blade and scan position. Both open Edit rig. PNG/JSON
  export and individual deletion remain available. Name and save the setup in
  the header; load, references, theme, reset and help are in More.

Current settings autosave to localStorage. Captures and settings are stored in
IndexedDB on the current browser origin. Clearing browser data deletes those local
copies; export important experiments. An invalid imported setup is rejected without
replacing the scene.

## Automatic light positioning

The solver samples the actual mesh and interpolated shading normals at 17 body
positions and three kissaki positions, with eight transverse bands spanning the
cutting edge, ha, hamon, ji and shinogi. It simulates each being translated under
the stationary camera. The current scan position does not change the suggestion.
Candidates cover multiple heights and both sides of the reflected-ray/tube edge.
Both tubes are optimized jointly: they need not illuminate separate facets or sit
on opposite sides of the blade.

A finite-strip GGX approximation predicts illumination and sensitivity to
normal and polish changes, using the renderer's shared base-polish formula.
It accounts for the much narrower reflection lobes of polished regions rather
than treating the user roughness setting as the finished surface roughness.
The search prioritizes the weakest transverse region and weakest scan section,
with explicit protection for the ha and grain-bearing ji at each scan position,
then overall coverage, dynamic range and grain contrast. Conservative grain
roughness and normal variation reduce edge-only solutions. Opposing contrast
responses are weighted by each tube's
actual brightness and on/off state and can cancel rather than being counted
twice. Candidate shortlists retain
solutions for difficult sections, including the kissaki. This is a bounded physical
heuristic, not a guarantee of the global optimum or a measured camera prediction.

Candidates must fit the rig's XYZ limits, keep their top surface no higher than
the camera optical center, and clear the blade, the camera pupil, the
other tube and target-to-camera rays. Inter-tube shadows are accounted for per
surface sample: an occluded contribution is removed, not an entire complementary
rig just because one tube cannot illuminate a region served by the other.
The tubes retain their 1200 mm length, diameter, fixed-origin centers and enabled
states. The best feasible pairs are also assessed at different relative powers,
reducing bright-source dominance rather than placing a source above the camera.
Auto does not use the manual 100-200% simulation-boost range. At extreme exposure
settings it can reduce both powers further to retain headroom at the shortest
available shutter; actual highlight protection then comes from the GPU meter.
If a clear full-blade rig cannot be found, the app retains the previous positions
and warns. A feasible rig with weak predicted facets also reports that limitation.
With both tubes disabled, placement reports that a light must be enabled.
An enabled source at zero brightness may be raised by Auto; use its on/off
checkbox to keep it disabled.
The search runs in a worker so the UI remains responsive. Its coverage and
uniformity values are heuristic diagnostics, not measured percentages of usable
image area. A saved 25 mm emitter is not silently treated as a 46 mm GVM emitter:
the prominent size warning and explicit correction action address that mismatch.

Inspect base, middle and tip with the same exposure before accepting the rig.
Equal exposure does not imply equal brightness: a polished facet must reflect a
tube toward the camera. The kissaki changes slopes at the yokote, and curvature,
taper and camera direction also affect the ordinary body. Neither the tubes nor
exposure follow scan movement. Real polish, light output and camera response still
need calibration.
Legacy continuous light-following is disabled on load. The Auto shutter choice
persists but never runs while the rig is locked. Scan range/step/lock, setup name
and tape state persist in JSON and captures.
Missing fields in older files receive compatible defaults. Old focus distances
are corrected when opening an unlocked setup; old saved image bytes are retained.

## Implementation

React/TypeScript/Vite drive the UI. Three.js represents the scene.
`three-gpu-pathtracer` 0.0.27 supplies the WebGPU progressive tracer.
The package's WebGPU entry point lacks TypeScript declarations; the small local
declaration file describes only APIs verified in the pinned package.

The renderer traces two copies of the same physical scene, each with one emitting
tube. The other tube remains present as a non-emitting, reflecting/occluding object.
Two linear contribution buffers are combined before exposure and tone mapping.
This permits source isolation and immediate brightness/on-off changes without
resetting accumulation. Movement, projection, or material changes invalidate
the relevant samples. Aperture changes throughput only and can reuse samples.
Each tube's 48 cylinder facets have matching analytic rectangular emitters, plus
two circular end emitters, enabling next-event sampling and MIS. The physical
cylinder still reflects and occludes, but has no duplicate mesh emission. Panels
sit 2 micrometers outside the facets to avoid self-intersection. They preserve the
1200 mm span rather than replacing the tube with a point or a single flat panel.

Geometry uses meters internally; settings and optical calculations use millimeters.
The generated mesh retains separate facet normals. The optional versioned `profile`
adds explicit base/yokote dimensions, curvature distribution, a pointed kissaki,
and smooth niku bevel patches. Existing setups without it retain their legacy
parameterization until first edited. Both legacy and modern blades use corrected
curvature: the cutting edge is on the convex, larger-radius side, and the mune is
on the inner side. Loading an older setup corrects the former reversed bend without
changing saved dimensions. The blade definition is independent of polish/material
settings and persists in setup JSON and captured comparisons.

Nagasa is the base-to-tip chord length. Sori is the maximum spine offset from that
chord; the endpoints share a lateral coordinate. Sakihaba and sakikasane are
measured at the yokote, not at the terminal point. Shinogi thickness is separate
from spine kasane. Per-side base angles are derived from physical dimensions;
editing angles changes thicknesses rather than storing contradictory constraints.
Kissaki types apply illustrative proportions, not classification rules.

The camera uses thin-lens image distance at automatically derived focus, with
zero bokeh size for an always-sharp preview. The Nikon Z5II's FX BSI-CMOS sensor
dimensions are 35.9 by 23.9 mm, with 24.5 effective megapixels and 6048 x 4032
native pixels (user-supplied specifications). Native sensor resolution is metadata,
not the interactive rendering or saved-preview resolution. Height and focus are measured
from the modeled optical center. Aperture exposure compensation defaults on and is
explicit; with it off, throughput scales relative to f/5.6.

Shutter defaults to 1/125 second and spans 1/8000-30 seconds, at fixed ISO 100.
Manual shutter and EV changes affect exposure directly. Auto shutter solves
shutter with the selected EV and aperture-compensation setting rather than
resetting either. Source-isolation and analysis views do not change its meter.
Shutter remains simulation-relative, not a calibrated real-camera recommendation:
absolute radiometry, motion blur and ISO noise are not modeled.

Auto shutter uses a full-trace-resolution, blade-masked HDR readback.
It protects the maximum RGB channel rather than a percentile, so small glints are
not discarded. It retains the user's aperture, EV and compensation setting while
solving shutter within the existing limits. Dark/empty views preserve exposure
and report status; limits are explicit. Stale readbacks are rejected, and manual
edits or rig locking cancel pending application. The meter runs at most once per
second and may change its estimate as progressive samples converge.

SVG supplies controls and guides. Blade depth is rendered to a GPU texture solely
for the blade-only exposure mask, excluding reference tape and background.
Pixel diagnostics and the final linear-light composition run on the GPU.

Hada uses irregular multiscale contours, finer nested layers, intermittent
chikei-like strands and sparse ji-nie-like microfacets. Roughness, neutral metallic
reflectance and submicron normal variation respond to the actual light directions;
there are no photographed or painted-in highlights. Transverse grain scale follows
the actual section width rather than compressing every pattern uniformly at the tip.
The small Designer schematic shows a 12 x 3.6 mm patch, not a rendered material.

The renderer generates 8187 x 512 surface samples and packs overlapping halves into
4096 x 1028 textures with gutters and matching UV seams. This preserves longitudinal
detail despite the pinned tracer's 4096-pixel atlas limit. Geometry normals stay
continuous at the UV seam. Normal perturbations are encoded at 32 times strength
and decoded with material normalScale=1/32, preserving small slopes through the
tracer's 8-bit atlas. Unresolved microfacet relief is attenuated. All maps are linear;
None retains the original hamon/polish formula without added grain.
Changing grain maps rebuilds the tracer scene bindings, including texture-info
array capacity; scalar roughness changes still use the material-only update.
This matters especially when switching from an untextured None surface to hada.

Picker swatches in `public/hada` are generated by the actual tracer, not external
photos. With the dev server running, regenerate them from `studio` using
`node scripts\render-hada-swatches.mjs`. They use a close, edge-lit reference rig
with hamon disabled so the grain families are recognizable. They are not a
prediction of the current rig's brightness.

The source references linked in the Designer include
[Samonji, Tokubetsu Juyo 17](https://www.nihonto-museum.com/collection/exhibit/tokubetsu-juyo-samonji-katana),
[Masayuki, Juyo 63](https://www.nihonto-museum.com/collection/exhibit/juyo-token-hoki-kami-taira-ason-masayuki),
and [Hosho, Juyo 48](https://uniquejapan.com/swords/ujka148-hosho-katana/).
These inform the original procedural structure; their photographs are not bundled
or used as relightable textures, and their grades do not authenticate the simulation.

The metric overlay stays bright even with both sources off. Toggling it never
moves the camera or table, resets accumulation, or changes Auto shutter; it is
available while locked. The old **Include tape in frame** action and physical
tape mesh are removed. Overlay scale describes the blade reference plane, not a
calibrated measurement of raised blade features.

## Hardware reference

These are user-supplied equipment specifications, not measurements made by the app.

| Equipment | Supplied specification | Current simulation |
|---|---|---|
| Nikon Z5II | FX BSI-CMOS; 35.9 x 23.9 mm; 24.5 effective MP; 6048 x 4032 native pixels | Uses the physical sensor dimensions for projection. Native resolution is metadata, not the saved-preview resolution. ISO is fixed at 100; sensor noise and spectral response are not modeled. |
| Two GVM-PRO-BD45R photography fill lights | Each housing 50 x 46 x 1200 mm; 45 W electrical input; 660 LEDs; CRI >= 97; 1.6 kg | Each emitter is a finite 1200 mm cylinder, with 46 mm default diameter. This is a geometric approximation, not the measured diffuser. |
| Light output | 750 lux at 1 m; 2180 lux at 0.5 m | Reference illuminance, **not lumens** or a complete beam profile. Output and camera exposure remain uncalibrated. |
| Color and effects | 2700-10000 K; hue 0-360 degrees; saturation 0-100%; five light modes and pixel FX | Fixed approximate 5600 K RGB emission; no RGB/effect modes or spectral/CRI simulation. |
| Fixture controls | Bluetooth app, MESH networking, manual and DMX | No hardware connection or control. |

The supplied 1200 mm housing length replaces the earlier nominal 48-inch span.
Saved custom diameters are preserved; **Use 46 mm emitter approximation** applies
the default size explicitly without changing positions or exposure. Housing
dimensions do not define the exact illuminated length or angular emission.
Brightness is relative: 100% is the model reference; values above 100% are
simulation boost, not physical dimmer settings.

## Interpretation and limitations

- The blade is representative, not reconstructed from the museum photographs.
  Historical presets reproduce only the published measurements, not a scanned
  surface. The model uses a simplified flat mune and omits grooves, tang and fittings.
  Its illustrative hamon is roughness variation, not a measured scattering model.
  Metal roughness is isotropic; real polishing direction and microstructure are
  not calibrated.
  Hada is illustrative microstructure, not wood coloration, carved grooves,
  a metallurgy simulation, or measured anisotropic scattering. The selected grain
  is not authenticated to historical presets. Judge its visibility under the
  current lighting, polish and magnification.
- Tube emission is a 5600 K RGB approximation over the entire cylinder, including
  its ends. Relative brightness is not a calibrated lux or lumen measurement.
- The room has no ambient illumination. A dark diffuse bed sits 35 mm below the
  blade reference plane.
- **Light contributions** is a false-colored per-source view, including indirect
  transport within a six-scattering-event budget.
- Clipping flags exposed linear channels >= 1 before Reinhard tone mapping.
  It does not predict actual Nikon sensor saturation.
- Depth-of-field blur, diffraction, aberrations, lens distortion and camera-body
  occlusion are not simulated. A real scan still requires appropriate focus/aperture.
- There is no denoiser, glossy-reflection filter, or highlight clamp, so fine grain
  is not intentionally blurred away. The finite tube surfaces receive MIS, but
  difficult specular paths can still converge slowly.
  The contribution-buffer approach also doubles tracing work. Performance must be
  judged on the target device, not assumed from the selected quality preset.
- Interaction uses reduced resolution. Fine detail is the default: 1200-2400 pixels
  wide and up to 4096 samples per pixel per source. Balanced targets 1024 samples,
  Fast preview 256. High-DPI display resolution is respected up to 2x. Saved previews
  use the actual tracing resolution and current sample count, not the smaller CSS
  canvas size; saving early does not automatically wait for convergence.
  Frame-rate readouts describe display-loop throughput, not GPU completion.

After renderer-code changes during development, reload the page if hot reload
leaves an old GPU scene active. The saved setup remains in browser storage.
This is separate from changing the rig or rerunning light placement.

## References and provenance

`public/references` contains ten Met Museum objects' primary public-domain images
and three additional Gassan blade views, including a kissaki/steel-grain close-up.
`manifest.json` records each museum page, source image URL, public-domain status,
CC0 license, image dimensions, retrieval time, and SHA-256 checksum. The in-app
gallery links back to the museum and provides local full-resolution viewing,
zoom and pan. These are supplemental study references, not calibrated lighting
data, relightable textures, or substitute photographs of the named Juyo blades.

Historical geometry records in `src/historical-presets.ts` are separate from that
photo collection: Aoe, Fukuoka Ichimonji, Ayanokoji, Tametsugu, Rai Kunimitsu,
Den Kanemitsu, Masatsune (Ko-Aoe), Norishige, Sanekage, and Nanki Shigekuni.
All ten are reported as NBTHK Juyo by their linked sources; the app does not
independently authenticate those grades. Unpublished dimensions and all niku,
fukura, facet angles and ridge measurements are estimates. Grooves and mune
profiles described by some sources are not reconstructed.

`public/blade-references` contains photographs of those exact ten blades, plus
four unregistered detail images. The user confirmed permission to bundle the
dealer photographs; copyright remains with their sources and they are not CC0.
Its manifest records source pages/URLs, hashes, image dimensions, permission
basis, crop bounds and approximate base/tip endpoints. See that directory's
[reference notes](public/blade-references/README.md) before reusing its images.

Approximate calibration metadata is retained for provenance, not used to display
automatic enlarged comparisons. In particular, Ayanokoji and Tametsugu cannot
support detailed camera-sized crops without substantial upscaling. The original
photograph link preserves access without implying missing detail. Photographs
never become blade material textures or part of rendered PNG captures.

Product and technical context:

- [PRD](../docs/lighting/NIHONTO_STUDIO_PRD.md)
- [Technical choices](../docs/lighting/NIHONTO_STUDIO_TECHNICAL_DESIGN.md)
