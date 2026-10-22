import { describe, expect, it } from 'vitest';
import type { SocialTag } from '../../../api/marketing.api';
import { socialTabOf } from './SocialApp';
import { movePhoto } from './SocialPostEditorPage';
import { cardRect, coverCrop, money, PHOTO_HEIGHTS, PHOTO_WIDTH, SAFE_EDGE, tagWords } from './tagOverlay';
import { firstOpenChannel } from './PostIt';
import { centredCrop } from './SocialPhotoEditor';

const TAG: SocialTag = {
  sku: 'ITM0000001',
  title: 'Stand mixer',
  price: '20.00',
  retail: '99.99',
  thriftbucks: '3.40',
  returnable: true,
  return_note: '',
  age_restricted: false,
  available: true,
};

/** The rulebook's never-say words (thrift-plus-decisions.md V2, B6, V9) that could slip onto a tag. */
const NEVER = [/\bearn/i, /discount/i, /cash back/i, /\bpoints\b/i, /store credit/i, /gift card/i, /\bbank/i, /warrant/i, /\bguest/i, /member price/i];

describe('tag overlay words', () => {
  it('prints the price, the checked retail, 3-day returns and today\'s ThriftBucks for members', () => {
    expect(tagWords(TAG)).toEqual({
      retail: 'Retail $99.99',
      label: 'OUR PRICE',
      price: '$20',
      returns: 'Thrift+ 3-day returns',
      bucks: '+3.40 ThriftBucks today',
      bucksFor: 'for Thrift+ members',
    });
  });

  it('says AS IS, and drops retail and ThriftBucks when there are none', () => {
    const words = tagWords({ ...TAG, retail: null, thriftbucks: null, returnable: false });
    expect(words.returns).toBe('AS IS');
    expect(words.retail).toBeNull();
    expect(words.bucks).toBeNull();
    expect(words.bucksFor).toBeNull();
    expect(tagWords({ ...TAG, thriftbucks: '0.00' }).bucks).toBeNull();
  });

  it('never puts "$" by ThriftBucks, always names Thrift+ members, and uses no never-say word', () => {
    const words = tagWords(TAG);
    expect(words.bucks).not.toContain('$');
    expect(`${words.bucks} ${words.bucksFor}`).toContain('Thrift+ members');
    const all = Object.values(words).filter(Boolean).join(' ');
    NEVER.forEach((re) => expect(all).not.toMatch(re));
  });

  it('formats money plainly', () => {
    expect(money('12.00')).toBe('$12');
    expect(money('12.5')).toBe('$12.50');
    expect(money('1200')).toBe('$1,200');
  });
});

describe('tag overlay layout', () => {
  it('keeps the card inside the photo in every corner and size', () => {
    const words = tagWords(TAG);
    for (const size of ['1:1', '4:5', '9:16', '4:3'] as const) {
      for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
        const edge = SAFE_EDGE[size];
        const r = cardRect(corner, PHOTO_HEIGHTS[size], words, edge);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(edge);
        expect(r.x + r.w).toBeLessThanOrEqual(PHOTO_WIDTH);
        expect(r.y + r.h).toBeLessThanOrEqual(PHOTO_HEIGHTS[size] - edge);
      }
    }
  });

  it('keeps 9:16 photos clear of the Story and TikTok buttons', () => {
    expect(PHOTO_HEIGHTS['9:16']).toBe(1920);
    expect(SAFE_EDGE['9:16']).toBe(250);
    const bottom = cardRect('bl', 1920, tagWords(TAG), SAFE_EDGE['9:16']);
    expect(bottom.y + bottom.h).toBeLessThanOrEqual(1920 - 250);
    expect(PHOTO_HEIGHTS['4:3']).toBe(810);
  });

  it('fills the photo without stretching', () => {
    const c = coverCrop(4000, 3000, { x: 0, y: 0, w: 1080, h: 1350 });
    expect(c.sh).toBe(3000);
    expect(c.sw / c.sh).toBeCloseTo(1080 / 1350);
    expect(c.sx).toBeCloseTo((4000 - c.sw) / 2);
  });

  it('crops to the post size in the middle of the photo', () => {
    const wide = centredCrop(4 / 5, 4 / 3);
    expect(wide.height).toBe(100);
    expect(wide.x + wide.width / 2).toBeCloseTo(50);
    const tall = centredCrop(1, 3 / 4);
    expect(tall.width).toBe(100);
    expect(tall.y + tall.height / 2).toBeCloseTo(50);
  });
});

describe('studio helpers', () => {
  it('opens Post it on the first channel not posted yet', () => {
    const ch = (key: 'facebook' | 'instagram' | 'google', posted: boolean) => ({
      key, label: key, sizes: ['4:5' as const], text: '', max_chars: 2200, how: '',
      posted_url: posted ? 'https://x' : '', posted_at: null, posted_by_name: '',
    });
    expect(firstOpenChannel([ch('facebook', true), ch('instagram', false), ch('google', false)])?.key).toBe('instagram');
    expect(firstOpenChannel([ch('facebook', true)])?.key).toBe('facebook');
  });

  it('moves a photo one place and ignores moves off the end', () => {
    expect(movePhoto([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(movePhoto([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(movePhoto([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it('lights the right tab on the bottom bar', () => {
    expect(socialTabOf('/social')).toBe('post');
    expect(socialTabOf('/social/post')).toBe('post');
    expect(socialTabOf('/social/post/12')).toBe('week');
    expect(socialTabOf('/social/scan')).toBe('scan');
    expect(socialTabOf('/social/me')).toBe('me');
  });
});
