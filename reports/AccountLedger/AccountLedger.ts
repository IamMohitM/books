import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { GeneralLedger } from 'reports/GeneralLedger/GeneralLedger';
import { ColumnField } from 'reports/types';
import { Field } from 'schemas/types';

export class AccountLedger extends GeneralLedger {
  static title = t`Account Ledger`;
  static reportName = 'account-ledger';

  async set(key: string, value: DocValue, callPostSet = true) {
    if (key === 'account') {
      return await super.set(
        'accounts',
        value ? JSON.stringify([String(value)]) : null,
        callPostSet
      );
    }

    return await super.set(key, value, callPostSet);
  }

  getFilters(): Field[] {
    const filters = super
      .getFilters()
      .filter((field) => field.fieldname !== 'account')
      .map((field) => {
        if (field.fieldname !== 'referenceName') {
          return field;
        }

        return {
          ...field,
          emptyMessage: t`Select a Ref Type`,
        };
      });

    filters.splice(2, 0, {
      fieldtype: 'MultiLink',
      target: 'Account',
      placeholder: t`Accounts or Groups`,
      label: t`Accounts`,
      fieldname: 'accounts',
    } as Field);

    return filters;
  }

  getColumns(): ColumnField[] {
    const columns = super.getColumns();
    const accountIndex = columns.findIndex(
      (column) => column.fieldname === 'account'
    );

    if (accountIndex === -1) {
      return columns;
    }

    const selectedViaColumn = {
      label: t`Selected Via`,
      fieldtype: 'Data',
      fieldname: 'selectedVia',
      width: 1.5,
    } as ColumnField;

    return [
      ...columns.slice(0, accountIndex + 1),
      selectedViaColumn,
      ...columns.slice(accountIndex + 1),
    ];
  }

  async _setRawData() {
    await super._setRawData();

    const { selectedGroupsByAccount } =
      await this._getAccountSelectionDetails();
    for (const entry of this._rawData) {
      entry.selectedVia =
        selectedGroupsByAccount.get(entry.account)?.join(', ') ?? '';
    }
  }

  async setReportData(filter?: string, force?: boolean) {
    if (!this._getSelectedAccountNames().length) {
      this.reportData = [];
      this.emptyMessage = t`Select one or more accounts or groups to view the ledger.`;
      this.loading = false;
      return;
    }

    this.emptyMessage = undefined;
    await super.setReportData(filter, force);
  }
}
