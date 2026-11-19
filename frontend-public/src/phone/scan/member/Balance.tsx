/**
 * The Bucks detail (PLAN-SCANNER.md row 21, C15; the live tripSheets.tsx `BalanceScreen`), a view of /thriftplus
 * (`?show=bucks`) since the coordinator's call 1: ThriftBucks ready to use, today's ready tomorrow morning, Thrift+
 * credit, then every one in the order the register uses them (B3) with each one's use-by date, what this trip adds, and
 * the terms line. `me/` is asked again each time it opens; the last answer stays on screen meanwhile.
 */
import { bucks } from '../../lib/format'
import type { BalanceProps } from '../contracts'
import { bucksReady, money, shortDate, toCents } from '../core'
import { useMe } from '../store'
import { Spinner } from '../ui'
import { CARD_TERMS } from './Wallet'

/** A ThriftBucks number: two decimals, commas, never a "$", never a sign (the live `tbNumber`). */
export function tb(value: string | number | null | undefined): string {
  return bucks(Math.abs(Number(value) || 0))
}

/** Today plus `days`, as the phone's own calendar day (YYYY-MM-DD). */
export function dayFromNow(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function Balance({ member, tripTotal }: BalanceProps) {
  const me = useMe()
  const lots = me.data?.rewards ?? []
  const credit = me.data?.credit ?? member.credit_balance
  const ready = bucksReady(me.data?.banked ?? member.banked_rewards, me.data ? me.data.available : member.bucks_available)
  const rows = [
    ...(toCents(credit) > 0
      ? [{ what: 'Thrift+ credit', amount: money(credit), note: 'From a return. Always used first. Never expires.', credit: true }]
      : []),
    ...lots.map((l) => ({
      what: 'ThriftBucks',
      amount: tb(l.amount),
      credit: false,
      note: l.past_due
        ? `Use by ${shortDate(l.use_by)} (past its date)`
        : l.usable === false
          ? `Collected ${shortDate(l.earned_on)} · ready tomorrow morning · use by ${shortDate(l.use_by)}`
          : `Collected ${shortDate(l.earned_on)} · use by ${shortDate(l.use_by)}`,
    })),
  ]
  const loading = me.loading && !me.data
  return (
    <section className="mb-sec" data-testid="balance-screen">
      <p className="mb-ready">
        <b className="disp tn" data-testid="balance-ready">{tb(ready.now)}</b>
        <span>ready to use</span>
      </p>
      {ready.tomorrow > 0 ? (
        <p className="mb-plus" data-testid="balance-tomorrow">
          Plus <b className="tn">{tb(ready.tomorrow)}</b> ThriftBucks from today, ready tomorrow morning.
        </p>
      ) : null}
      {toCents(credit) > 0 ? (
        <p className="mb-plus">
          Plus <b className="tn mb-ink">{money(credit)}</b> Thrift+ credit.
        </p>
      ) : null}

      <h2 className="mb-h">Used in this order at the register</h2>
      {loading ? (
        <div className="mb-wait"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="mb-none">Nothing yet. ThriftBucks you collect are ready the next morning.</p>
      ) : (
        <ol className="mb-rows">
          {rows.map((r, i) => (
            <li key={`${r.what}${i}`} data-testid="wallet-row" className={r.credit ? 'mb-credit' : undefined}>
              <span className="mb-n">{i + 1}</span>
              <span className="mb-what">
                <b>{r.what}</b>
                <span>{r.note}</span>
              </span>
              <span className="mb-amt tn">{r.amount}</span>
            </li>
          ))}
        </ol>
      )}

      {tripTotal > 0 ? (
        <div className="mb-trip" data-testid="wallet-trip">
          <p>
            <b>When you buy this trip:</b> ready tomorrow, use by {shortDate(dayFromNow(30))}.
          </p>
          <span className="tn">+{tb(tripTotal)}</span>
        </div>
      ) : null}

      <p className="fine mb-terms2">{CARD_TERMS}</p>
    </section>
  )
}
