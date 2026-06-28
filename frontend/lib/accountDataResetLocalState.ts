import { BATCH_NOTIFICATION_EVENT, BATCH_NOTIFICATION_STORAGE_KEY } from "@/lib/batch-notifications";
import { ACTIVE_BATCH_EVENT, ACTIVE_BATCH_STORAGE_KEY } from "@/lib/batch-progress";

const SUBJECT_ENGINES = ["math", "korean", "english"];
const ARCHIVE_MIGRATION_KEYS = [
  "tena.archiveFolders.migrated.customSubjects.v1",
  "tena.archiveFolders.migrated.batchFolders.v1",
];

const LOCAL_STORAGE_KEYS = [
  "tena-forge-upload-custom-subjects-v2",
  "tena-forge-upload-subject-tag-colors",
  "tena.problemBrowser.batchFolders",
  "tena.student-management.pending-counseling",
  ACTIVE_BATCH_STORAGE_KEY,
  "tena-forge-active-batch-id",
  BATCH_NOTIFICATION_STORAGE_KEY,
];

const SESSION_STORAGE_KEYS = [
  "tena.problemBrowser.selectedIds",
];

export function clearAccountDataResetLocalState() {
  if (typeof window === "undefined") return;

  for (const key of LOCAL_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  for (const baseKey of ARCHIVE_MIGRATION_KEYS) {
    window.localStorage.removeItem(baseKey);
    for (const engine of SUBJECT_ENGINES) {
      window.localStorage.removeItem(`${baseKey}.${engine}`);
    }
  }
  for (const key of SESSION_STORAGE_KEYS) {
    window.sessionStorage.removeItem(key);
  }

  window.dispatchEvent(new CustomEvent(ACTIVE_BATCH_EVENT, { detail: "" }));
  window.dispatchEvent(new CustomEvent(BATCH_NOTIFICATION_EVENT, { detail: null }));
}
