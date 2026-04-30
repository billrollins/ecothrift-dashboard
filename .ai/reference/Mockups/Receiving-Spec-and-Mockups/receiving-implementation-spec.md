# Receiving Page - Full Implementation Spec

This document covers both the **mobile** and **desktop** receiving flows. Both create the same receiving record on the backend and hit the same API endpoints. The difference is the capture method (live camera vs file upload) and the interaction pattern (linear wizard vs single-page workspace).

Accompanying this document are two JSX mockups: `receiving-mobile.jsx` and `receiving-desktop.jsx`. These render as interactive prototypes inside Claude's artifact viewer or any React environment. They demonstrate the full visual design, layout, interaction flow, and component structure. Use them as the pixel-level reference for implementation.

---

## Data Model

Before building UI, the backend needs a receiving model. If one doesn't exist yet, here's what it needs to support:

### ReceivingRecord
- `order` (FK to PurchaseOrder, one receiving record per order)
- `received_date` (date)
- `start_time` (time, auto-recorded when receiving begins)
- `end_time` (time, auto-recorded when receiving completes)
- `condition` (choices: Good, Mixed, Damaged)
- `issues` (text, optional)
- `pallet_count` (integer)
- `bol_photo` (FK to uploaded photo / S3File)
- `truck_photo` (FK to uploaded photo / S3File)
- `created_by` (FK to user)
- `created_at` (auto)

### ReceivingPallet
- `receiving_record` (FK to ReceivingRecord)
- `pallet_number` (integer, 1-indexed)
- `damaged` (boolean, default false)
- `photo_front` (FK to uploaded photo / S3File)
- `photo_right` (FK to uploaded photo / S3File)
- `photo_back` (FK to uploaded photo / S3File)
- `photo_left` (FK to uploaded photo / S3File)

Photo uploads should use whatever pattern the app already uses for file storage (likely S3 via the existing S3File model).

---

## Shared Behavior (Both Mobile and Desktop)

### Timestamps are automatic
- `start_time` is captured the moment the user selects an order and begins receiving. No manual time entry.
- `end_time` is captured the moment the user taps/clicks "Complete Receiving." No manual time entry.
- Both are editable after the fact on the desktop version in case corrections are needed, but the default path is fully automatic.

### Status integration
- When a receiving record is completed, the system should call the existing `POST /inventory/orders/:id/deliver/` endpoint (not a plain PATCH) to mark the order as delivered. This triggers the check-in queue build from the manifest.
- Pass the `received_date` as the delivered date.

### Photo storage
- All photos upload to the same storage backend (S3).
- Photos should be associated with the receiving record, not directly with the order.
- Pallet photos are stored per-side (front, right, back, left) so they can be reviewed individually later.

### Damage tracking is per-pallet
- Each pallet has its own damage flag, independent of the overall condition field.
- The overall condition (Good/Mixed/Damaged) is a summary assessment of the whole shipment.
- Individual pallet damage flags identify which specific pallets had issues.
- Both pieces of data are stored and both are useful downstream.

---

## Mobile Flow

### Context
Someone is standing at a loading dock. Truck is backing in. They have their phone in one hand. It's bright outside or dim in the warehouse. They need to move fast. Every screen has one job. Every tap target is 56px minimum.

### Visual design
- Dark theme throughout (dark navy/slate backgrounds, white text). This is critical for outdoor dock visibility in direct sunlight.
- High contrast status indicators (green for complete, red for damage, blue for in-progress).
- Large typography for pallet numbers and counts.
- Minimal text, maximum visual communication.

### Screen-by-screen flow

#### Screen 1: Order Selection
- List of pending/undelivered orders.
- Each order shows: order ID (monospace), vendor name, and short description.
- Tap an order to select it.
- On selection: auto-record `received_date` (today) and `start_time` (now). Advance to Screen 2.
- No typing on this screen.

#### Screen 2: BOL Photo
- Full-screen camera viewfinder area.
- Single large shutter button at the bottom (72px diameter, white ring with white fill).
- Label above viewfinder: "BOL Document" with subtitle "Photograph the Bill of Lading."
- On capture: photo is saved, auto-advance to Screen 3.
- Below the shutter button: "Choose file instead" link as a fallback. This opens the native file picker. Use case: someone texted the BOL photo or it was taken on a different device.
- Back button in header returns to order selection.

#### Screen 3: Truck Photo
- Identical layout to Screen 2.
- Label: "Truck as opened" with subtitle "Full view of the open trailer."
- On capture: auto-advance to Screen 4.
- Same "Choose file instead" fallback.

#### Screen 4: Pallet Count
- Centered layout with a large package icon.
- Question: "How many pallets?"
- Large number input (48px font, monospace, centered). Numeric keypad only (`inputMode="numeric"`).
- Max 2 digits (1-99).
- Below the input: a confirmation button that dynamically updates text: "Set up {n} pallets" when a valid number is entered, "Enter count" when empty.
- Button is disabled/dimmed until a valid count is entered.
- On confirm: generate pallet slots and advance to Screen 5.

#### Screen 5: Pallet Grid
- Header shows "Pallets" with a back button and a progress indicator / "Continue" button on the right.
- Below the header: a thin progress bar showing completion percentage (animated width transition).
- Below progress bar: three stat boxes in a row: "Done" (blue, count of completed pallets), "Remaining" (white, count of incomplete pallets), "Damaged" (red background tint when > 0, count of flagged pallets).
- Main area: a 3-column grid of pallet cards.
- Each pallet card shows:
  - Pallet number (large monospace)
  - Four small dots representing the four sides (filled blue/green when photo taken, dark gray when empty)
  - A checkmark overlay when all 4 photos are complete
  - A red "!" badge in the corner if flagged as damaged
  - Border color reflects state: green if complete, blue if partial, red if damaged, dark gray if empty
- Pallets can be tapped in any order (non-sequential completion supported).
- Tapping a pallet goes to Screen 6 for that pallet.
- "Continue" button in the header only activates (turns green) when ALL pallets have all 4 photos. Tapping it goes to Screen 7.

#### Screen 6: Pallet Photo Capture
- Header shows "Pallet {n}" with back button and a damage flag toggle button.
- The flag button says "Flag" when inactive (gray). When toggled on, it turns red and says "Damaged." Tapping toggles the state.
- Below the header: a side indicator bar showing all four sides (Front, Right, Back, Left) as tab-like elements. The current side is highlighted. Completed sides show a checkmark prefix.
- Main area: same camera viewfinder/shutter layout as BOL and truck screens.
- Label shows the current side name: "Front side", "Right side", etc.
- On capture: photo is saved for this pallet+side, auto-advance to the next side. After the 4th side (Left), auto-return to the pallet grid (Screen 5).
- "Upload" fallback button at bottom (same as other camera screens).
- "Back to grid" button next to upload button to exit early without completing all 4 sides.

#### Screen 7: Wrap-up
- Header: "Wrap Up" with back button.
- Summary card at top showing: Order ID, pallet count, total photos taken, damaged pallet count (if any, in red).
- Overall Condition: three large tappable buttons side by side. Each has an emoji and label:
  - Good (👍, green when active)
  - Mixed (⚠️, amber when active)
  - Damaged (🚨, red when active)
- Active state: colored border + tinted background. Only one can be selected.
- Issues / Notes: a textarea with a "Voice" button in the section header. The Voice button should trigger the browser's speech recognition API (`webkitSpeechRecognition` / `SpeechRecognition`) for voice-to-text input. This is critical because typing on a loading dock is miserable. The textarea is the fallback for manual typing.
- "Complete Receiving" button at the bottom. Full width, green, large (18px padding). Disabled until a condition is selected. On tap: record `end_time`, submit everything, advance to Screen 8.

#### Screen 8: Completion
- Centered layout with a large green checkmark in a circle.
- "Receiving Complete" heading.
- "{Order ID} has been received" subtitle.
- Summary card listing: Date, Duration (start - end), Pallets, Photos, Condition, Damaged count (if any).
- If issues/notes were entered, show them in a separate card below.
- "Back to Orders" button at the bottom to return to Screen 1 and reset all state.

### Mobile-specific implementation notes

**Camera API:** Use `navigator.mediaDevices.getUserMedia()` for live camera access with the rear-facing camera (`{ video: { facingMode: "environment" } }`). If the browser doesn't support camera access (or the user denies permission), fall back to a file input with `capture="environment"` attribute.

**Auto-save:** Save the entire receiving state to localStorage on every change (debounced at 1 second). Key by order ID. On app load, check for saved state and offer to resume: "You have an unfinished receiving session for {Order ID}. Resume?" If yes, restore state and jump to the appropriate screen. If no, clear saved state and start fresh.

**Offline support:** Photos should be stored locally (IndexedDB, not localStorage, because photos will exceed localStorage size limits) and uploaded when connectivity is available. The receiving flow should work entirely offline and sync when back online. Show a subtle "offline" indicator in the header when disconnected, and a "syncing" indicator when uploading.

**Haptic feedback:** If the device supports it (`navigator.vibrate`), trigger a short vibration (50ms) on photo capture for tactile confirmation.

**Screen wake lock:** Request a screen wake lock (`navigator.wakeLock.request('screen')`) when the receiving flow is active to prevent the phone from sleeping mid-receiving. Release it on completion or when leaving the page.

---

## Desktop Flow

### Context
Staff went out, took photos with their phone, but didn't use the app. Now they're at a computer with photos transferred to a folder on their desktop. They need to create the receiving record retroactively. Everything happens on one screen. The primary interaction is drag-and-drop from Finder/Explorer.

### Visual design
- Light theme matching the rest of the dashboard (light gray background, white panels).
- Same font family as the rest of the app (DM Sans + DM Mono for order IDs).
- Dense but organized layout. No wasted space but clear visual separation between sections.

### Page layout

Full viewport height, no page-level scrolling. The page is divided into three horizontal zones:

**Top bar (56px, white, full width):**

Left side:
- Truck icon + "Receiving" as page title.
- Vertical divider.
- Order selector dropdown. Shows currently selected order ID and vendor in a compact button. Click to open dropdown with all pending orders. Each option shows vendor badge, order ID (monospace), and description. On selection: auto-populate received date (today) and start time (now). Dropdown closes on selection or click-outside.

Right side:
- Live stats (only visible once pallets are set up): "{completed}/{total} pallets", "{n} photos", and "{n} damaged" in red if applicable.
- "Complete Receiving" button. Disabled (gray) until: order is selected, condition is chosen, and all pallets have 4 photos. When active, turns green.

**Left panel (320px, white, fixed, independently scrollable):**

Contains all non-photo metadata, stacked vertically:

1. **Date & Time:** Received Date (date input, defaults to today). Start time (text input, auto-filled on order select, editable). End time (text input, auto-filled on complete, editable). Start and End sit side by side in a row.

2. **Bill of Lading:** Single drop zone (~100px tall). Drop one image or click to browse. Shows thumbnail with remove button when filled.

3. **Truck Photo:** Same as BOL. Single image drop zone.

4. **Pallet Count:** Number input (monospace, large) + "Set" button side by side. Entering a number and clicking Set generates pallet cards in the right panel. If pallets already exist and the count changes:
   - Higher number: append new empty pallets, keep existing data.
   - Lower number: warn "This will remove pallets {n+1} through {current}. Continue?" before truncating.
   - Same number: do nothing.

5. **Condition:** Three buttons in a row: Good (👍), Mixed (⚠️), Damaged (🚨). Same interaction as mobile: one active at a time, colored border + tint when active.

6. **Issues / Notes:** Textarea, 4 rows, resizable. Optional free text.

**Right panel (remaining width, light gray background, independently scrollable):**

This is where all the pallet work happens.

**Empty state:** When no pallets are set up, show a centered placeholder with a truck icon, "No pallets set up" heading, and "Select an order and set the pallet count to begin" subtitle.

**Quick Fill bar (top of right panel when pallets exist):**

This is the most important feature of the desktop version.

- Full-width drop zone with a lightning bolt icon and text: "Quick Fill: Drop all pallet photos here"
- Subtitle: "Photos auto-assign sequentially: Pallet 1 (F, R, B, L), Pallet 2 (F, R, B, L), ..."
- On drag-over: bar expands slightly and border turns blue.
- On drop: distribute all dropped image files sequentially into empty pallet slots. Assignment order: Pallet 1 Front, Pallet 1 Right, Pallet 1 Back, Pallet 1 Left, Pallet 2 Front, Pallet 2 Right, Pallet 2 Back, Pallet 2 Left, and so on. Skip slots that already have photos. Extra files beyond what can be assigned are ignored.
- Also clickable: opens a multi-file picker that uses the same sequential distribution logic.
- Files are processed in the order the OS provides (typically alphabetical by filename). If photos are named sequentially (IMG_0001, IMG_0002...), auto-assignment will naturally match capture order. Worth noting in a tooltip or help text.

**Pallet grid (below Quick Fill bar):**

CSS grid: `repeat(auto-fill, minmax(200px, 1fr))`, 12px gap. Adapts to available width. Roughly 5-6 cards per row at 1920px, 4 at 1280px.

**Individual pallet card structure:**

Header row:
- Pallet number in bold monospace (e.g. "#1")
- Photo count ("2/4")
- Checkmark icon when complete (4/4)
- Damage flag toggle button on the right. Small, subtle when inactive ("Flag" + flag icon, gray). Turns red with "DMG" text when toggled on.
- Header background tints: green when complete, red when damaged, white otherwise.
- Card border: green when complete, red when damaged, light gray otherwise.

Photo grid:
- 2x2 grid inside the card.
- Each cell is one side: Front (top-left), Right (top-right), Back (bottom-left), Left (bottom-right).
- Approximately 4:3 aspect ratio per cell.
- Empty cell: small drop zone showing the side label in gray text. Accepts one image via drag-and-drop or click-to-browse.
- Filled cell: thumbnail preview with a small X button (top-right corner) to remove the photo.
- Dropping onto a filled cell replaces the existing photo.
- Dropping multiple files on a single cell: only the first file is used.

### Desktop-specific implementation notes

**File handling:** Use `URL.createObjectURL()` to generate thumbnail previews from dropped File objects. This is faster than reading files as data URLs and doesn't block the main thread. Store the File objects in React state for later upload. Revoke object URLs on component unmount to prevent memory leaks.

**Batch upload on completion:** Do NOT upload photos individually as they're dropped. Store everything locally and batch-upload when the user clicks "Complete Receiving." This keeps the interaction snappy, avoids partial uploads if the user abandons the session, and reduces API calls. During upload:
- Show a progress overlay with a counter: "Uploading 34/98 photos..."
- Upload in parallel with a concurrency limit of 4 requests.
- On individual upload failure: retry once automatically.
- If retry fails: continue with remaining uploads, then show a summary: "95/98 photos uploaded. 3 failed." with a "Retry Failed" button.
- On full success: create the receiving record with references to all uploaded photo IDs, then redirect or show confirmation.

**State persistence:** Auto-save to IndexedDB (not localStorage, because photo blobs will exceed localStorage's ~5MB limit) on every change, debounced at 1 second. Key by order ID. On page load, if saved state exists for any order, show a banner: "Resume unfinished receiving for {Order ID}?" Restore state including photo blobs on confirmation. Clear saved state after successful submission.

**Drag-and-drop edge cases:**
- Non-image files dropped anywhere should be silently ignored (no error toast).
- Dragging from one pallet cell to another is NOT required (no internal drag-and-drop reordering). Users remove and re-add if they need to swap.
- Dragging a folder is not supported by browser file APIs. If a user tries, nothing happens. This is fine and does not need special handling.

**File validation:** Accept `image/*` MIME types only. If the backend has a file size limit, validate each file before upload and warn the user about any that exceed it. Do not block the entire upload for one oversized file; skip it and report at the end.

---

## Relationship Between Mobile and Desktop

Both flows write to the same `ReceivingRecord` and `ReceivingPallet` models. If a record already exists for an order (created via mobile), the desktop page should load it in edit mode: show existing photos as thumbnails, allow adding missing photos or replacing existing ones, and allow updating metadata fields. The reverse should also work: if someone starts on desktop and wants to add a photo from their phone later, the mobile flow should detect the existing record and offer to continue it.

For the initial launch, it's acceptable if both flows are create-only (no edit mode). But the data model should support it from day one so the UI can be added later without schema changes.

---

## API Endpoints Needed

If these don't exist yet, they need to be created:

1. `POST /inventory/orders/:id/receiving/` - Create a receiving record for an order.
2. `PATCH /inventory/orders/:id/receiving/` - Update an existing receiving record.
3. `POST /inventory/orders/:id/receiving/photos/` - Upload a photo and return its ID. Accept multipart form data with the file and metadata (type: bol/truck/pallet, pallet_number if applicable, side if applicable).
4. `GET /inventory/orders/:id/receiving/` - Retrieve existing receiving record with all pallet data and photo URLs.
5. `DELETE /inventory/orders/:id/receiving/photos/:photoId/` - Remove a single photo.

The `POST /inventory/orders/:id/deliver/` endpoint already exists and should be called automatically when receiving is completed to trigger the check-in queue build.

---

## What This Page Does NOT Do

- No manifest processing or line-item verification. That's a separate workflow.
- No cost data entry. Costs live on the order detail page.
- No status management beyond recording the receiving event and triggering the deliver endpoint.
- No item-level tracking. This captures the physical reality of what showed up on the truck at the pallet level, not the item level.

This page captures: what showed up, when it showed up, what condition it was in, and photo evidence of every pallet from every angle.
