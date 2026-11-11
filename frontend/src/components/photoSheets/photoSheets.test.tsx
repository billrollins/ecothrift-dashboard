import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PhotoSheetFields, PhotoSheetItem } from '../../api/photoSheets.api';
import { PhotoSheetPaper, brandLine, titleLines } from './PhotoSheetPaper';
import { printCss } from './PhotoSheetPrint';
import { addPhotos, emptySheet, mergeAiDraft, swapPhotos, turnPhoto, withPhotos } from './sheetEdits';
import { TITLE_FIT, fitTitle, isWide, printedFacts, titleFitFor, type SheetPhoto } from './sheetLayouts';
import { PHOTO_GAP, photoAspect, pickLayout, planPhotos, planSheet } from './sheetPlan';
import { findPicturesUrl, pictureLinkFrom, printQuality } from './sheetPaste';

const WIDE = { width: 2048, height: 1536, turn: 0 };
const TALL = { width: 1536, height: 2048, turn: 0 };
const photo = (file: number, shape = WIDE): SheetPhoto => ({ file, ...shape, fit: 'fit' });
const ITEM: PhotoSheetItem = { id: 7, sku: 'ITM0226451', price: '210.00', status: 'on_shelf', condition: 'like_new' };

function sheet(overrides: Partial<PhotoSheetFields> = {}): PhotoSheetFields {
  return {
    ...emptySheet(),
    title: 'Upholstered Convertible Sleeper Sofa',
    brand: 'Ebern Designs',
    facts: { size: '78 x 34 x 33 in', in_box: '', condition: 'Like new', good_to_know: '' },
    photos: [photo(1)],
    ...overrides,
  };
}

const paper = (fields: PhotoSheetFields, item: PhotoSheetItem | null = ITEM) =>
  render(<PhotoSheetPaper fields={fields} item={item} photoUrl={(file) => `blob:photo-${file}`} />);

describe('the template Dash picks (D24)', () => {
  it('goes by how many photos there are', () => {
    expect(pickLayout([]).layout).toBe('one');
    expect(pickLayout([WIDE]).layout).toBe('one');
    expect(pickLayout([WIDE, TALL]).layout).toBe('two');
    expect(pickLayout([WIDE, TALL, TALL]).layout).toBe('big2');
    expect(pickLayout([WIDE, TALL, TALL, TALL]).layout).toBe('big3');
  });

  it('turns the paper the way that gives the photos more of it', () => {
    // One upright phone photo: an upright sheet. A very wide photo (a sofa from the front): sideways.
    expect(pickLayout([TALL]).orientation).toBe('portrait');
    expect(pickLayout([{ width: 2500, height: 1000, turn: 0 }]).orientation).toBe('landscape');
    // Upright phone photos, several: an upright sheet.
    expect(pickLayout([TALL, TALL, TALL]).orientation).toBe('portrait');
  });

  it('reads a turned photo the way it sits on the sheet', () => {
    expect(isWide({ ...TALL, turn: 90 })).toBe(true);
    expect(isWide({ ...WIDE, turn: 270 })).toBe(false);
    expect(isWide({ width: 1000, height: 1000, turn: 0 })).toBe(false);
  });

  it('keeps picking until the processor picks a layout, then leaves it alone', () => {
    const two = withPhotos(emptySheet(), [photo(1), photo(2)], false);
    expect(two.layout).toBe('two');
    expect(withPhotos({ ...two, layout: 'grid4' }, [photo(1), photo(2), photo(3)], true).layout).toBe('grid4');
  });
});

describe('the photos fill the sheet (round 1: "the photos float in white space")', () => {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

  it('each space takes the shape of its photo on Fit, so no photo sits in a white band', () => {
    const plan = planPhotos('big3', [photo(1, TALL), photo(2, WIDE), photo(3, TALL), photo(4, WIDE)], 7.7, 6.5);
    expect(plan.rects).toHaveLength(4);
    plan.rects.forEach((rect, n) => expect(close(rect.w / rect.h, photoAspect([TALL, WIDE, TALL, WIDE][n]))).toBe(true));
  });

  it('the block runs the full width or the full height of its box, never floating short of both', () => {
    for (const layout of ['one', 'two', 'big2', 'big3', 'grid4'] as const) {
      const plan = planPhotos(layout, [photo(1), photo(2, TALL), photo(3), photo(4, TALL)], 7.7, 6.5);
      expect(close(plan.width, 7.7) || close(plan.height, 6.5)).toBe(true);
      expect(plan.width).toBeLessThanOrEqual(7.71);
      expect(plan.height).toBeLessThanOrEqual(6.51);
    }
  });

  it('a row shares one height and lines up edge to edge, with even gaps', () => {
    const plan = planPhotos('big3', [photo(1), photo(2), photo(3, TALL), photo(4)], 7.7, 6.5);
    const small = plan.rects.slice(1);
    const sameTop = small.every((r) => close(r.y, small[0].y)) && small.every((r) => close(r.h, small[0].h));
    const sameLeft = small.every((r) => close(r.x, small[0].x)) && small.every((r) => close(r.w, small[0].w));
    // On top of a row, or on the left of a column: either way the small ones share an edge.
    expect(sameTop || sameLeft).toBe(true);
    if (sameTop) expect(close(small[1].x - (small[0].x + small[0].w), PHOTO_GAP)).toBe(true);
  });

  it('Fill crops a photo to the even shape of the grid', () => {
    const plan = planPhotos('grid4', [1, 2, 3, 4].map((n) => ({ ...photo(n, n % 2 ? TALL : WIDE), fit: 'fill' as const })), 7.7, 6.5);
    const sizes = plan.rects.map((r) => `${r.w.toFixed(2)}x${r.h.toFixed(2)}`);
    expect(new Set(sizes).size).toBe(1);
  });

  it('places only the photos there are: a template never prints an empty hole', () => {
    expect(planPhotos('grid4', [photo(1)], 7.7, 6.5).rects).toHaveLength(1);
    expect(planPhotos('one', [photo(1), photo(2)], 7.7, 6.5).rects).toHaveLength(1);
  });

  it('a wide sheet puts the words beside the photos when that gives the photos more paper', () => {
    const wide = planSheet({ layout: 'big3', orientation: 'landscape', photos: [photo(1, TALL), photo(2), photo(3), photo(4)], body: { w: 10.2, h: 6 }, factsBelow: 1.6, factsBeside: [3.4, 3, 2.6], hasFacts: true });
    expect(wide.facts).toBe('beside');
    const tall = planSheet({ layout: 'one', orientation: 'portrait', photos: [photo(1)], body: { w: 7.7, h: 8.4 }, factsBelow: 1.3, factsBeside: [4.4, 3.8, 3.5], hasFacts: true });
    expect(tall.facts).toBe('below');
  });
});

describe('the title fit (D23)', () => {
  // About one line per 30 characters at 60 pt, more at a smaller size.
  const linesFor = (chars: number) => (pt: number) => Math.ceil(chars / ((30 * 60) / pt));

  it('prints a short title at the top size on one line', () => {
    expect(fitTitle(linesFor(15))).toEqual({ pt: TITLE_FIT.max, lines: 1 });
  });

  it('shrinks a longer title to fit two lines', () => {
    const fit = fitTitle(linesFor(80));
    expect(fit.lines).toBe(2);
    expect(fit.pt).toBeLessThan(TITLE_FIT.max);
    expect(fit.pt).toBeGreaterThanOrEqual(TITLE_FIT.twoLineFloor);
  });

  it('goes to three lines at most before it gets too small', () => {
    const fit = fitTitle(linesFor(130));
    expect(fit.lines).toBe(3);
    expect(fit.pt).toBeGreaterThanOrEqual(TITLE_FIT.threeLineFloor);
  });

  it('never cuts a title too long even for three lines: it wraps at the smallest size', () => {
    const fit = fitTitle(linesFor(400));
    expect(fit.pt).toBe(TITLE_FIT.min);
    expect(fit.lines).toBeGreaterThan(3);
  });

  it('starts smaller on sideways paper, so the photos keep most of the sheet', () => {
    expect(fitTitle(linesFor(10), titleFitFor('landscape')).pt).toBe(44);
    // Sideways, a title that fits one line at 34 pt or more takes one line: that line is photo height.
    expect(fitTitle(linesFor(40), titleFitFor('landscape')).lines).toBe(1);
    expect(fitTitle(linesFor(40)).lines).toBe(2);
  });

  it('prints the whole title on the sheet, word for word', () => {
    const long = '4-in-1 Convertible L Shaped Sleeper Sofa with Pull Out Bed and Storage Chaise, Linen Sectional Couch for Living Room, Dark Grey';
    paper(sheet({ title: long }));
    expect(screen.getByTestId('photo-sheet-title')).toHaveTextContent(long);
  });

  it('prints a short plain name big and the full title under it', () => {
    const long = '4-in-1 Convertible L Shaped Sleeper Sofa with Pull Out Bed and Storage Chaise, Linen';
    expect(titleLines({ title: long, name: 'L-shaped sleeper sofa' })).toEqual({ big: 'L-shaped sleeper sofa', full: long });
    expect(titleLines({ title: 'Toaster', name: '' })).toEqual({ big: 'Toaster', full: '' });
    paper(sheet({ title: long, name: 'L-shaped sleeper sofa' }));
    expect(screen.getByTestId('photo-sheet-title')).toHaveTextContent('L-shaped sleeper sofa');
    expect(screen.getByTestId('photo-sheet-full-title')).toHaveTextContent(long);
  });

  it('prints the brand once: not above a title that starts with it', () => {
    expect(brandLine('Cuisinart', 'Cuisinart Grind and Brew Coffee Maker')).toBe('');
    expect(brandLine('Cuisinart', '4-Slice Toaster')).toBe('Cuisinart');
    expect(brandLine('  ', 'Toaster')).toBe('');
  });
});

describe('the facts (D23)', () => {
  it('an empty fact does not print, label included', () => {
    paper(sheet());
    const facts = screen.getByTestId('photo-sheet-facts');
    expect(within(facts).getByText('Size')).toBeInTheDocument();
    expect(within(facts).getByText('78 x 34 x 33 in')).toBeInTheDocument();
    expect(within(facts).queryByText('In the box')).not.toBeInTheDocument();
    expect(within(facts).queryByText('Good to know')).not.toBeInTheDocument();
    expect(printedFacts({ size: ' ', in_box: 'Sofa, 2 pillows' }).map((fact) => fact.label)).toEqual(['In the box']);
  });

  it('condition is its own bold line under the title', () => {
    paper(sheet());
    expect(screen.getByTestId('photo-sheet-condition')).toHaveTextContent('Condition: Like new');
    expect(within(screen.getByTestId('photo-sheet-facts')).queryByText('Condition')).not.toBeInTheDocument();
  });

  it('with no facts at all, no facts block and no rule', () => {
    paper(sheet({ facts: { size: '', in_box: '', condition: '  ', good_to_know: '' } }));
    expect(screen.queryByTestId('photo-sheet-facts')).not.toBeInTheDocument();
  });
});

describe('the tick boxes (D25)', () => {
  it('print nothing from the tag unless ticked', () => {
    paper(sheet());
    expect(screen.queryByTestId('photo-sheet-tag')).not.toBeInTheDocument();
    expect(screen.queryByText('$210.00')).not.toBeInTheDocument();
    expect(screen.queryByText('ITM0226451')).not.toBeInTheDocument();
  });

  it('print the price and the item number with its barcode when ticked', () => {
    paper(sheet({ show_price: true, show_item_number: true }));
    expect(screen.getByTestId('photo-sheet-price')).toHaveTextContent('$210.00');
    const number = screen.getByTestId('photo-sheet-item-number');
    expect(number).toHaveTextContent('ITM0226451');
    expect(number.querySelector('svg')).not.toBeNull();
  });

  it('print only the one that is ticked', () => {
    paper(sheet({ show_price: true }));
    expect(screen.getByTestId('photo-sheet-price')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-sheet-item-number')).not.toBeInTheDocument();
  });

  it('print nothing on a sheet with no item, even if ticked', () => {
    paper(sheet({ show_price: true, show_item_number: true }), null);
    expect(screen.queryByTestId('photo-sheet-tag')).not.toBeInTheDocument();
  });
});

describe('photos on the sheet (D24)', () => {
  it('fill the spaces of the template in order, a Fit photo never more than a hair cropped', () => {
    paper(sheet({ layout: 'big2', photos: [photo(1), photo(2), { ...photo(3), fit: 'fill' }] }));
    expect(screen.getAllByTestId(/^photo-sheet-slot-/)).toHaveLength(3);
    expect(screen.getByTestId('photo-sheet-slot-0').querySelector('img')!).toHaveAttribute('src', 'blob:photo-1');
    expect(screen.getByTestId('photo-sheet-slot-2').querySelector('img')!.style.objectFit).toBe('cover');
    // A Fit photo's space keeps the photo's shape, give or take the stretch that closes a gap (22% at most).
    const plan = planSheet({ layout: 'big2', orientation: 'portrait', photos: [photo(1), photo(2, TALL), photo(3)], body: { w: 7.7, h: 7 }, factsBelow: 1.2, factsBeside: [3, 3, 3], hasFacts: true });
    plan.photos.rects.forEach((rect, n) => {
      const ratio = (rect.w / rect.h) / photoAspect([WIDE, TALL, WIDE][n]);
      expect(ratio).toBeGreaterThan(0.81);
      expect(ratio).toBeLessThan(1.23);
    });
  });

  it('never prints an empty space as a box on paper', () => {
    paper(sheet({ layout: 'grid4', photos: [photo(1)] }));
    expect(screen.queryByTestId('photo-sheet-slot-1')).not.toBeInTheDocument();
  });

  it('a new photo starts on Fit; swap and turn keep each photo its own', () => {
    const photos = addPhotos([], [{ file: 1, width: 10, height: 8 }, { file: 2, width: 8, height: 10 }]);
    expect(photos.map((p) => p.fit)).toEqual(['fit', 'fit']);
    const swapped = swapPhotos(turnPhoto(photos, 1), 0, 1);
    expect(swapped.map((p) => [p.file, p.turn])).toEqual([[2, 90], [1, 0]]);
    expect(addPhotos(swapped, [{ file: 3, width: 1, height: 1 }, { file: 4, width: 1, height: 1 }, { file: 5, width: 1, height: 1 }])).toHaveLength(4);
  });
});

describe('pasting is the main way in (Bill, 11-11)', () => {
  it('finds the picture in what was copied from a web page', () => {
    expect(pictureLinkFrom('<meta charset="utf-8"><img src="https://shop.example.com/a.jpg?w=800&amp;h=600" alt="">', ''))
      .toBe('https://shop.example.com/a.jpg?w=800&h=600');
    expect(pictureLinkFrom('', 'https://shop.example.com/sofa.png')).toBe('https://shop.example.com/sofa.png');
    expect(pictureLinkFrom('', 'data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('leaves plain words alone', () => {
    expect(pictureLinkFrom('', 'Like new, works')).toBe('');
    expect(pictureLinkFrom('<b>hello</b>', 'see https://example.com later')).toBe('');
  });

  it('Find pictures searches pictures for the title, the brand once', () => {
    expect(findPicturesUrl('Cuisinart', '4-Slice Toaster')).toBe('https://www.google.com/search?tbm=isch&q=Cuisinart%204-Slice%20Toaster');
    expect(findPicturesUrl('Cuisinart', 'Cuisinart Grind and Brew')).toBe('https://www.google.com/search?tbm=isch&q=Cuisinart%20Grind%20and%20Brew');
  });

  it('flags a small picture plainly, by the space it prints in', () => {
    const rect = { x: 0, y: 0, w: 7, h: 5 };
    expect(printQuality({ width: 400, height: 300, turn: 0, fit: 'fit' }, rect)).toBe('fuzzy');
    expect(printQuality({ width: 1600, height: 1200, turn: 0, fit: 'fit' }, rect)).toBe('ok');
    expect(printQuality({ width: 400, height: 300, turn: 0, fit: 'fit' }, { x: 0, y: 0, w: 2, h: 1.5 })).toBe('ok');
  });
});

describe('what the picture is, and what is in the box', () => {
  it('says under the pictures that they are a product picture, or a photo of this item', () => {
    paper(sheet());
    expect(screen.getByTestId('photo-sheet-caption')).toHaveTextContent('Product picture');
    paper(sheet({ caption: 'item' }));
    expect(screen.getAllByTestId('photo-sheet-caption')[1]).toHaveTextContent('Photo of this item');
  });

  it('prints "In the box, not assembled" bold with the condition, where it cannot be missed', () => {
    paper(sheet({ not_assembled: true }));
    expect(screen.getByTestId('photo-sheet-condition')).toHaveTextContent('Condition: Like new In the box, not assembled.');
    expect(screen.getByTestId('photo-sheet-not-assembled').style.fontWeight).toBe('800');
  });

  it('a gap the photos leave is closed by a small stretch, shown cropped', () => {
    const plan = planSheet({ layout: 'one', orientation: 'portrait', photos: [photo(1, TALL)], body: { w: 7.7, h: 8 }, factsBelow: 0, factsBeside: [], hasFacts: false });
    expect(plan.photos.rects[0].crop).toBe(true);
    expect(plan.photos.rects[0].h).toBeCloseTo(8, 1);
    expect(plan.photos.rects[0].w).toBeLessThan(7.7);
  });
});

describe('Clean up with AI (D23)', () => {
  it('fills only the boxes left empty; what someone typed stays', () => {
    const fields = sheet();
    const draft = { title: 'Ebern Designs Sleeper Sofa', name: '', facts: { size: '80 in', in_box: 'Sofa, 2 pillows', condition: 'Good', good_to_know: '' } };
    const kept = mergeAiDraft(fields, draft, { keepTitle: true });
    expect(kept.fields.facts).toEqual({ size: '78 x 34 x 33 in', in_box: 'Sofa, 2 pillows', condition: 'Like new', good_to_know: '' });
    expect(kept.fields.title).toBe(fields.title);
    expect(kept.filled).toEqual(['in_box']);
    expect(mergeAiDraft(fields, draft, { keepTitle: false }).fields.title).toBe('Ebern Designs Sleeper Sofa');
  });
});

describe('printing (D22)', () => {
  it('prints on Letter turned the sheet’s way, with only the sheet showing', () => {
    expect(printCss('landscape')).toContain('size: letter landscape');
    expect(printCss('portrait')).toContain('size: letter portrait');
    expect(printCss('portrait')).toContain('body > *:not(#photo-sheet-print) { display: none !important; }');
  });

  it('a sheet is a hair under a page tall, so it can never spill onto a second sheet', () => {
    paper(sheet());
    const sheetBox = screen.getByTestId('photo-sheet-paper');
    expect(sheetBox.style.width).toBe('8.5in');
    expect(parseFloat(sheetBox.style.height)).toBeLessThan(11);
    paper(sheet({ orientation: 'landscape' }));
    expect(screen.getAllByTestId('photo-sheet-paper')[1].style.width).toBe('11in');
  });
});
