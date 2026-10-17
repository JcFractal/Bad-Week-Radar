import { STATUS_LABEL, type DisplayStatus } from '../lib/status'

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}
