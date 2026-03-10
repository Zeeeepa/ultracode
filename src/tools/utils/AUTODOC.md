# Utils

Enriches diagnostic results with recent change metadata from commit history

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `annotateEntitiesInPlace` | function | Marks items with recentlyChanged flag based on change set | [→ recent-changes-enrichment.ts:124-125] |
| `buildRecentChangeSummary` | function | Analyzes commit history and identifies recently modified entities | [→ recent-changes-enrichment.ts:68-116] |
| `ChangedEntityInfo` | interface | Represents metadata for an entity with recent change information | [→ recent-changes-enrichment.ts:16-23] |
| `EntityInfoInput` | interface | Specifies required and optional entity identification attributes | [→ recent-changes-enrichment.ts:32-37] |
| `formatRecentChangesSection` | function | Formats change summary as human-readable text output section | [→ recent-changes-enrichment.ts:215-231] |
| `getAdapterFromStorage` | function | Extracts GraphAdapter from storage if available | [→ recent-changes-enrichment.ts:44-47] |
| `RecentChangeSummary` | interface | Contains aggregated results of recently changed entities analysis | [→ recent-changes-enrichment.ts:25-30] |
| `ResolvedLocation` | interface | Contains resolved file location mapped to entity identity details | [→ recent-changes-enrichment.ts:140-146] |
| `resolveLocationsToEntities` | function | Maps file:line location strings to entity identifiers via query | [→ recent-changes-enrichment.ts:152-208] |

## Files

- **recent-changes-enrichment.ts** — Central module for recent changes enrichment
