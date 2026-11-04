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
- In **Fixed rig**, select the camera or either tube in the end-on diagram.
  The selected object's position and optical/brightness controls are together.
  Drag handles or use arrows (1 mm; Shift: 10 mm). Offsets use the stationary
  camera origin, with blade-relative distances shown secondarily.
- Both emitters are finite **1200 mm cylinders along X**, not point
  lights. The top view uses actual X/Y coordinates and one physical scale for
  tube length/diameter, the blade silhouette and camera footprint at Z=0.
  Positive Y points up. Opposite-side or same-side placements match the end-on
  controls; height remains an end-on measurement. Its fixed-origin framing reserves
  the full scan envelope so table translation does not move or rescale the tubes.
  Default centers are X=0. **Center tube spans on blade**
  in advanced alignment centers both on the current table position once.
  Suggestions preserve longitudinal offsets; table movement never moves the tubes.
- **Exposure & light** stays directly above the camera image: shutter speed,
  aperture, and both tube brightness sliders share the rig settings. Shutter uses
  photographic steps from 1/8000 s to 30 s; advanced seconds input retains exact
  metered/imported values until the slider is moved. The persistent readout shows
  shutter, aperture, ISO 100 and EV. Aperture compensation is explicit and can be
  toggled here. All these controls are disabled during a locked scan.
- **Suggest light positions** searches one fixed rig across the entire blade,
  including the kissaki, prioritizing coverage and then grain contrast. It
  preserves brightness and on/off and does not follow later camera/model edits.
  **Meter once** adjusts shutter at ISO 100, resets EV to zero and disables aperture
  compensation. Aperture and lights remain unchanged. Neither action runs during
  a locked scan.
- Camera **Coverage per frame** changes height and automatic focus, adjusting the
  lens only at travel limits. It follows the rig/scan mm/in preference; lens focal
  length remains mm. Advanced **Reconfigure for whole-blade shot** intentionally
  selects 35 mm, centers the table and includes the tape with a 15% margin.
  Use the navigator for a whole-blade overview without changing optics.
- The image is **always sharp**. Manual focus, click-to-focus and focus diagnostics
  are removed. Setup optics use automatic ridge focus; depth-of-field blur is
  disabled. Aperture still controls throughput, unless explicitly compensated.
  This preview does not predict real-camera depth of field.
- **Lock rig / Preview scan** freezes camera projection, focus, exposure, tube
  XYZ/brightness/on-off, model, tape and transverse alignment. Only along-blade
  table movement and scan-plan parameters remain editable. Use **Edit rig** to
  change the setup. The navigator window denotes the viewed section, not a moving
  camera. Scrub, use left/right arrows, or step between frames.
- Scan start/end and step are measured from the blade base. The plan includes a
  final shorter step where necessary, reports frame count and minimum overlap,
  and warns about gaps. Overlap is calculated at the blade reference plane.
  No motor/camera control or stitching is performed.
- A **yellow metric reference tape** moves with the table and is ray traced into
  saved images. It is 20 mm wide, positioned 3 mm beyond the maximum spine extent,
  with zero at the blade base, millimeter ticks and centimeter numbers. It remains
  metric in inch mode. It is not a screen overlay or an exposure-meter target.
  Raised blade features have small parallax differences relative to the tape.
- **Zoom +/−** and **Fit rig** affect only the setup diagram, keeping its bottom
  center fixed. Edge-aware drag zoom-out avoids position jumps. Selecting a
  cropped handle restores visibility. Narrow screens stack panels.
- Framing/clipping stay beside the image; **Inspect lighting** contains source
  isolation and false-colored contributions. Quality/sample/FPS controls are under
  Rendering details. Advanced camera/tube/alignment controls are collapsed.
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
positions and three kissaki positions, simulating each being translated under the
stationary camera. The current scan position does not change the suggestion.
Candidates cover multiple heights and both sides of the reflected-ray/tube edge.
Both tubes are optimized jointly: they need not illuminate separate facets or sit
on opposite sides of the blade.

A finite-strip/microfacet approximation predicts illumination and sensitivity to
small normal and polish changes. The search prioritizes the weakest sampled section's
area-weighted coverage, then average coverage and grain contrast. Coverage uses
the weaker response across the average polish and sharper grains with small normal
perturbations, so a broad average reflection does not hide dark fine-grain regions.
Opposing contrast
responses are weighted by each tube's actual brightness and on/off state and can
cancel rather than being counted twice. Candidate shortlists retain
solutions for difficult sections, including the kissaki. This is a bounded physical
heuristic, not a guarantee of the global optimum or a measured camera prediction.

Candidates must fit the rig's XYZ limits and clear the blade, the camera pupil, the
other tube, the target-to-camera rays, and the other light's illumination path.
The tubes retain their 1200 mm length, diameter, brightness, and enabled states.
If a clear full-blade rig cannot be found, the app retains the previous positions
and warns. A feasible rig with weak predicted facets also reports that limitation.
With both tubes disabled or at zero brightness, placement reports that a light
must be enabled instead of counting nonexistent illumination.

Inspect base, middle and tip with the same exposure before accepting the rig.
Equal exposure does not imply equal brightness: a polished facet must reflect a
tube toward the camera. The kissaki changes slopes at the yokote, and curvature,
taper and camera direction also affect the ordinary body. Neither the tubes nor
exposure follow scan movement. Real polish, light output and camera response still
need calibration.
Legacy continuous-lighting/exposure flags remain readable but are turned off on
load. Scan range/step/lock, setup name and tape state persist in JSON and captures.
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
Meter once reads a 256 x 170 floating-point GPU buffer of combined linear
light, masked to the blade using depth. It targets the 70th-percentile luminance
at 0.45 and limits the 99th-percentile maximum channel to 0.95 before display
mapping. Smaller glints may still clip. A one-stop-per-reading limit and 0.08-stop
deadband stabilize the solver; it iterates against the same readback until settled.
Highlight protection takes precedence over the
deadband. Insufficient blade coverage or darkness preserves shutter and warns.
Stale readbacks are discarded after settings change.

Applying metering resets Exposure bias to 0 EV and disables aperture compensation.
Exposure EV remains a deliberate bias applied after metering; positive bias can
clip highlights. Source-isolation and analysis views do not change the meter.
The shutter is simulation-relative, not a calibrated real-camera recommendation:
absolute radiometry, motion blur, and ISO noise are not modeled.

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

The source references linked in the Designer include
[Samonji, Tokubetsu Juyo 17](https://www.nihonto-museum.com/collection/exhibit/tokubetsu-juyo-samonji-katana),
[Masayuki, Juyo 63](https://www.nihonto-museum.com/collection/exhibit/juyo-token-hoki-kami-taira-ason-masayuki),
and [Hosho, Juyo 48](https://uniquejapan.com/swords/ujka148-hosho-katana/).
These inform the original procedural structure; their photographs are not bundled
or used as relightable textures, and their grades do not authenticate the simulation.

The tape shares scene lighting and exposure, so it can be dark when exposing for
bright steel. **Include tape in frame** restores a disabled or cropped reference
by aligning the table transversely and expanding coverage only if necessary. It
preserves scan position and tube positions, and is unavailable while the rig is
locked. **Meter once** may improve readability but prioritizes the blade.

## Interpretation and limitations

- The supplied fixture is the **GVM-PRO-BD45R** photography fill light:
  50 x 46 x 1200 mm housing, 45 W electrical input, 660 LEDs, CRI >= 97,
  1.6 kg, 2700-10000 K, hue 0-360 degrees, saturation 0-100%, five light modes
  and pixel FX. Controls are Bluetooth app, MESH networking, manual and DMX.
  Stated illuminance is **750 lux at 1 m** and **2180 lux at 0.5 m**; these are
  not lumen ratings. These user-supplied reference figures are not a measured
  beam profile or a camera calibration.
  The earlier nominal 48-inch span is replaced by the 1200 mm housing length.
  New setups use a 46 mm-diameter cylindrical emitter approximation. Saved custom
  diameters are preserved; **Use 46 mm emitter approximation** applies that size
  explicitly without changing positions or exposure. The housing dimensions do
  not define the exact diffuser shape, illuminated length, or angular emission.
  Output remains relative: 100% is the model reference and values above 100% are
  simulation boost, not a physical dimmer setting. The preview remains fixed at
  approximate 5600 K; RGB effects, CRI/spectral response and hardware control are
  not simulated.
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
- Light paths are false-colored per-source contributions, including indirect
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

## References and provenance

`public/references` contains ten original Met Museum public-domain images.
`manifest.json` records each museum page, source image URL, public-domain status,
CC0 license, image dimensions, retrieval time, and SHA-256 checksum. The in-app
gallery links back to the museum. These are appearance references, not calibrated
lighting data or relightable textures.

Historical geometry records in `src/historical-presets.ts` are separate from that
photo collection: Aoe, Fukuoka Ichimonji, Ayanokoji, Tametsugu, Rai Kunimitsu,
Den Kanemitsu, Masatsune (Ko-Aoe), Norishige, Sanekage, and Nanki Shigekuni.
All ten are reported as NBTHK Juyo by their linked sources; the app does not
independently authenticate those grades. Unpublished dimensions and all niku,
fukura, facet angles and ridge measurements are estimates. Grooves and mune
profiles described by some sources are not reconstructed. Only factual measurements
and source metadata are included, not dealer photographs or descriptive passages.

Product and technical context:

- [PRD](../docs/lighting/NIHONTO_STUDIO_PRD.md)
- [Technical choices](../docs/lighting/NIHONTO_STUDIO_TECHNICAL_DESIGN.md)
