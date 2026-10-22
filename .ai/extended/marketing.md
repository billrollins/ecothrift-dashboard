<!-- Last updated: 2026-10-21 (Social Studio, Lane F Phase 2) -->
# Social Studio (marketing)

Retail makes and posts one good Facebook post every open day from one screen. Initiative: [`retail_tags_and_social`](../initiatives/retail_tags_and_social.md) Phase 2. How a creative should look: [`creative-method.md`](creative-method.md).

## App

`apps.marketing`, API `/api/marketing/`. Every staff login can use it; only the owner (superuser) rates posts.

| Model | What it is |
|-------|------------|
| `SocialPhoto` | The photo library ("Photo dump"): a real photo (2048 px JPEG plus a 480 px thumbnail, the receiving photo pattern), optional category, optional item (scan the tag), note, who and when, archived. Photos live apart from posts, so staff stock them on the floor and the poster builds a post later, even from home. |
| `SocialPost` | One per day (`slot_date`): post type, category, hook, more words, call to action, template (`hero`, `hero3`, `grid4`), size (`1:1`, `4:5`), status draft / ready / posted, the Facebook link, who posted and when, the owner's rating 1-5. `source` (manual / ai) and `ai_brief` are hooks for the Phase 3 daily AI draft; nothing writes them yet. |
| `SocialPostPhoto` | A library photo in a post, in order. The first ones fill the template's photo zones; any more go out as extra framed images. A photo held by any post counts as used. |

## The week

`services/cadence.py`. One slot per posting day (`marketing.post_weekdays`, Tue-Sat) the store is open (`is_open_day`, so a holiday drops its slot): Tue new this week, Wed category spotlight, Thu coming soon, Fri weekend pick + Thrift+, Sat live from the floor. When the week has closed days, one more **scheduled** slot sits on Sunday (made ahead, goes out while closed). The rows are made the first time a week is opened (this week or later), so a swap sticks. Swap trades two days' type and category.

**Category rotation:** weight = items on the floor in the category now (the product standard category when it is a real one, else the product's) times `marketing.season_weight` when in season. Best first; a category that had a post in the last `marketing.repeat_days` days is skipped unless in season; no category twice in a week. In season: `marketing.in_season`, or when that is blank the calendar (October party and seasonal; Nov-Dec toys and party).

## Always include

A post can be Ready only when all six pass, and each miss is named (`services/posts.py`): 3+ real photos (`marketing.min_photos`), one hook line no longer than `marketing.hook_max_chars`, address and hours, the Thrift+ line (`marketing.thrift_plus_line`), a call to action, and the brand frame with every photo zone filled. Address (`store_address`), hours (`online_sales.hours`) and the Thrift+ line are added to the caption by themselves. A Ready post edited until it fails goes back to Draft; a Posted post is locked except for the rating.

## The frame and Post it

The frame is drawn on a canvas in the browser (`pages/studios/social/socialFrame.ts`): the hook in big green type, the photo zones, and a brand-green bar with the logo, address, hours and a short Thrift+ line. Live type over real photos, no AI products, no money pictures. 1080 px wide, saved at 2x (4:5 = 2160 x 2700 PNG); 9:16 is in the code for later channels. Photos are fetched from `/api/marketing/photos/<id>/image/` so the canvas can export them.

**Post it** (copy and paste for now, owner call F5): one tap copies the caption (blank lines keep a U+2800 so Facebook keeps the spacing) and hands the PNGs to the phone's share sheet, or downloads them on a desk. Then the poster pastes the Facebook link to mark it Posted. That closes the day's Today's post routine run.

## Today's post routine

Seeded by `routines/0029_social_post_routine`: kind `social_post`, no `system_key` (out of Retail QA grading), Retail department, one shared run, due 11:30 (late morning), expires end of day. It is made only on posting days the store is open. The runner shows today's post and opens it in the Studio; Submit waits until the post is Posted, and marking it Posted closes the run by itself. The owner moves the time with Hard nag at in Routine Control.

## Pages

| Page | Path | Desk | Phone |
|------|------|------|-------|
| Week | `/studios/social` | 7 columns (4 under 1200 px), owner rating on posted days | Day list, today first, earlier days below |
| Photos | `/studios/social/photos` | Upload card beside the grid | Camera first (opens by itself with `?camera=1`), grid of 3 |
| Post | `/studios/social/post/:id` | Frame on the left, steps on the right | Frame on top, then the steps |

## Settings

Settings > Store > Social Studio: `marketing.post_weekdays` (Tue-Sat), `marketing.min_photos` (3), `marketing.hook_max_chars` (80), `marketing.repeat_days` (14), `marketing.in_season` (blank = calendar), `marketing.season_weight` (2), `marketing.thrift_plus_line`. All are starting guesses.
