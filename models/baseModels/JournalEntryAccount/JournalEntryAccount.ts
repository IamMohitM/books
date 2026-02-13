import { Doc } from 'fyo/model/doc';
import { FiltersMap, FormulaMap, ReadOnlyMap } from 'fyo/model/types';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';

export class JournalEntryAccount extends Doc {
  getAutoDebitCredit(type: 'debit' | 'credit') {
    const currentValue = this.get(type) as Money;
    if (!currentValue.isZero()) {
      return;
    }

    const otherType = type === 'debit' ? 'credit' : 'debit';
    const otherTypeValue = this.get(otherType) as Money;
    if (!otherTypeValue.isZero()) {
      return this.fyo.pesa(0);
    }

    const totalType = this.parentdoc!.getSum('accounts', type, false) as Money;
    const totalOtherType = this.parentdoc!.getSum(
      'accounts',
      otherType,
      false
    ) as Money;

    if (totalType.lt(totalOtherType)) {
      return totalOtherType.sub(totalType);
    }
  }

  formulas: FormulaMap = {
    debit: {
      formula: () => this.getAutoDebitCredit('debit'),
    },
    credit: {
      formula: () => this.getAutoDebitCredit('credit'),
    },
    account: {
      formula: async () => {
        const loanProfile = this.loanProfile as string;
        const component = this.loanComponent as string;
        if (!loanProfile || !component || component === 'None') {
          return;
        }

        const loanDoc = await this.fyo.doc.getDoc(
          ModelNameEnum.LoanProfile,
          loanProfile
        );
        if (component === 'Principal') {
          return loanDoc.get('liabilityAccount') as string;
        }

        if (component === 'Interest') {
          return loanDoc.get('interestExpenseAccount') as string;
        }
      },
    },
  };

  static filters: FiltersMap = {
    account: () => ({ isGroup: false }),
    loanProfile: () => ({ active: true }),
  };

  readOnly: ReadOnlyMap = {
    account: () => !!this.loanProfile,
  };
}
