import { DocValue } from 'fyo/core/types';
import { Action, ListViewSettings, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { AccountTypeEnum, AccountRootType } from 'models/baseModels/Account/types';
import { ModelNameEnum } from 'models/types';
import { Money } from 'pesa';
import { Doc } from 'fyo/model/doc';
import { Fyo } from 'fyo';

export class LoanProfile extends Doc {
  annualInterestRate?: number;
  active?: boolean;

  validations: ValidationMap = {
    annualInterestRate: (value: DocValue) => {
      const rate = Number(value ?? 0);
      if (Number.isNaN(rate) || rate < 0) {
        throw new ValidationError(
          this.fyo.t`Annual Interest Rate must be 0 or more.`
        );
      }
    },
    liabilityAccount: async (value: DocValue) => {
      if (!value) {
        return;
      }

      const [accountType, rootType] = (await Promise.all([
        this.fyo.getValue(ModelNameEnum.Account, value as string, 'accountType'),
        this.fyo.getValue(ModelNameEnum.Account, value as string, 'rootType'),
      ])) as [string | undefined, AccountRootType | undefined];

      if (accountType !== AccountTypeEnum.Payable && rootType !== 'Liability') {
        throw new ValidationError(
          this.fyo.t`Liability Account must be a Liability account.`
        );
      }
    },
    interestExpenseAccount: async (value: DocValue) => {
      if (!value) {
        return;
      }

      const rootType = (await this.fyo.getValue(
        ModelNameEnum.Account,
        value as string,
        'rootType'
      )) as string;

      if (rootType !== 'Expense') {
        throw new ValidationError(
          this.fyo.t`Interest Expense Account must have root type Expense.`
        );
      }
    },
    openingPrincipal: (value: DocValue) => {
      if ((value as Money)?.isNegative?.() ?? false) {
        throw new ValidationError(this.fyo.t`Opening Principal cannot be less than 0.`);
      }
    },
    openingAccruedInterest: (value: DocValue) => {
      if ((value as Money)?.isNegative?.() ?? false) {
        throw new ValidationError(
          this.fyo.t`Opening Accrued Interest cannot be less than 0.`
        );
      }
    },
    historicalInterestPaid: (value: DocValue) => {
      if ((value as Money)?.isNegative?.() ?? false) {
        throw new ValidationError(
          this.fyo.t`Historical Interest Paid cannot be less than 0.`
        );
      }
    },
  };

  async beforeSync() {
    await super.beforeSync();
    await this.ensureLoanAccounts();
  }

  private async ensureLoanAccounts() {
    const lenderName = (this.get('lenderName') as string) ?? '';
    const loanId = (this.get('name') as string) ?? this.name ?? '';
    const labelBase =
      lenderName && loanId && lenderName !== loanId
        ? `${lenderName} (${loanId})`
        : lenderName || loanId || this.fyo.t`Loan`;

    if (!this.liabilityAccount) {
      const parent = await this.getPreferredAccountParent('Liability', [
        this.fyo.t`Unsecured Loans`,
        this.fyo.t`Secured Loans`,
        this.fyo.t`Loans (Liabilities)`,
      ]);
      const accountName = await this.ensureAccount({
        name: `${this.fyo.t`Loan`} - ${labelBase}`,
        rootType: 'Liability',
        accountType: AccountTypeEnum.Payable,
        parentAccount: parent ?? undefined,
      });
      this.liabilityAccount = accountName;
    }

    if (!this.interestExpenseAccount) {
      const parent = await this.getPreferredAccountParent('Expense', [
        this.fyo.t`Indirect Expenses`,
        this.fyo.t`Direct Expenses`,
      ]);
      const accountName = await this.ensureAccount({
        name: `${this.fyo.t`Interest`} - ${labelBase}`,
        rootType: 'Expense',
        accountType: AccountTypeEnum['Expense Account'],
        parentAccount: parent ?? undefined,
      });
      this.interestExpenseAccount = accountName;
    }
  }

  private async getPreferredAccountParent(
    rootType: AccountRootType,
    preferredNames: string[]
  ): Promise<string | null> {
    for (const name of preferredNames) {
      if (!(await this.fyo.db.exists(ModelNameEnum.Account, name))) {
        continue;
      }

      const account = (await this.fyo.db.get(ModelNameEnum.Account, name, [
        'name',
        'isGroup',
        'rootType',
      ])) as { name: string; isGroup: boolean; rootType: AccountRootType };

      if (account.isGroup && account.rootType === rootType) {
        return account.name;
      }
    }

    const groups = (await this.fyo.db.getAll(ModelNameEnum.Account, {
      fields: ['name', 'isGroup', 'rootType'],
      filters: { rootType, isGroup: true },
    })) as { name: string; isGroup: boolean; rootType: AccountRootType }[];

    if (!groups.length) {
      return null;
    }

    const keyword = rootType === 'Liability' ? 'loan' : 'expense';
    const preferred = groups.find((g) =>
      g.name.toLowerCase().includes(keyword)
    );
    return (preferred ?? groups[0]).name;
  }

  private async ensureAccount(data: {
    name: string;
    rootType: AccountRootType;
    accountType?: string;
    parentAccount?: string;
  }): Promise<string> {
    let accountName = data.name;
    if (await this.fyo.db.exists(ModelNameEnum.Account, accountName)) {
      const existing = (await this.fyo.db.get(ModelNameEnum.Account, accountName, [
        'rootType',
        'accountType',
      ])) as { rootType: AccountRootType; accountType?: string };

      if (
        existing.rootType === data.rootType &&
        (!data.accountType || existing.accountType === data.accountType)
      ) {
        return accountName;
      }

      accountName = await this.getUniqueAccountName(accountName);
    }

    await this.fyo.doc
      .getNewDoc(ModelNameEnum.Account, {
        name: accountName,
        rootType: data.rootType,
        parentAccount: data.parentAccount,
        accountType: data.accountType,
        isGroup: false,
      })
      .sync();

    return accountName;
  }

  private async getUniqueAccountName(base: string): Promise<string> {
    let suffix = 1;
    let candidate = `${base} ${suffix}`;
    while (await this.fyo.db.exists(ModelNameEnum.Account, candidate)) {
      suffix += 1;
      candidate = `${base} ${suffix}`;
    }
    return candidate;
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        'lenderName',
        'startDate',
        'annualInterestRate',
        'active',
      ],
    };
  }

  static getActions(_fyo: Fyo): Action[] {
    return [];
  }
}
