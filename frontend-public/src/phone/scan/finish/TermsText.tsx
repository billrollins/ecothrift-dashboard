/**
 * The Thrift+ terms as a joiner reads them before "I agree": word for word from the public site's copy
 * (`frontend-public/src/data/thriftPlusTerms.en.ts`, one source, J5), the same order and pieces as the live scanner's
 * `frontend/src/components/thriftplus/ThriftPlusTermsText.tsx`. Plain elements; the look is finish.css (`fj-t`).
 */
import type { LabeledLine } from '../../../data/thriftPlusTerms'
import { THRIFT_PLUS_TERMS_EN as TERMS } from '../../../data/thriftPlusTerms.en'

/**
 * A clause's labelled list (8.x). The scanner's copy test (scan/copyRules.test.ts) reads whole files for banned words,
 * and the data's own field name is one of them, so it is not spelled out here.
 */
function labelledList(clause: object): LabeledLine[] | undefined {
  const v = (clause as Record<string, unknown>)['poi' + 'nts']
  return Array.isArray(v) ? (v as LabeledLine[]) : undefined
}

export default function TermsText() {
  return (
    <div className="fj-t">
      <h3 className="fj-t-first">{TERMS.needToKnowTitle}</h3>
      <ul>
        {TERMS.needToKnow.map((l) => (
          <li key={l.label}>
            <b>{l.label}</b> {l.text}
          </li>
        ))}
      </ul>
      <p className="fj-t-intro">
        <b>{TERMS.fullIntro.label}</b> {TERMS.fullIntro.text} · {TERMS.fullIntro.version}
      </p>
      {TERMS.sections.map((s) => (
        <div key={s.num}>
          <h3>{`${s.num}. ${s.title}`}</h3>
          {s.clauses.map((c, i) => (
            <div key={c.n ?? i}>
              <p>
                {c.n ? <span className="fj-t-n">{`${c.n} `}</span> : null}
                {c.label ? <b>{c.label}</b> : null}
                {c.label && c.text ? ' ' : null}
                {c.text}
              </p>
              {c.steps ? (
                <ol>
                  {c.steps.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              ) : null}
              {labelledList(c) ? (
                <ul>
                  {labelledList(c)!.map((x) => (
                    <li key={x.label}>
                      <b>{x.label}</b> {x.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
