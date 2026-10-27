import { ShieldCheck } from 'lucide-react'
import { buildFullBackup, fileNameFor, shareOrDownload } from '../lib/backup'
import { markBackedUp, snoozeBackupReminder, useBackupDue } from '../lib/backupState'
import { getState, useAppData } from '../lib/store'

// A quiet reminder: your plans live only in this browser, so save a copy now and then.
export function BackupNudge() {
  const { places, days } = useAppData()
  const due = useBackupDue(places.length > 0 || days.some((d) => d.items.length > 0))
  if (!due) return null
  return (
    <div className="nudge" role="status">
      <ShieldCheck size={22} aria-hidden />
      <p>
        <strong>Save a backup.</strong> Your plans live only in this browser. A backup file takes a second and keeps them safe if your phone or browser is cleared.
      </p>
      <div className="row buttons">
        <button
          className="primary"
          onClick={() => void shareOrDownload(buildFullBackup(getState()), fileNameFor('backup')).then((r) => r !== 'cancelled' && markBackedUp())}
        >
          Back up now
        </button>
        <button onClick={snoozeBackupReminder}>Later</button>
      </div>
    </div>
  )
}
