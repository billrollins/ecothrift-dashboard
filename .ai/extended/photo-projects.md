# Photo projects

Owner ask, 2026-11-24. Staff photograph items on the floor with a phone; the photos are kept by project, tied to the
item whose tag was scanned, and cleaned up with our own tools or with Grok. First use: "Black Friday - Featured Items".

## Live now (v2.332.0, fix v2.332.1; Dash Update #208)

- **Where:** Processing > Photo projects, `/photo-projects`. Every staff login.
- **Project:** id, name, optional description, photo count. The owner (Admin role or superuser) sees every project;
  the creator picks who else sees it. Only the creator or the owner may rename, share or delete it.
- **Phone loop:** Scan + photo: scan the tag (camera, typed, or "No tag"), take the photo, optional note, Save, back
  to scanning. The photo is tied to the item (`ProjectPhoto.item`) when the tag is ours.
- **Grok buttons on a photo:** Remove background, Clean up, Square thumbnail. One edited copy per photo; a new run
  replaces the last one. The original is always kept.
- **Delete:** a photo goes at once (files too). A project is hidden at once and removed for good after 30 days
  (`purge_deleted`, run about hourly when someone opens the list).
- **Code:** `apps/core/models.py` (`PhotoProject`, `ProjectPhoto`), `apps/core/services/photo_projects.py`,
  `apps/core/photo_projects.py` (API `/api/core/photo-projects/`, `/api/core/project-photos/`),
  `frontend/src/pages/photoProjects/`, tests `apps/core/tests/test_photo_projects.py`.
- **Known gap (fixed by #209):** Grok was called straight from `photo_projects.py`, not through the AI image router
  (`apps/core/services/image_router.py`), so these runs were not in AI usage and the model was not the one picked in
  Settings > AI.

## The editor as built (Dash Update #209, ships as one release)

- **Data:** `core.ProjectPhotoVersion` and `ProjectPhoto.main_version` + `raw_is_main` (migration
  `core/0020_photo_versions`; it also made each v2.332 edited copy that photo's first version, and seeds the four AI
  actions). Main = the starred version, Raw when Raw was starred, else the newest finished version, else Raw
  (`services/photo_projects.main_of`). The old `edited`, `edited_thumbnail`, `edit_kind`, `edit_status`, `edit_error`
  columns are no longer read; they stay one release so the old code running during migrate never breaks, then a small
  migration drops them.
- **API:** `POST /api/core/project-photos/<id>/versions/` (Edit picture, multipart), `/ai/` (action, made_from, color,
  words), `/main/` (version id or null for Raw); `/api/core/photo-versions/<id>/` DELETE (files too), `file/`,
  `thumb/`, `again/` (Run again a failed run in its own slot). A run working longer than 5 minutes (`started_at`) is
  marked failed whenever the photo or the project's photos are read.
- **AI:** `image_router.edit_image` (xAI `/images/edits` JSON with a data URL; OpenAI `/images/edits` multipart;
  Google Nano Banana with the picture as a part; Imagen cannot edit). Settings > AI, Image tier, Processing > Photo
  projects: `PHOTO_REMOVE_BACKGROUND`, `PHOTO_OPTIMIZE`, `PHOTO_FILTER` (studio, room, holiday, clean up),
  `PHOTO_FREE_EDIT`. Each run is logged in AI usage with the person who ran it. The source is sent as a JPEG of at
  most 1024 px (a see-through one laid on white first); the answer is fitted into the source's shape
  (`fit_shape`: pads with the median edge color, never trims) and kept at most 2048 px.
- **Frontend:** the shared editor in `frontend/src/components/photoEditor/` (`pixels.ts` color matrix, Looks, keying
  and content box; `editState.ts` turn, crop and full-size render; `usePhotoEdit.ts`; `CropStage.tsx`;
  `EditTools.tsx`), the photo-projects shell in `frontend/src/pages/photoProjects/editor/` (`PhotoEditor.tsx`,
  `VersionStrip.tsx`, `AiPanel.tsx`). The crop stage is hand-written: `react-easy-crop` was checked and always centres
  its frame, so Free could not drag one edge while the other stays put.
- **Choices made in the build:** a picked Background swaps every pixel near the edge color (soft edge), only on a
  version whose edge is one plain color or see-through; Raw can be starred Main too; Download takes the version on
  screen (the picture as saved, not unsaved edits); unsaved edits are dropped when another version is picked or the
  editor closes; on the phone the Edit tools and the AI tools share one fixed-height area, Optimize sits with the
  filter chips there, and Download, Note and Delete photo are in the top bar's menu.

## The editor (approved 2026-11-24: "this is perfect. get it done!")

Owner's words: separate image editing from Grok editing. Image editing works on the Raw or on any Grok revision.
Revisions are saved or deleted easily, "a click of an X in the top right corner". Mockups:
`workspace/photo-editor-design/editor-desk.png` and `editor-phone.png` (HTML beside them).

Owner's correction on approval (this wins over anything below or in the mockups): **nothing crops by itself.**
"Crop to content runs by itself after every Remove background. NO especially in the case of a user specifically
setting 1:1; Crop to a special ratio needs to be in place. Pinch to zoom and drag to move. but the ratio crop is
stationary. until you hit apply."

### One editor, two tabs, a strip of versions

- **Edit** = our own code, in the browser. Instant, free, never redraws the item.
- **AI** = Grok. About 25 seconds a run, priced per picture, and it can change small details.
- **Versions strip** under the picture: Raw first, then every version. Tap one to look at it; the next Edit or AI
  run starts from the one being looked at (Raw or any version).
  - Raw is never changed and has no X.
  - Edit: sliders and crop show live; nothing is kept until **Save as new version**. Reset clears them.
  - AI: every run lands in the strip as a new version (a "working" tile in a fixed slot while it runs).
  - **X** on a version's top right corner deletes it. The tile greys in place for 5 seconds with Undo on it, then
    it is gone (files too). Nothing else moves while the Undo shows.
  - **Main** (star): the version the project grid shows and Download uses. The newest is Main until another is
    starred.
- Same editor on desk and phone. Phone: picture, strip, Edit | AI, one tool open at a time in a fixed slot.

### Edit tab (programmatic)

Start from the shared tools the Social Studio and Online Sales photo editors already use (`frontend/src/utils/imageEdit.ts`:
crop, rotate, brightness, contrast; `react-image-crop`). Those two editors stay as they are for now; the new editor is
built as one shared component so they can move to it later.

| Tool | What it does |
|---|---|
| Crop | Free, 1:1, 4:5, 2:3, 3:2, 4:3, 16:9, 9:16. Rotate left and right. See "How crop works" below. |
| Crop to content | A button, never automatic. Places the item in the crop frame with a small even margin: with a ratio picked, the frame keeps that ratio and the photo is zoomed and centred to fit (any gap filled with the background); with Free, the frame trims to the item. Still needs Apply. 1:1 + Crop to content replaces today's "Square thumbnail". |
| Light | Brightness, Contrast. |
| Color | Saturation, Warmth, Hue. |
| Looks | One tap: Auto (levels and white balance), Vivid, Warm, Cool, B&W. |
| Background | See-through, White, Black, or any color. Works on a version with a plain backdrop (after Remove background); on a busy photo the tool offers Remove background instead. |

Pixel math, not `ctx.filter`, so iPhones behave the same as Android.

**How crop works (owner's correction):**
- Pick a ratio and the frame appears at that ratio, as large as fits the picture area, centred. **The frame does not
  move.** The photo moves behind it: drag to move, pinch with two fingers to zoom (desk: drag, mouse wheel, and a zoom
  slider).
- Zoom runs from "the whole photo fits inside the frame" (the gap filled with the Background choice: white by default,
  see-through on a see-through version, shown as a checkerboard) up to about 5x. A ratio starts with the photo filling
  the frame, centred.
- Free: the frame's corners and edges can be dragged to any shape; drag and pinch still move the photo.
- **Apply** makes the crop: the picture area then shows the cropped result, and Light, Color, Looks and Background
  work on that. Nothing is kept until **Save as new version** (pressing it while cropping applies the crop first).
  Reset clears everything not yet saved.
- `react-easy-crop` (MIT) is built for exactly this (a fixed frame, the image dragged and pinch- or wheel-zoomed,
  zoom below 1 with `restrictPosition` off); check it before writing the gestures by hand. Free can stay on
  `react-image-crop`, which is already in the repo.

### AI tab (Grok)

| Action | What it does |
|---|---|
| Remove background | Item alone on White (default), Black or a picked color. Removes tags and stickers. **Never crops by itself** (owner's correction): the result keeps the shape of the version it was made from, so a 1:1 version gives a 1:1 result. Crop to content stays a button in Edit. |
| Optimize | Fixes dim or yellow store light, color and sharpness. Same item, same setting, same framing. |
| Filters | Studio shot (studio light, soft shadow, white seamless) · Room scene (a tidy room or place that suits the item) · Holiday scene (Christmas setting) · Clean up (keeps the real setting, removes tags, stickers, clutter). |
| Free edit | The user's own words to Grok, plus our standing line to keep the item itself as it is. |

- Every run goes through the AI image router (add an edit call there) so it is logged in AI usage, priced from
  Settings > AI, and uses the image model picked there. No image price is entered for the Grok image models today;
  the log uses the 7 cent default per picture until one is.
- A run still "working" after 5 minutes is marked failed with Run again (the thread died with a restart).
- **Every AI result keeps its source's shape.** Send Grok the source version (at most 1024 px, JPEG) and, if the
  answer comes back in another shape, fit the whole answer inside the source shape, padding with the backdrop color.
  Never trim the item. Test what Grok returns for 1:1, 4:5 and 16:9 inputs first.
- Register the AI actions on the Image tier in Settings > AI (the Dash #195 pattern: `ai_model(purpose)` in
  `apps/core/ai_config.py`), so the model can be changed there.

### Tested 2026-11-24 (bike photo, `workspace/bg-test/probe.py`, sheet `probe-sheet.jpg`)

- Grok cannot return a see-through picture: asked for a transparent PNG, it sent a JPEG. See-through is ours to make.
- Grok can paint the background color itself (black: clean, about 30 s).
- Our own swap of Grok's white backdrop (every near-white pixel becomes see-through) handled the bike's spokes on
  black and on lime. Weak spots: the soft shadow is left as a pale smudge (carry it over as a real shadow, or ask
  Grok for no shadow when the backdrop will be swapped), and a white or very light item loses its own white parts.
  For those, Remove background on the wanted color is the reliable route.
- Keying only the white that touches the picture's edge leaves white inside wheels and frames. Do not use it alone.
- Grok takes a 1024 px JPEG at most (a large PNG failed) and returns about 864 x 1152. AI versions are fine for the
  phone site and thumbnails, soft for print.
- Shapes (2026-11-24, #209, `workspace/photo-editor-209/shape_probe.py`): Grok answers in the shape it is sent. 1:1
  (1024 x 1024 in) came back 1024 x 1024; 16:9 (1024 x 576) came back 1280 x 720; 4:5 (819 x 1024) came back
  912 x 1136 (0.4% off, padded to 912 x 1140). Asking `/images/edits` for `aspect_ratio: 4:5` is refused (422).

### Data

`ProjectPhotoVersion`: photo, made from (another version, or empty for Raw), kind (edit / ai), action, caption,
prompt (AI), file + thumbnail (`core.S3File`; PNG when see-through, else JPEG), width, height, see-through flag,
status (working / done / failed) + error, made by, made at. `ProjectPhoto.main_version` (empty = newest done, else
Raw). Today's single edited copy (`edited`, `edited_thumbnail`, `edit_kind`, `edit_status`) becomes that photo's first
version in a data migration; the old columns go once the new editor is live.

Edit results are drawn in the browser and uploaded (as the two older editors do). AI runs happen on the server.

### Build order

1. Versions: table, strip, X with Undo, Main star, Download; move today's edited copies in.
2. Edit tab.
3. AI tab through the image router.
4. Run on many: tick photos in a project (or all) and run one AI action or one Edit preset (Crop to content,
   Auto) on them, four at a time. The owner's first ask ("I will dump a bunch of photos in; how can we process
   them all?").

1 to 3 ship together as Dash Update #209; 4 is Dash Update #210, started once #209 ships.

### Rules that apply

- Photos here are taken for selling the item, so they may be used for it. They are still internal until the owner
  says where they go (memory: never reuse internal photos publicly without his call).
- An AI version can differ from the real piece in small ways. Raw is always kept; a person picks Main.
- No fine print or helper notes on the screen; no layout shift (fixed slots for the working tile, the Undo, and the
  phone tool area).
