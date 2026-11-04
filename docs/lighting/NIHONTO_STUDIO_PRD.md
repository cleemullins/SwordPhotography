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
| Exposure metering | Optional Auto shutter protects the brightest rendered blade highlight. Manual shutter is available in the same strip; no separate Meter once action. ISO stays at 100 and exposure stays fixed during a locked scan. |
| Hada | Visible illustrated selection of Itame, Mokume, Masame, Ayasugi or None in Blade model and the Designer, with real changes to the rendered steel. New rigs use Itame; saved None is preserved and clearly labeled. |
| Blade movement | Translate the nihonto beneath the camera to bring different sections and features into view. Recompute reflections as it moves. |
| Analysis | Optional overlays on the camera image to help explain and evaluate the lighting and camera setup. |
| References | Original exact-blade photos for the ten historical presets, accessible from More without enlarged comparisons; a separate public-domain Met study collection with full-resolution zoom. Preserve identity, source and reuse rights. |

## Implemented workflow and UX requirements

The workflow is **Set up the fixed rig → Preview the scan → Save the rig**.
The large camera image and scan strip sit beside the dimensioned rig diagram.
Blade design is a separate editor, not an equal-priority settings tab.
The image fills the scan column. Keep the pinned exposure/inspection panel compact,
with aligned label, slider and toggle rows. Use the draggable blade navigator and
numeric position field rather than a duplicate scan-position range slider.
A separate shaded, orbitable 3D area shows the table, blade, tubes and camera.
Drive their transforms from the same physical setup. Move the table and blade
together during scanning; orbiting the overview must not move the photographic
camera. Distinguish illustrative table/camera-body shapes from measured geometry.

- **Camera:** focal length, aperture, height, and coverage per frame. Always keep
  the preview sharp, without manual focus or depth-of-field blur. Derive focus
  for projection in setup, then freeze projection during a locked scan. Keep
  shutter, aperture, exposure bias, source brightness and source toggles in one
  camera-adjacent strip. Remove the duplicate Advanced Camera area and inspector
  aperture/brightness controls. Move whole-blade-shot reconfiguration into More
  and keep full hardware metadata in Help.
  Keep exposure information visible immediately beside the camera image, with
  quick shutter, aperture and both tube brightness sliders. Share the same rig
  settings and lock enforcement as the inspector; identify aperture compensation.
  Auto shutter sits next to the shutter slider, targets 90% of clipping from
  rendered blade highlights, and reacts to light/optical changes during setup.
  Manual shutter edits disable it. Lock pauses it without changing the last
  exposure; unlocking resumes it when selected.
- **Lights:** brightness and on/off are beside the camera image. Set height and
  lateral offset in the setup diagram. Both longitudinal centers remain at the
  fixed rig origin X=0, including during scanning; remove the Center tube spans
  action and along-blade offset fields. Optional linked positioning remains.
- **Scan:** translate only the table along the blade. Provide a navigator, position
  from base, start/end, step, previous/next frames, frame count and derived overlap.
  Include the final partial step, warn about gaps, and label the workflow as
  simulated positioning rather than hardware control.
- **Model:** live dimension and shape editing, silhouette and cross-section previews,
  historical preset selection, accessible measurement provenance, and independent
  hada selection. Both the closed selector and open options show readable rendered
  swatches, not generic icons. Support mouse and keyboard selection. Clearly label
  procedural grain as illustrative and identify None as no added grain.
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
  pair of tube positions, protecting the weakest transverse regions and scan
  sections rather than only bright facet midpoints. Include cutting-edge, hamon,
  ji and shinogi regions with their differing polish responses.
  The suggestion must not depend on the current scan frame. Keep the highest
  tube surface at or below camera height; balance brightness within 100% instead
  of escaping that practical limit. Preserve on/off and fixed-origin centering,
  enable Auto shutter to protect exposure, and never follow table movement.
  Report unavailable or weak-coverage solutions rather than exceeding the ceiling.
  Keep both 1200 mm tube spans centered on the stationary rig, not the moving
  blade. Show full spans in a top-view guide;
  end-on circles must not be mistaken for point lights.
- **Lock rig:** camera projection/exposure, light positions/intensities, model,
  and transverse alignment remain fixed while the table translates. Edit rig
  explicitly unlocks those controls. Import/restore opens unlocked for review.
  The table starts centered by default; remove the Center blade action without
  continuously recentering it or preventing intentional scan/alignment movement.
- **Metric reference:** a bright yellow overlay above the blade follows the old
  ruler's reference-plane datum and appears in saved images. Use centimeter
  labels, zero at the blade base and zoom-adaptive ticks. Keep it inside the frame,
  independent of lighting and exposure. Toggling it never moves the rig and is
  allowed while locked. Do not retain a second, ray-traced ruler.
- **Precision:** show camera height, tube heights and signed rig offsets directly
  in the end-on diagram using dimension/extension lines and arrowheads. Remove
  the separate position fields and Camera/Left light/Right light selector buttons.
  Preserve direct handle dragging and 1 mm / Shift-10 mm keyboard adjustment.
  Use sliders plus numeric fields for the remaining optical/exposure parameters;
  selectable millimeters or inches apply to displayed dimensions.
  Explain checkbox behavior with hover tooltips and accessible descriptions,
  including tape, emission, linking and aperture compensation. Rig and scan units
  share one preference; lens mm and metric tape remain explicitly fixed units.
- **Comparison:** save/load scene settings and capture images with their settings.
  Keep blade position and exposure consistent when comparing lighting alternatives.
  Save preview adds a thumbnail without interrupting the view. Group lighting
  comparisons and scan positions separately; distinguish full-setup from rig-only
  restore so table movement is never a hidden side effect.
- **Photographic references:** retain access to original historical-blade images
  through More. Do not automatically enlarge low-resolution crops beside the
  render: the available source detail is inadequate for that comparison. Keep
  unregistered close-ups separate and retain source/provenance records.

### Inspection controls

| Overlay | Purpose |
|---|---|
| Per-light contribution | Distinguish reflections and illumination attributable to each tube. |
| Highlight clipping | Identify detail lost at the selected simulated exposure. |
| Metric tape | Bright reference-plane ruler above the blade, included in saved images. |

Metric tape and clipping are independently toggleable. The framing grid and
camera-view badges are removed. Camera, Left only, Right only
and Light contributions are mutually exclusive display modes. Clean view selects
the ordinary camera image and clears overlays without moving the rig.
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
Auto shutter is the single automatic exposure workflow. After at least 32 stable samples,
read the full-resolution blade-masked HDR image and protect the maximum RGB
channel, including rare glints. Account for the selected aperture, compensation,
EV and actual source brightness. Preserve exposure with an explicit status for
dark/empty views and report shutter limits. Do not apply stale readings after a
scene change, manual edit or lock. It must not renormalize frames during a locked scan.
Shutter values remain simulation-relative, not calibrated guidance for the real camera.

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

The Met study collection contains **10 objects' primary public-domain photographs**
and three additional Gassan views, including a steel-grain/kissaki detail.
`studio/public/references` records source URLs, licensing, dimensions and checksums.
The in-app viewer supports full-resolution zoom/pan, attribution and original-image
links. These are supplemental references, not the ten named Juyo blades.

`studio/public/blade-references` contains photographs of the exact ten historical
presets and four additional unregistered details. The user confirmed permission
to bundle these dealer images; copyright remains with their sources, separately
from the Met CC0 collection. Ayanokoji and Tametsugu full-blade photos are
lower-resolution, and the UI must disclose that instead of substituting another
blade or an unregistered macro image. Reference photos remain separate from
rendered materials and captured simulation images.

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
- Successful Auto placement never places any part of a tube above camera height.
  It may rebalance brightness, never enables a disabled source, and clearly
  enables highlight-protecting Auto shutter. Subsequent locked movement changes
  neither source power nor exposure.
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
  with derived setup focus and legacy light-following disabled. Auto shutter's
  saved choice is visible and runs only while unlocked.
- Each historical preset loads its own source image. Reference frame dimensions
  match the camera view, a 120 mm window remains 120 mm across scan positions, and
  inspection of either reference collection never changes the rig.
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
