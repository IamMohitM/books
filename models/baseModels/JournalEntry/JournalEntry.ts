import { Fyo, t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  Action,
  DefaultMap,
  FiltersMap,
  HiddenMap,
  ListViewSettings,
  ValidationMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import {
  getDocStatus,
  getLedgerLinkAction,
  getNumberSeries,
  getStatusText,
  statusColor,
} from 'models/helpers';
import { Transactional } from 'models/Transactional/Transactional';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { LedgerPosting } from '../../Transactional/LedgerPosting';

export class JournalEntry extends Transactional {
  accounts?: Doc[];

  async getPosting() {
    const posting: LedgerPosting = new LedgerPosting(this, this.fyo);

    for (const row of this.accounts ?? []) {
      const debit = row.debit as Money;
      const credit = row.credit as Money;
      const account = row.account as string;
      const loanProfile = (row.loanProfile as string) || undefined;
      const loanComponent = (row.loanComponent as string) || undefined;
      const meta = loanProfile
        ? {
            loanProfile,
            loanComponent:
              loanComponent && loanComponent !== 'None'
                ? loanComponent
                : undefined,
          }
        : undefined;

      if (!debit.isZero()) {
        await posting.debit(account, debit, meta);
      } else if (!credit.isZero()) {
        await posting.credit(account, credit, meta);
      }
    }

    return posting;
  }

  hidden: HiddenMap = {
    referenceNumber: () =>
      !(this.referenceNumber || !(this.isSubmitted || this.isCancelled)),
    referenceDate: () =>
      !(this.referenceDate || !(this.isSubmitted || this.isCancelled)),
    userRemark: () => false,
    attachment: () =>
      !(this.attachment || !(this.isSubmitted || this.isCancelled)),
  };

  static defaults: DefaultMap = {
    numberSeries: (doc) => getNumberSeries(doc.schemaName, doc.fyo),
    date: () => new Date(),
  };

  static filters: FiltersMap = {
    numberSeries: () => ({ referenceType: 'JournalEntry' }),
  };

  validations: ValidationMap = {
    accounts: async () => {
      await this.validateLoanRows();
    },
  };

  async validate() {
    await super.validate();
    await this.validateLoanRows();
  }

  async validateLoanRows() {
    const loanRows = (this.accounts ?? []).filter((row) => !!row.loanProfile);
    if (!loanRows.length) {
      return;
    }

    const loanProfiles = new Set(
      loanRows.map((row) => row.loanProfile as string)
    );
    if (loanProfiles.size > 1) {
      throw new ValidationError(
        t`All loan rows in one journal entry must use the same Loan Profile.`
      );
    }

    const loanProfileName = loanRows[0].loanProfile as string;
    const loanProfile = await this.fyo.doc.getDoc(
      ModelNameEnum.LoanProfile,
      loanProfileName
    );
    const active = loanProfile.get('active') as boolean;
    const liabilityAccount = loanProfile.get('liabilityAccount') as string;
    const interestExpenseAccount = loanProfile.get(
      'interestExpenseAccount'
    ) as string;
    const loanType = (loanProfile.get('loanType') as string) ?? 'Taken';

    if (active === false) {
      throw new ValidationError(
        t`Cannot post against inactive Loan Profile ${loanProfileName}.`
      );
    }

    for (const row of loanRows) {
      const component = row.loanComponent as string;
      if (!component || component === 'None') {
        throw new ValidationError(
          t`Loan rows must have Loan Component set to Principal or Interest.`
        );
      }

      if (component === 'Principal') {
        if (row.account !== liabilityAccount) {
          const accountNameLabel =
            loanType === 'Provided' ? t`Receivable Account` : t`Liability Account`;
          throw new ValidationError(
            t`Principal rows must use ${accountNameLabel} ${liabilityAccount}.`
          );
        }
      } else if (component === 'Interest') {
        if (row.account !== interestExpenseAccount) {
          const interestAccountLabel =
            loanType === 'Provided' ? t`Interest Income Account` : t`Interest Expense Account`;
          throw new ValidationError(
            t`Interest rows must use ${interestAccountLabel} ${interestExpenseAccount}.`
          );
        }
      }
    }
  }

  static getActions(fyo: Fyo): Action[] {
    return [getLedgerLinkAction(fyo)];
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        {
          label: t`Status`,
          fieldname: 'status',
          fieldtype: 'Select',
          render(doc) {
            const status = getDocStatus(doc);
            const color = statusColor[status] ?? 'gray';
            const label = getStatusText(status);

            return {
              template: `<Badge class="text-xs" color="${color}">${label}</Badge>`,
            };
          },
        },
        'date',
        {
          label: t`Amount`,
          fieldname: 'amount',
          fieldtype: 'Currency',
          display(value, fyo) {
            return fyo.format(value ?? 0, 'Currency');
          },
        },
        'entryType',
        'userRemark',
        'referenceNumber',
      ],
    };
  }
}
