import { Fyo } from 'fyo';
import { Doc } from 'fyo/model/doc';
import {
  DefaultMap,
  FiltersMap,
  ListViewSettings,
  RequiredMap,
  TreeViewSettings,
  ReadOnlyMap,
  FormulaMap,
} from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { QueryFilter } from 'utils/db/types';
import { AccountRootType, AccountRootTypeEnum, AccountType } from './types';

export class Account extends Doc {
  rootType?: AccountRootType;
  accountType?: AccountType;
  parentAccount?: string;
  originalName?: string;

  get isDebit() {
    if (this.rootType === AccountRootTypeEnum.Asset) {
      return true;
    }

    if (this.rootType === AccountRootTypeEnum.Expense) {
      return true;
    }

    return false;
  }

  get isCredit() {
    return !this.isDebit;
  }

  required: RequiredMap = {
    /**
     * Added here cause rootAccounts don't have parents
     * they are created during initialization. if this is
     * added to the schema it will cause NOT NULL errors
     */

    parentAccount: () => !!this.fyo.singles?.AccountingSettings?.setupComplete,
  };

  static defaults: DefaultMap = {
    /**
     * NestedSet indices are actually not used
     * this needs updation as they may be required
     * later on.
     */
    lft: () => 0,
    rgt: () => 0,
  };

  async load() {
    await super.load();
    this.originalName = this.name;
  }

  async beforeSync() {
    if (
      this.originalName &&
      this.name &&
      this.originalName !== this.name
    ) {
      const newName = this.name;
      this.name = this.originalName;
      await this.rename(newName);
      this.originalName = newName;
    }

    if (this.parentAccount) {
      const parent = await this.fyo.db.get('Account', this.parentAccount);
      if (
        parent?.rootType &&
        this.rootType &&
        parent.rootType !== this.rootType
      ) {
        throw new ValidationError(
          this.fyo.t`Accounts can only be moved within the same category.`
        );
      }
    }

    if (this.accountType || !this.parentAccount) {
      return;
    }

    const account = await this.fyo.db.get('Account', this.parentAccount);
    this.accountType = account.accountType as AccountType;
  }

  async afterSync() {
    this.originalName = this.name;
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['name', 'rootType', 'isGroup', 'parentAccount'],
    };
  }

  static getTreeSettings(fyo: Fyo): void | TreeViewSettings {
    return {
      parentField: 'parentAccount',
      async getRootLabel(): Promise<string> {
        const accountingSettings = await fyo.doc.getDoc('AccountingSettings');
        return accountingSettings.companyName as string;
      },
    };
  }

  formulas: FormulaMap = {
    rootType: {
      formula: async () => {
        if (!this.parentAccount) {
          return;
        }

        return await this.fyo.getValue(
          ModelNameEnum.Account,
          this.parentAccount,
          'rootType'
        );
      },
    },
  };

  static filters: FiltersMap = {
    parentAccount: (doc: Doc) => {
      const filter: QueryFilter = {
        isGroup: true,
      };

      if (doc?.rootType) {
        filter.rootType = doc.rootType as string;
      }

      return filter;
    },
  };

  readOnly: ReadOnlyMap = {
    rootType: () => this.inserted,
    accountType: () => !!this.accountType && this.inserted,
    isGroup: () => this.inserted,
  };
}
