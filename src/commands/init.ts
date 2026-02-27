/**
 * Init command - Initialize .pha/ runtime data
 *
 * Creates DB schemas, system agent files, and optionally seeds benchmark test users.
 * Safe to run repeatedly (idempotent).
 */

import type { Command } from 'commander';
import { c, icons } from '../utils/cli-ui.js';
import { migrateStateDir } from '../utils/state-migration.js';
import { ensureSystemAgentFiles } from '../memory/profile.js';
import { getDatabase } from '../memory/db.js';
import { getUserStore } from '../data-sources/huawei/user-store.js';
import { seedAllTestUsers, loadAllTestUserFixtures } from '../evolution/test-user-seeder.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize .pha/ runtime data (DB schemas, test users, system agent)')
    .option('--seed-test-users', 'Seed benchmark test users')
    .option('--all', 'Initialize everything')
    .action(async (options) => {
      const seedUsers = options.all || options.seedTestUsers;

      console.log(`${c.bold('Initializing .pha/ runtime data...')}\n`);

      // 1. Run state migration (creates db/, users/system/, etc.)
      migrateStateDir();
      console.log(`${c.green(icons.success)} State directory structure ready`);

      // 2. Ensure DB schemas (evolution.db — auto-creates schema)
      getDatabase();
      console.log(`${c.green(icons.success)} evolution.db schema initialized`);

      // 3. Ensure oauth.db schema
      getUserStore();
      console.log(`${c.green(icons.success)} oauth.db schema initialized`);

      // 4. Ensure system agent files
      ensureSystemAgentFiles();
      console.log(`${c.green(icons.success)} System agent files ready`);

      // 5. Seed benchmark test users (if --seed-test-users or --all)
      if (seedUsers) {
        seedAllTestUsers();
        const fixtures = loadAllTestUserFixtures();
        console.log(`${c.green(icons.success)} Seeded ${fixtures.length} benchmark test users`);
      }

      console.log(`\n${c.green(icons.success)} Initialization complete`);
      process.exit(0);
    });
}
