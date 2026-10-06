import { describe, expect, it } from 'vitest';
import type { CareersDoc } from '../../api/hiring.api';
import { aiBundle, parseCareersText, toYaml } from './careersFile';

const doc: CareersDoc = {
  format: 'ecothrift.careers/1',
  public: false,
  page: { headline: 'Now hiring', intro: ['One.', 'Two.'] },
  form: { questions: [{ key: 'why_us', label: 'Why Eco-Thrift?', type: 'long_text', required: true }] },
  email: { reply_to: 'bill@example.com' },
  jobs: [{ slug: 'retail-associate', title: 'Retail Associate', status: 'open' }],
};

describe('careers file', () => {
  it('round-trips through YAML', () => {
    const parsed = parseCareersText(toYaml(doc));
    expect(parsed).toEqual({ ok: true, doc });
  });

  it('reads JSON and YAML inside a chat answer with a fence', () => {
    const chatty = `Here you go!\n\n\`\`\`yaml\n${toYaml(doc)}\`\`\`\nLet me know.`;
    expect(parseCareersText(chatty)).toEqual({ ok: true, doc });
    const json = `Sure:\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\``;
    expect(parseCareersText(json)).toEqual({ ok: true, doc });
    expect(parseCareersText(JSON.stringify(doc))).toEqual({ ok: true, doc });
  });

  it('says what is wrong instead of throwing', () => {
    expect(parseCareersText('')).toEqual({ ok: false, error: 'Paste the file first.' });
    const bad = parseCareersText('format: x\n  - : :');
    expect(bad.ok).toBe(false);
    expect(parseCareersText('just words').ok).toBe(false);
  });

  it('puts the brief before the current file', () => {
    const bundle = aiBundle('You are editing the careers file.', doc);
    expect(bundle.indexOf('You are editing')).toBeLessThan(bundle.indexOf('format: ecothrift.careers/1'));
    expect(bundle).toContain('What I want changed:');
  });
});
