# Plan: System-Managed Internal Lead Sources (Roofix Website)

## Overview

Introduce **system sources** so the Roofix Website is a built-in source that automatically captures contact form leads without manual setup. External sources (hipages, etc.) remain user-configured. No changes to lead ingestion logic, rule engine, or external scanning.

## 1. Types and Firestore

- **LeadSource**: Add optional `isSystem?: boolean` (default `false`). Backward compatible.
- **LeadSourceCreate**: Do not add `isSystem` to client create payload; system sources are created only server-side.
- **Mappers** (`sources.ts`, `sources-admin.ts`): Map `isSystem` with default `false`.

## 2. System Source Constant

- **Platform id**: `roofix-website` (already used in `IncomingLeadCreate.source`).
- **Default system source** (when created):
  - `name`: "Roofix Website"
  - `platform`: "roofix-website"
  - `type`: "website"
  - `scanMethod`: "internal"
  - `isSystem`: true
  - `active`: true
  - `status`: "Active"
  - `mode`: "Manual"
  - Other fields: ruleSetId/ruleSetName "", scanFrequency 15, auth fields defaults.

## 3. Ensure System Source Exists

- **New (server-only)**: `getOrCreateRoofixWebsiteSourceAdmin()` in `sources-admin.ts` (or `lib/leads/system-source.ts`):
  - Query `lead_sources` where `platform === "roofix-website"` (get all and find, or Admin query).
  - If found: optionally patch document to set `isSystem: true` if not set (migrate existing), return source.
  - If not found: create one document with the default system source fields via Admin SDK; return created source.
- **When to call**: At the start of `processWebsiteLead()` so the first website lead ensures the source exists. No app startup change required (keeps implementation simple).

## 4. Website Lead Processing

- **process-website-lead.ts**:
  - Replace "find by name Roofix Website" with: call `getOrCreateRoofixWebsiteSourceAdmin()` to get (or create) the system source.
  - Use returned source for rule set resolution, evaluation, activity write, and counter increment. No other logic changes.

## 5. Source Management UI

- **SourcesTable**:
  - Display a "System Source" label (e.g. badge or secondary text) for rows where `source.isSystem === true`.
  - Add delete action: pass `onDelete` from SourcesTab; show delete button only for non-system sources (or show disabled with tooltip for system). So: `onDelete?: (id: string) => void`, and render delete button only when `!source.isSystem && onDelete`.
- **SourcesTab**: Pass `handleDelete` to SourcesTable. In `handleDelete(id)`, optionally check that the source is not system before calling delete (defence in depth; primary guard is server).

## 6. Add Source Modal

- **Create flow**: When saving a new source (not editing), block if the combination is the reserved system source: e.g. `(form.name.trim().toLowerCase() === "roofix website" && form.platform === "roofix-website")` or `form.platform === "roofix-website"`. Show validation error: "Roofix Website is a built-in system source and cannot be created manually."
- **Edit flow (system source)**:
  - Allow: rule set assignment/change, viewing stats, toggling active (optional).
  - Disable: delete (handled in table/modal footer if delete is there), credential section (auth type, login URL, username/password, Connect/Reconnect/Test) for system sources; optionally disable editing of name, platform, type, scan method (lock to "internal") so they are read-only when `editingSource?.isSystem`.

## 7. Delete Guard

- **Server**: In `deleteSourceAndCredentials` (and/or `deleteSourceAdmin`), reject deletion when the source has `isSystem === true`: return `{ ok: false, error: "System sources cannot be deleted" }`. Require loading the source first (getSourceByIdAdmin) to check isSystem.
- **Client**: In `handleDelete`, if the source is system (e.g. we have source in state), skip calling delete and show a message or do nothing. Table will not show delete for system sources, so this is backup.

## 8. Firestore and Backward Compatibility

- Existing documents without `isSystem` read as `false`. No migration script required except that the first time we run `getOrCreateRoofixWebsiteSourceAdmin`, we either find an existing "Roofix Website" (by platform) and set `isSystem: true`, or create a new one.
- Do not modify: external scanning (scan-runner, adapters), rule engine, lead activity structure, incoming_leads structure.

## 9. Implementation Order

1. Types and mappers: add `isSystem` to LeadSource and mappers.
2. sources-admin: add `getOrCreateRoofixWebsiteSourceAdmin()`, and guard `deleteSourceAdmin` / action so system sources cannot be deleted.
3. process-website-lead: use `getOrCreateRoofixWebsiteSourceAdmin()` instead of name lookup.
4. UI: SourcesTable — system label, optional delete column with delete only for non-system; SourcesTab pass onDelete.
5. UI: AddSourceModal — block creating roofix-website; when editing system source, disable auth section and lock name/platform/type/scan method (allow rule set + active).
6. Optional: run-lead-scan / scan-runner — ensure we never run external scan for platform "roofix-website" (no adapter); already safe because getAdapter("roofix-website") returns null.
