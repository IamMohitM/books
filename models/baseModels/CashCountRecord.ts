import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import { Money } from 'pesa';

export class CashCountRecord extends Doc {
  async submit() {
    // Create Journal Entry for the variance if there is one
    if (!this.variance || this.variance === 0) {
      await super.submit();
      return;
    }

    const variance = (this.variance as Money | undefined)?.float ?? 0;

    if (!this.varianceAccount) {
      throw new ValidationError(t`Variance Account is required`);
    }

    // Create Journal Entry with variance posting
    const je = this.fyo.doc.getNewDoc('JournalEntry', {
      date: new Date().toISOString().split('T')[0],
      entryType: 'Journal Entry',
      referenceNumber: `CCR-${this.name}`,
      userRemark: t`Cash reconciliation variance for ${String(
        this.period ?? ''
      )}`,
    }) as Doc;

    // Create account entries for the Journal Entry
    const accountEntries: Array<{
      account: string;
      debit: Money;
      credit: Money;
    }> = [];

    // Calculate which account is debit and which is credit based on variance sign
    if (variance > 0) {
      // Cash is over (positive variance means actual > expected, so credit the variance account)
      accountEntries.push({
        account: 'Cash In Hand',
        debit: this.fyo.pesa(variance),
        credit: this.fyo.pesa(0),
      });
      accountEntries.push({
        account: String(this.varianceAccount),
        debit: this.fyo.pesa(0),
        credit: this.fyo.pesa(variance),
      });
    } else {
      // Cash is short (negative variance means actual < expected, so debit the variance account)
      const absVariance = Math.abs(variance);
      accountEntries.push({
        account: 'Cash In Hand',
        debit: this.fyo.pesa(0),
        credit: this.fyo.pesa(absVariance),
      });
      accountEntries.push({
        account: String(this.varianceAccount),
        debit: this.fyo.pesa(absVariance),
        credit: this.fyo.pesa(0),
      });
    }

    // Add accounts to JE
    for (const entry of accountEntries) {
      const jeAccount = this.fyo.doc.getNewDoc(
        'JournalEntryAccount',
        entry
      ) as Doc;
      je.push('accounts', jeAccount);
    }

    // Save and submit the Journal Entry
    await (je as any).save();
    await (je as any).submit();

    // Link the JE to this record and submit
    this.journalEntryName = String(je.name ?? '');
    await super.submit();
  }

  async validate() {
    // Ensure variance is calculated correctly
    if (this.expectedBalance !== undefined && this.physicalCount !== undefined) {
      const expected = (this.expectedBalance as Money).float;
      const actual = (this.physicalCount as Money).float;
      this.variance = this.fyo.pesa(expected - actual);
    }
  }
}
