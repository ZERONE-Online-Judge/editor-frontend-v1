import type { Folder } from './types';

export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  const path: Folder[] = [];
  while (id && !seen.has(id)) {
    seen.add(id);
    const folder = byId.get(id);
    if (!folder) break;
    path.unshift(folder);
    id = folder.parent_id;
  }
  return path;
}

export function folderDescendants(folders: Folder[], id: string): Set<string> {
  const result = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const folder of folders) {
      if (
        folder.parent_id &&
        result.has(folder.parent_id) &&
        !result.has(folder.id)
      ) {
        result.add(folder.id);
        added = true;
      }
    }
  }
  return result;
}
