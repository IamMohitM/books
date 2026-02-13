import { DatabaseManager } from '../database/manager';

async function execute(dm: DatabaseManager) {
  const knex = dm.db?.knex;
  if (!knex) {
    return;
  }

  const tableName = 'AccountingLedgerEntry';
  const info = (await knex.raw(`PRAGMA table_info(${tableName})`)) as {
    name: string;
  }[];

  const existing = new Set((info ?? []).map((row) => row.name));
  const needsLoanProfile = !existing.has('loanProfile');
  const needsLoanComponent = !existing.has('loanComponent');

  if (!needsLoanProfile && !needsLoanComponent) {
    return;
  }

  await knex.schema.alterTable(tableName, (table) => {
    if (needsLoanProfile) {
      table.text('loanProfile');
    }
    if (needsLoanComponent) {
      table.text('loanComponent');
    }
  });
}

export default { execute, beforeMigrate: true };
