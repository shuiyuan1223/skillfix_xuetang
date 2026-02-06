---
name: memory-system
description: Use when working on the memory/profile system - user profiles, memory search, daily logs, info collection.
---

# PHA Memory System

## Architecture

```
MemoryManager (singleton)
├── UserStore (SQLite)         — user records
├── Profile (file-based)       — .pha/users/{uuid}/PROFILE.md
├── Memory (file + FTS)        — .pha/users/{uuid}/MEMORY.md + chunks table
├── Daily Logs                 — .pha/users/{uuid}/memory/{date}.md
├── VectorStore (Vectra)       — optional vector search
├── InfoCollector              — profile extraction from messages
└── Soul                       — .pha/SOUL.md agent persona
```

## Key Files

| File | Purpose |
|------|---------|
| `src/memory/memory-manager.ts` | Main orchestrator, singleton via `getMemoryManager()` |
| `src/memory/profile.ts` | File I/O for PROFILE.md, MEMORY.md, daily logs |
| `src/memory/types.ts` | `UserProfile`, `MemoryChunk`, `MemorySearchResult` |
| `src/memory/info-collector.ts` | Extract profile fields from user messages |
| `src/memory/soul.ts` | SOUL.md agent persona, `DEFAULT_SOUL` constant |
| `src/memory/schema.ts` | SQLite schema (chunks, chunks_fts) |
| `src/memory/vector-store.ts` | Vectra vector search |
| `src/memory/hybrid.ts` | Hybrid search (vector + keyword merge) |
| `src/memory/user-store.ts` | SQLite user CRUD |

## Common Operations

```typescript
import { getMemoryManager } from "../memory/index.js";
import { getUserUuid } from "../utils/config.js";

const mm = getMemoryManager();
const uuid = getUserUuid();

// Profile
mm.getProfile(uuid);                          // → UserProfile
mm.updateProfile(uuid, { height: 175 });
mm.getProfileCompleteness(uuid);              // → number (0-100)
mm.getAllMissingFields(uuid);                  // → RequiredField[]
mm.extractAndUpdateProfile(uuid, message);    // → Partial<UserProfile>

// Memory
mm.appendMemory(uuid, content);               // → writes MEMORY.md + indexes
mm.appendDailyLog(uuid, content);             // → writes daily log + indexes
await mm.searchAsync(uuid, query, opts);      // → MemorySearchResult[]
mm.getMemoryStats(uuid);                      // → { totalChunks, lastUpdated }

// System prompt
mm.buildSystemPrompt(uuid);                   // → full prompt with soul + profile + memory
```

## UserProfile Interface

```typescript
interface UserProfile {
  nickname?: string;
  gender?: "male" | "female";
  birthYear?: number;
  height?: number;        // cm
  weight?: number;        // kg
  conditions?: string[];  // chronic conditions
  allergies?: string[];
  medications?: string[];
  goals?: { primary?: string; dailySteps?: number; sleepHours?: number; exercisePerWeek?: number };
  lifestyle?: { sleepSchedule?: string; exercisePreference?: string; dietPreference?: string };
  dataSources?: { huawei?: { connected: boolean; connectedAt?: number } };
}
```

## File Storage Layout

```
.pha/
├── SOUL.md                          # Agent persona
├── memory.db                        # SQLite (chunks, FTS)
└── users/
    └── {uuid}/
        ├── PROFILE.md               # User health profile
        ├── MEMORY.md                # Long-term memory
        └── memory/
            ├── 2025-01-01.md        # Daily logs
            └── 2025-01-02.md
```

## Adding New Profile Fields

1. `src/memory/types.ts` — Add to `UserProfile` interface
2. `src/memory/info-collector.ts` — Add to `REQUIRED_FIELDS` with parse/validate
3. `src/memory/profile.ts` — Update `parseProfileMd()` and `generateProfileMd()`
4. `src/memory/memory-manager.ts` — Update `updateProfile()` deep merge if nested
