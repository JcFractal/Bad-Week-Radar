import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AnalysisRecord } from '../types'
import { fmtShort } from '../lib/dates'
import { fmtNum, STATUS_LABEL } from '../lib/status'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(720)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const PAD_L = 52
const PAD_R = 14

interface FrameProps {
  dates: string[]
  asOf: string
  height: number
  hover: number | null
  setHover: (i: number | null) => void
  axis?: boolean
  children: (x: (i: number) => number, w: number, step: number) => ReactNode
  label: string
}

/** Shared x-geometry so every track lines up day-for-day. */
function Frame({ dates, asOf, height, hover, setHover, axis, children, label }: FrameProps) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const n = dates.length
  const step = n > 1 ? (w - PAD_L - PAD_R) / (n - 1) : 0
  const x = (i: number) => PAD_L + i * step
  const H = height + (axis ? 20 : 0)
  const futureStart = dates.findIndex((d) => d > asOf)
  const asOfIdx = dates.indexOf(asOf)
  const ticks = n ? Array.from(new Set([0, ...[1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 5)), n - 1])) : []
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = step ? Math.round((e.clientX - r.left - PAD_L) / step) : 0
    setHover(i >= 0 && i < n ? i : null)
  }
  return (
    <div ref={ref} className="track">
      <svg width={w} height={H} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {futureStart >= 0 && (
          <g>
            <rect x={x(futureStart) - step / 2} y={0} width={w - PAD_R - x(futureStart) + step / 2} height={height} className="future-zone" />
            <text x={x(futureStart) + 4} y={11} className="future-label">After the prediction</text>
          </g>
        )}
        {children(x, w, step)}
        {asOfIdx >= 0 && <line x1={x(asOfIdx)} x2={x(asOfIdx)} y1={0} y2={height} className="asof-line" />}
        {hover !== null && hover < n && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} className="hover-line" />}
        {axis && ticks.map((i) => (
          <text key={i} x={x(i)} y={height + 14} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="axis-text">{fmtShort(dates[i])}</text>
        ))}
      </svg>
    </div>
  )
}

export interface LineSeries { title: string; unit: string; digits: number; values: (number | null)[]; baseline: (number | null)[] }

interface TrackProps { dates: string[]; asOf: string; hover: number | null; setHover: (i: number | null) => void; axis?: boolean }

export function LineTrack({ series, ...p }: TrackProps & { series: LineSeries }) {
  const H = 112
  const all = [...series.values, ...series.baseline].filter((v): v is number => v !== null)
  let lo = all.length ? Math.min(...all) : 0
  let hi = all.length ? Math.max(...all) : 1
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const padV = (hi - lo) * 0.12
  lo -= padV; hi += padV
  const y = (v: number) => 8 + (H - 16) * (1 - (v - lo) / (hi - lo))
  const path = (vals: (number | null)[], x: (i: number) => number) =>
    vals.reduce((acc, v, i) => (v === null ? acc : acc + `${i > 0 && vals[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '')
  const h = p.hover
  const hv = h !== null ? series.values[h] : null
  const hb = h !== null ? series.baseline[h] : null
  const missing = series.values.filter((v) => v === null).length
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">{series.title} <span className="muted">({series.unit})</span></span>
        <span className="chart-readout">
          {h !== null && p.dates[h] ? (
            <>{fmtShort(p.dates[h])}: <b>{hv === null ? 'no reading' : fmtNum(hv, series.digits)}</b> · baseline {fmtNum(hb, series.digits)}</>
          ) : (
            <><span className="key key-daily" /> Daily reading <span className="key key-base" /> Prior 28-day baseline{missing ? <> · {missing} day{missing > 1 ? 's' : ''} without a reading (gap)</> : null}</>
          )}
        </span>
      </div>
      <Frame {...p} height={H} label={`${series.title} chart`}>
        {(x, w) => (
          <>
            {[lo + padV, hi - padV].map((v, k) => (
              <g key={k}>
                <line x1={PAD_L} x2={w - PAD_R} y1={y(v)} y2={y(v)} className="grid" />
                <text x={PAD_L - 6} y={y(v) + 4} textAnchor="end" className="axis-text">{fmtNum(v, series.digits === 0 && v > 1000 ? 0 : series.digits)}</text>
              </g>
            ))}
            <path d={path(series.baseline, x)} className="baseline-path" />
            <path d={path(series.values, x)} className="value-path" />
            {series.values.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.2} className={`value-dot ${p.dates[i] > p.asOf ? 'is-future' : ''}`} />))}
          </>
        )}
      </Frame>
    </div>
  )
}

export function StatusTrack({ records, ...p }: TrackProps & { records: Map<string, AnalysisRecord> }) {
  const h = p.hover
  const hr = h !== null ? records.get(p.dates[h]) : undefined
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Analysis status by prediction date</span>
        <span className="chart-readout">
          {h !== null && p.dates[h] ? <>{fmtShort(p.dates[h])}: <b>{hr ? STATUS_LABEL[hr.status] : 'no record'}</b></> : (
            <><span className="key st-alert" /> Review suggested <span className="key st-no_alert" /> No alert <span className="key st-insufficient_data" /> Insufficient data</>
          )}
        </span>
      </div>
      <Frame {...p} height={18} label="Status by day">
        {(x, _w, step) => p.dates.map((d, i) => {
          const r = records.get(d)
          return r ? <rect key={d} x={x(i) - Math.max(step, 2) / 2 + 0.5} y={3} width={Math.max(step - 1, 1.5)} height={12} rx={1.5} className={`st-${r.status}`} /> : null
        })}
      </Frame>
    </div>
  )
}

export function FeelingTrack({ values, ...p }: TrackProps & { values: (number | null)[] }) {
  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Daily feeling check-in <span className="muted">(1–5, self-reported; not a model input)</span></span>
        <span className="chart-readout"><span className="key st-alert" /> 2 or lower · blank = no response</span>
      </div>
      <Frame {...p} height={22} axis label="Daily feeling check-ins">
        {(x) => values.map((v, i) => (v === null ? null : (
          <g key={i}>
            <circle cx={x(i)} cy={11} r={6.5} className={v <= 2 ? 'feel-low' : 'feel'} />
            <text x={x(i)} y={14.5} textAnchor="middle" className="feel-text">{v}</text>
          </g>
        )))}
      </Frame>
    </div>
  )
}
