import type { ReactNode } from 'react'
import { computeTotals } from '../cart'
import type { Stage } from '../cart'
import { formatINR } from '../catalog'
import { useStore } from '../useStore'

export function OrderSummary({ stage, children }: { stage: Stage; children?: ReactNode }) {
  const { setup, state, plusOn } = useStore()
  const t = computeTotals(setup, state, plusOn, stage)
  const savings = t.mrpTotal - t.itemsTotal
  return (
    <aside id="order-summary" className="h-fit rounded-sm bg-white shadow-sm">
      <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold tracking-wide text-gray-500 uppercase">Price details</h2>
      <dl className="space-y-3 px-5 py-4 text-sm">
        <Row label={`Price (${t.itemCount} item${t.itemCount === 1 ? '' : 's'})`} value={formatINR(t.mrpTotal)} />
        {savings > 0 && <Row label="Discount" value={`− ${formatINR(savings)}`} valueClass="text-green-700" />}
        {t.extras
          .filter((e) => e.kind === 'service')
          .map((e) => (
            <Row key={e.label} label={e.label} value={e.note ?? formatINR(e.amount)} valueClass={e.note ? 'text-green-700' : ''} />
          ))}
        {t.extras.some((e) => e.kind === 'fee') && (
          <div id="fee-lines" className="space-y-3">
            {t.extras
              .filter((e) => e.kind === 'fee')
              .map((e) => (
                <Row key={e.label} label={e.label} value={formatINR(e.amount)} />
              ))}
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-gray-200 pt-3 text-base font-semibold">
          <dt>Total amount</dt>
          <dd id="order-total">{formatINR(t.total)}</dd>
        </div>
      </dl>
      {savings > 0 && (
        <div className="border-t border-gray-100 px-5 py-3 text-sm font-medium text-green-700">
          You will save {formatINR(savings)} on this order
        </div>
      )}
      {children && <div className="border-t border-gray-100 p-4">{children}</div>}
    </aside>
  )
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-700">{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  )
}
