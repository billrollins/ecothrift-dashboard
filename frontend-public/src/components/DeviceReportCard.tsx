import type { DeviceReport } from '../api'

const MARK = { good: '✓', bad: '✗', none: '•' } as const

/**
 * The phone test report on a listing (Dash Updates #51). Same layout every time: a heading with the test date, then
 * one row per check with a mark and the result in words (never colour alone), then the store's note.
 */
export default function DeviceReportCard({ report }: { report: DeviceReport }) {
  const on = report.tested_on
    ? new Date(`${report.tested_on}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  return (
    <section className="devreport" aria-labelledby="devreport-title">
      <h2 id="devreport-title" className="devreport-title">
        Tested by Eco-Thrift
        {on ? <> <span className="devreport-date">{on}</span></> : null}
      </h2>
      <dl className="devreport-rows">
        {report.rows.map((r) => (
          <div key={r.key} className="devreport-row">
            <dt>{r.label}</dt>
            <dd className={`devreport-${r.tone}`}>
              <span className="devreport-mark" aria-hidden="true">
                {MARK[r.tone]}
              </span>
              {r.result}
            </dd>
          </div>
        ))}
      </dl>
      {report.note ? <p className="devreport-note">{report.note}</p> : null}
    </section>
  )
}
