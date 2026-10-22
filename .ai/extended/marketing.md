<!-- Last updated: 2026-10-22 (Phase 3: the phone app, tag scan, photo overlays) -->
# Social Studio (marketing)

Retail makes and posts one good Facebook post every open day from one screen. Initiative: [`retail_tags_and_social`](../initiatives/retail_tags_and_social.md) Phases 2 and 3. How a creative should look: [`creative-method.md`](creative-method.md).

## App

`apps.marketing`, API `/api/marketing/`. Every staff login can use it; only the owner (superuser) rates posts.

| Model | What it is |
|-------|------------|
| `SocialPhoto` | The photo library ("Photo dump"): a real photo (2048 px JPEG plus a 480 px thumbnail, the receiving photo pattern), optional category, optional item (scan the tag), note, who and when, archived. Photos live apart from posts, so staff stock them on the floor and the poster builds a post later, even from home. Since Phase 3: `tag_overlay` (on by default; draws the item's tag on the photo), `tag_corner` (bl / br / tl / tr), `edited_at` (the photo editor replaced the image). |
| `SocialPost` | One per day (`slot_date`): post type, category, hook, more words, call to action, size (`1:1`, `4:5`: every photo goes out at it), status draft / ready / posted, the Facebook link, who posted and when, the owner's rating 1-5. `layout` is retired (the fixed templates, 2026-10-22) and kept only as a column. `source` (manual / ai) and `ai_brief` wait for the AI post ideas (Phase 4). |
| `SocialPostPhoto` | A library photo in a post, in order. Each goes out as its own image. A photo held by any post counts as used. |

## The week

`services/cadence.py`. One slot per posting day (`marketing.post_weekdays`, Tue-Sat) the store is open (`is_open_day`, so a holiday drops its slot): Tue new this week, Wed category spotlight, Thu coming soon, Fri weekend pick + Thrift+, Sat live from the floor. When the week has closed days, one more **scheduled** slot sits on Sunday (made ahead, goes out while closed). The rows are made the first time a week is opened (this week or later), so a swap sticks. Swap trades two days' type and category.

**Category rotation:** weight = items on the floor in the category now (the product standard category when it is a real one, else the product's) times `marketing.season_weight` when in season. Best first; a category that had a post in the last `marketing.repeat_days` days is skipped unless in season; no category twice in a week. In season: `marketing.in_season`, or when that is blank the calendar (October party and seasonal; Nov-Dec toys and party).

## Always include

A post can be Ready only when all six pass, and each miss is named (`services/posts.py`): 3+ real photos (`marketing.min_photos`), one hook line no longer than `marketing.hook_max_chars` (the caption's first line), address and hours, the Thrift+ line (`marketing.thrift_plus_line`), a call to action, and **product photos show their tag** (every photo with an item has its tag overlay on; scene photos carry none). A photo whose tag is switched off sends a Ready post that uses it back to Draft. Address (`store_address`), hours (`online_sales.hours`) and the Thrift+ line are added to the caption by themselves. A Ready post edited until it fails goes back to Draft; a Posted post is locked except for the rating.

## Photo overlays and Post it

Owner 2026-10-22 (F6): **photo overlays, not templates.** The fixed frames (single, photo + 3, 2 x 2 with a brand bar) are gone. Each post photo goes out on its own at the post's size, the photo filling it, a small store mark on top, and on a product photo the item's **tag** in the corner the poster picks (`pages/studios/social/tagOverlay.ts`, drawn on a canvas, 1080 px wide, saved at 2x as JPEG). The tag's words are the rulebook's: "Retail $x" struck through only when the tag's retail passed the retail check (F1, `inventory.services.tag_retail`), OUR PRICE and the price, "Thrift+ 3-day returns" (W1) or "AS IS" (A1, W9), and "+x.xx ThriftBucks today" over "for Thrift+ members" (a number, never "$", V8; Thrift+ members in view, V10). The facts come from `GET /api/marketing/tag/<sku>/` (`services/tags.py`): the member scanner's item card (price with a store sale, today's ThriftBucks, returns) with the tag's own retail. The scanner card itself still shows an unchecked retail: reported to the Mainline.

**Edit a photo** (`SocialPhotoEditor.tsx`, from a post's photo or the photo's details): crop (to the post's size or free), turn, brightness and contrast with the Online Sales editor's tools (`utils/imageEdit`), the tag switch and corner, and a live look at the photo as it goes out. Saving the picture replaces it for every post (`POST /api/marketing/photos/<id>/image/`; the old file stays in storage); images are fetched with `?v=<edited_at>` because an edit keeps the address.

**Post it** (copy and paste for now, owner call F5): one tap copies the caption (blank lines keep a U+2800 so Facebook keeps the spacing) and hands the photos to the phone's share sheet, or downloads them on a desk. Then the poster pastes the Facebook link to mark it Posted. That closes the day's Today's post routine run.

## Today's post routine

Seeded by `routines/0029_social_post_routine`: kind `social_post`, no `system_key` (out of Retail QA grading), Retail department, one shared run, due 11:30 (late morning), expires end of day. It is made only on posting days the store is open. The runner shows today's post and opens it in the Studio; Submit waits until the post is Posted, and marking it Posted closes the run by itself. The owner moves the time with Hard nag at in Routine Control.

## The phone app

Owner 2026-10-22 (F7): **Social Studio installs as its own home-screen app** at `/social` (`SocialApp.tsx`; manifest and icons in `frontend/public/social/`, id and scope `/social/`, brand green; staff sign-in, outside MainLayout, like Thrift+ Staff). A bar at the bottom: **Post** (today's post), **Photos**, **Scan**, **Schedule** (the week) and **Me**. Tabs switch in place. The same pages as in Dash (`studioPaths.tsx` tells them where they live); Dash's Studio header has a **Phone app** link. Android shows Install in the app's top bar; an iPhone says Share → Add to Home Screen.

**Scan** (`SocialScanPage.tsx`): the member scanner's camera card (`useQrCamera`, with its Tag number box) reads a tag; the card shows the item, its price, checked retail, returns and ThriftBucks; **Take photos of it** files them in the library with the item, tag on; **Add to today's post** puts them in today's post.

## Pages

| Page | Path (Dash / app) | Desk | Phone |
|------|------|------|-------|
| Week | `/studios/social` / `/social/week` | 7 columns (4 under 1200 px), owner rating on posted days | Day list, today first, earlier days below |
| Photos | `/studios/social/photos` / `/social/photos` | Upload card beside the grid | Camera first (opens by itself with `?camera=1`), grid of 3; Scan tag opens the Scan tab |
| Post | `/studios/social/post/:id` / `/social/post`, `/social/post/:id` | Photos on the left (2 to 3 across), the idea, words, checks and Post it on the right | The steps one under the other, photos 2 across |
| Scan | `/social/scan` | Phone only (a desk types the tag on Photos) | Camera, then the item card |

## Settings

Settings > Store > Social Studio: `marketing.post_weekdays` (Tue-Sat), `marketing.min_photos` (3), `marketing.hook_max_chars` (80), `marketing.repeat_days` (14), `marketing.in_season` (blank = calendar), `marketing.season_weight` (2), `marketing.thrift_plus_line`. All are starting guesses.
