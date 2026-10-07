import { describe, expect, it } from 'vitest';
import { docToTemplate, fillTemplate, isEdited, templateToDoc, typedOver } from './emailTemplate';

const FIELDS = { first_name: 'First name', when: 'Interview time', link: 'Their private link' };
const TEMPLATE = {
  subject: 'Your interview: {when}',
  body: 'Hi {first_name},\n\nSee you {when}.\nChange it here: {link}\n\nEco-Thrift\n',
};

describe('review email template', () => {
  it('round-trips a template through the editor document exactly', () => {
    const doc = templateToDoc(TEMPLATE.body, FIELDS);
    expect(docToTemplate(doc)).toBe(TEMPLATE.body);
    expect(doc.content?.[0].content?.[1]).toEqual({ type: 'field', attrs: { name: 'first_name' } });
    expect(doc.content?.[1]).toEqual({ type: 'paragraph' }); // a blank line stays a blank line
  });

  it('keeps an unknown {word} as plain words', () => {
    const doc = templateToDoc('Hi {nickname} {first_name}', FIELDS);
    expect(doc.content?.[0].content?.map((n) => n.type)).toEqual(['text', 'field']);
    expect(docToTemplate(doc)).toBe('Hi {nickname} {first_name}');
  });

  it('typed-over words are plain text in the template, so the value is no longer linked', () => {
    const doc = templateToDoc(TEMPLATE.body, FIELDS);
    doc.content![0].content![1] = { type: 'text', text: 'Dana B.', marks: [{ type: 'typedOver', attrs: { name: 'first_name' } }] };
    const body = docToTemplate(doc);
    expect(body.startsWith('Hi Dana B.,')).toBe(true);
    expect(typedOver(TEMPLATE, TEMPLATE.subject, body)).toEqual(['first_name']);
    expect(isEdited(TEMPLATE, TEMPLATE.subject, body)).toBe(true);
    // {when} is still linked in the subject and the body.
    expect(typedOver(TEMPLATE, TEMPLATE.subject, body)).not.toContain('when');
  });

  it('is not edited when only trailing spaces differ', () => {
    expect(isEdited(TEMPLATE, `${TEMPLATE.subject} `, TEMPLATE.body.replace('Eco-Thrift', 'Eco-Thrift  '))).toBe(false);
  });

  it('fills linked values for Copy text', () => {
    expect(fillTemplate('Hi {first_name}, {nickname}', { first_name: 'Dana' })).toBe('Hi Dana, {nickname}');
  });
});
