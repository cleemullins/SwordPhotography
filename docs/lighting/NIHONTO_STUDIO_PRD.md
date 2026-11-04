# Nihonto Lighting Studio

**Product requirements and implementation status | November 4, 2026**

The browser application is implemented in [`studio`](../../studio/README.md).
This document records the current product contract and remaining realism limits.
See [Technical Choices](NIHONTO_STUDIO_TECHNICAL_DESIGN.md) for the implementation
and its validation boundaries; future work is identified separately below.

## Purpose

Help a nihonto photographer determine where to place the camera and two light
tubes before experimenting with the physical rig. Provide an attractive,
physically grounded, always-sharp camera preview that makes reflections, surface
detail and framing understandable without simulating depth-of-field blur.

Success means finding useful camera heights and light positions, not merely
producing a beautiful render. Visual quality is nevertheless essential: the user
must be able to see what a lighting change reveals or obscures.

## Primary workflow

Choose a representative blade, set the lens and camera height, position the lights,
and inspect the ray-traced camera image. Lock the camera, lights and exposure,
then translate only the blade/table to examine other sections under that same rig.
Toggle analysis overlays to understand the result, then preserve useful setups
for comparison and reproduction on the real rig.

## Confirmed requirements

| Area | Requirement |
|---|---|
| Rendering | Full ray-traced scene, viewed through the camera looking down at the nihonto. Aim for interaction as close to real time as practical. |
| Visual quality | Convincing blade appearance and reflections, sufficient to evaluate lighting placement and visible detail. |
| Camera | **Nikon Z5II**, FX BSI-CMOS, **35.9 x 23.9 mm**, **24.5 MP / 6048 x 4032** native pixels. Adjustable height/distance, focal length **20 to 135 mm**, aperture **f/1.2 to f/11**. Native sensor resolution is distinct from preview resolution. |
| Lights | Exactly two **GVM-PRO-BD45R** fixtures, **50 x 46 x 1200 mm** housings (superseding the nominal 48-inch dimension). Adjustable positions, independent on/off and brightness. The preview uses approximate cylindrical emitters at **5600 K**, not calibrated fixture optics. |
| Blade model | Generate an editable parameterized 3D blade, with a dedicated Designer and approximately ten source-backed historical presets, preferably Juyo or higher. |
| Exposure metering | One-shot blade-detail metering at ISO 100, adjusting shutter while preserving the selected aperture and light settings. Exposure stays fixed during scanning. |
| Hada | Designer selection of Itame, Mokume, Masame, Ayasugi or None, with a grain preview and real changes to the rendered steel surface. |
| Blade movement | Translate the nihonto beneath the camera to bring different sections and features into view. Recompute reflections as it moves. |
| Analysis | Optional overlays on the camera image to help explain and evaluate the lighting and camera setup. |
| References | Approximately ten high-quality nihonto photographs or models to guide appearance and evaluation, with documented reuse rights. |

## Implemented workflow and UX requirements

The workflow is **Set up the fixed rig → Preview the scan → Save the rig**.
The large camera image and scan strip sit beside a selected-object rig inspector.
Blade design is a separate editor, not an equal-priority settings tab.

- **Camera:** focal length, aperture, height, and coverage per frame. Always keep
  the preview sharp, without manual focus or depth-of-field blur. Derive focus
  for projection in setup, then freeze projection during a locked scan. Meter once
  adjusts shutter at ISO 100, retaining aperture and lights. Advanced controls hold
  manual shutter, exposure compensation and whole-blade-shot reconfiguration.
  Keep exposure information visible immediately beside the camera image, with
  quick shutter, aperture and both tube brightness sliders. Share the same rig
  settings and lock enforcement as the inspector; identify aperture compensation.
- **Lights:** one card per tube with brightness, on/off, and longitudinal position.
  Set height and lateral offset directly in the setup diagram. Optional linked
  positioning supports symmetric setups.
- **Scan:** translate only the table along the blade. Provide a navigator, position
  from base, start/end, step, previous/next frames, frame count and derived overlap.
  Include the final partial step, warn about gaps, and label the workflow as
  simulated positioning rather than hardware control.
- **Model:** live dimension and shape editing, silhouette and cross-section previews,
  historical preset selection, accessible measurement provenance, and independent
  hada selection. Clearly label procedural grain as illustrative.
- **The setup:** an end-on diagram with draggable lights (height and lateral offset)
  and camera (height only), plus precise numeric editing and keyboard steps.
  Fit the actual rig without excessive empty space. Provide Zoom +/− and Fit rig
  with a fixed bottom-center anchor, independent of physical camera framing.
  Automatically zoom out near drag boundaries without introducing position jumps;
  allow cropped objects to be recovered by selecting them.
  Place it alongside the rendered image, keeping the image visible while adjusting
  the rig. Keep it available at every screen size; stack panels rather than hiding
  controls on narrow screens.
- **Top view:** derive tube and blade positions from the actual rig X/Y coordinates,
  not fixed display rows. Show finite tube length/diameter, the blade silhouette,
  and the camera footprint at the reference plane with equal along/across scale.
  X runs along the blade; positive Y points up in this view. The camera origin
  remains centered and framing reserves the full base-to-tip scan envelope.
  Moving the table through that scan must not move or rescale the tubes.
  Both opposite-side and same-side lighting arrangements must match the end-on
  controls. Source names/colors identify tubes, not forced positions; height
  belongs in the end-on view.
- **Suggest light positions:** evaluate the entire blade, including the kissaki,
  as the table brings each section under the stationary camera. Choose one fixed
  pair of tube positions, prioritizing coverage of the weakest sampled section
  and then grain contrast, not maximum highlight brightness. The suggestion must
  not depend on the current scan frame. Preserve brightness, on/off and along-blade
  centering. Never follow table movement. Report unavailable or weak-coverage solutions.
  Center both 1200 mm tube spans on the current blade center with a separate setup
  action, then hold them fixed during the scan. Show full spans in a top-view guide;
  end-on circles must not be mistaken for point lights.
- **Lock rig:** camera projection/exposure, light positions/intensities, model,
  tape and transverse alignment remain fixed while the table translates. Edit rig
  explicitly unlocks those controls. Import/restore opens unlocked for review.
- **Metric reference:** a physical yellow tape alongside the blade moves with the
  table and appears in saved images. Use millimeter ticks, centimeter numbers,
  and zero at the blade base; disclose reference-plane parallax. Include tape in
  frame is an explicit setup action, not scan-time automation. Tape shares exposure
  and may be dark when exposing for bright steel; do not make it an emissive overlay.
- **Precision:** numeric fields for positions, sliders plus numeric fields for other
  parameters; selectable millimeters or inches.
  Explain checkbox behavior with hover tooltips and accessible descriptions,
  including tape, emission, linking and aperture compensation. Rig and scan units
  share one preference; lens mm and metric tape remain explicitly fixed units.
- **Comparison:** save/load scene settings and capture images with their settings.
  Keep blade position and exposure consistent when comparing lighting alternatives.
  Save preview adds a thumbnail without interrupting the view. Group lighting
  comparisons and scan positions separately; distinguish full-setup from rig-only
  restore so table movement is never a hidden side effect.

### Inspection controls

| Overlay | Purpose |
|---|---|
| Per-light contribution | Distinguish reflections and illumination attributable to each tube. |
| Highlight clipping | Identify detail lost at the selected simulated exposure. |
| Framing | Rule-of-thirds overlay; coverage and position are reported by the scan controls and physical setup diagrams. |

Framing and clipping are independently toggleable. Camera, Left only, Right only
and Light contributions are mutually exclusive display modes. Clean view selects
the ordinary camera image and clears overlays without changing the scene.
Save preview captures the selected mode and overlays; choose Clean view first
when a clean image is needed.

## Rendering and optics principles

Use actual reflective blade geometry and a material model that responds to moving
lights and changing viewpoints. Represent curvature, facets, and polish sufficiently
to make placement experiments meaningful; hamon and surface-detail fidelity require
separate evaluation.

### Parameterized blade

The Nihonto Designer edits nagasa, sori and curvature peak, base/yokote widths and spine
thicknesses, shinogi thickness/position, kissaki type/length, fukura, niku, and
coupled facet angles. Keep dimensions independent of the derived mesh and material.
Save the versioned definition with setups and comparisons.

Include ten historical presets with source-reported Juyo status. Reproduce published
measurements and explicitly distinguish missing/estimated parameters, source caveats,
and modified presets. These are approximations, not scans or certified reconstructions.
The current shinogi-zukuri model has a simplified flat mune and no grooves, tang,
fittings, or authentic hamon. Preserve older dimensions and parameterization until
edited, but correct reversed curvature in all profiles: the sharp edge belongs
on the convex, larger-radius side and the mune on the inner side.

### Optics and interaction

Model finite tube emitters and perspective with an always-sharp preview.
Use automatic setup focus and explicit exposure controls. Do not silently normalize brightness:
light-intensity changes must remain visible. Optional aperture exposure compensation
must be clearly labeled.
Meter once is an explicit setup action using combined linear light only on the
blade, regardless of analysis overlays. Preserve aperture and light settings;
vary shutter within 1/8000-30 seconds at ISO 100. Protect blade highlights, show
adjustment/limit status, and retain shutter with a warning when the blade is dark
or out of view. Applying metering resets EV bias to zero and disables aperture
compensation. No continuous auto exposure runs during scanning.
Clearly state that shutter values are simulation-relative, not calibrated guidance.

Expose the supplied hardware specifications without overstating the model:
GVM's 750 lux at 1 m and 2180 lux at 0.5 m are illuminance, not lumen ratings.
The 1200 mm length and default 46 mm circular emitter approximate its housing;
retain saved custom diameters until the user explicitly changes them. Nikon's
native pixel dimensions do not imply full-resolution 24.5 MP preview exports.
The [hardware reference](../../studio/README.md#hardware-reference) lists the
complete supplied specifications and the distinctions from simulated behavior.

Prioritize responsive feedback during interaction, then progressively refine the
image at rest. Proposed engineering targets are feedback within **100 ms** and
at least **20 fps** during adjustment at a reduced preview resolution on an agreed
reference machine. These are evaluation targets, not committed performance claims;
an agreed benchmark machine, scene, quality preset and convergence criterion are
still needed before claiming those targets are met.

## Reference assets and realism boundaries

An initial collection of **10 public-domain Met Museum photographs** is included
in the studio's reference gallery and `studio/public/references`, with source URLs,
licensing, dimensions, and checksums. It includes full blades, mounted swords, and
tang details. These are photographs, not a collection of 3D models.

Use photographs as visual references, not as relightable ground truth. Highlights
and shadows baked into a photograph must not masquerade as simulated illumination.
One photograph does not establish a blade's full geometry or reflective properties.

Label representative blade models and uncalibrated materials accordingly. Real
hamon visibility and polish response cannot be guaranteed from an attractive render.
Validation against photographs from the user's measured rig is needed before
claiming reliable prediction of the actual blade's appearance.

## First-release acceptance

- Changing camera height or focal length changes framing consistently with the
  selected sensor model; aperture affects throughput, not preview sharpness.
- Moving either tube or the blade updates reflections rather than moving a
  prepainted highlight. A disabled tube contributes no emitted illumination.
- Independent brightness controls produce visible changes at fixed exposure.
- Both tubes retain their physical length and 5600 K target throughout adjustments.
- Top-view placement follows edits to each tube's X/Y and the blade's X/Y. Equal
  scale and the actual blade outline make relative placement reproducible; tube
  height changes do not masquerade as transverse motion.
- Quick exposure and brightness controls stay beside the camera image, synchronize
  with the inspector, and cannot change the locked rig.
- One Auto suggestion is independent of the current scan position. Inspect base,
  middle and kissaki with unchanged camera, lights, exposure and focus projection.
  Report weak facets rather than silently correcting individual scan frames.
- Metric tape is included in image captures, moves with the table, and can be
  restored to the frame during setup without moving tubes or changing scan X.
- Overlays correspond to the current scene and can be removed without altering it.
- Saved setups restore camera, lighting, blade, scan, tape and exposure settings,
  with derived setup focus and legacy automation disabled.
- Blade presets generate reproducible geometry from saved parameters; saved setups
  retain the blade definition and material settings, not just a mesh reference.
- Performance is measured on the agreed hardware and render resolution, alongside
  visual checks against simple known reflection geometries.

## Scope and next decisions

**Implemented packaging:** the React/TypeScript/Vite application in `studio`,
using Three.js and WebGPU path tracing. It runs locally or as static HTTPS assets
in a supported desktop browser. The existing `nihonto-lighting.html` calculator
is retained unchanged as a separate geometric reference.

**Remaining evaluation:** real-fixture diffuser/beam measurements, absolute
photometry and camera response, material calibration against measured blade
photographs, directional polishing response, and reproducible performance
measurements on reference hardware. Existing parameter ranges and presets are
simulation choices, not assertions about measured physical travel or metallurgy.
GLB/glTF model interchange is a possible extension, not a current feature.

**Outside the initial scope:** physical camera/slider/DMX control, image stitching,
automatic recovery of accurate 3D materials from photographs, and guaranteed
prediction of microscopic blade features. One-shot whole-blade placement uses an
approximate contrast/coverage search; manual experimentation and fixed-exposure
scan inspection remain essential. It does not claim a globally optimal or
calibrated photographic solution.
