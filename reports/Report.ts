import { Fyo } from 'fyo';
import { Converter } from 'fyo/core/converter';
import { DocValue } from 'fyo/core/types';
import { Action } from 'fyo/model/types';
import Observable from 'fyo/utils/observable';
import { Field, RawValue } from 'schemas/types';
import { getIsNullOrUndef } from 'utils';
import { ColumnField, ReportData } from './types';
import type { ReportColumnState } from 'fyo/core/types';

export abstract class Report extends Observable<RawValue> {
  static title: string;
  static reportName: string;
  static isInventory = false;

  fyo: Fyo;
  allColumns: ColumnField[] = [];
  columns: ColumnField[] = [];
  columnSelection: Record<string, boolean> = {};
  columnOrder: string[] = [];
  filters: Field[] = [];
  reportData: ReportData;
  usePagination = false;
  shouldRefresh = false;
  emptyMessage?: string;
  abstract loading: boolean;

  constructor(fyo: Fyo) {
    super();
    this.fyo = fyo;
    this.reportData = [];
  }

  get title(): string {
    return (this.constructor as typeof Report).title;
  }

  get reportName(): string {
    return (this.constructor as typeof Report).reportName;
  }

  async initialize() {
    /**
     * Not in constructor cause possibly async.
     */

    await this.setDefaultFilters();
    this.filters = await this.getFilters();
    this.setColumns(await this.getColumns());
    await this.setReportData();
  }

  get columnOptions(): { fieldname: string; label: string }[] {
    return this.allColumns.map(({ fieldname, label }) => ({
      fieldname,
      label,
    }));
  }

  get filterMap() {
    const filterMap: Record<string, RawValue> = {};
    for (const { fieldname } of this.filters) {
      const value = this.get(fieldname);
      if (getIsNullOrUndef(value)) {
        continue;
      }

      filterMap[fieldname] = value;
    }

    return filterMap;
  }

  async set(key: string, value: DocValue, callPostSet = true) {
    const field = this.filters.find((f) => f.fieldname === key);
    if (field === undefined) {
      return;
    }

    value = Converter.toRawValue(value, field, this.fyo);
    const prevValue = this[key];
    if (prevValue === value) {
      return;
    }

    if (getIsNullOrUndef(value)) {
      delete this[key];
    } else {
      this[key] = value;
    }

    if (callPostSet) {
      await this.updateData(key);
    }
  }

  async updateData(key?: string, force?: boolean) {
    await this.setDefaultFilters();
    this.filters = await this.getFilters();
    this.setColumns(await this.getColumns());
    await this.setReportData(key, force);
  }

  setColumns(columns: ColumnField[]) {
    this._restorePersistedColumnState();

    const availableFieldnames = columns.map((column) => column.fieldname);
    const orderedFieldnames = this.columnOrder.filter((fieldname) =>
      availableFieldnames.includes(fieldname)
    );
    const missingFieldnames = availableFieldnames.filter(
      (fieldname) => !orderedFieldnames.includes(fieldname)
    );

    this.columnOrder = [...orderedFieldnames, ...missingFieldnames];
    this.allColumns = this.columnOrder
      .map((fieldname) =>
        columns.find((column) => column.fieldname === fieldname)
      )
      .filter(Boolean) as ColumnField[];

    const nextSelection: Record<string, boolean> = {};
    for (const column of this.allColumns) {
      nextSelection[column.fieldname] =
        this.columnSelection[column.fieldname] ?? true;
    }

    if (!Object.values(nextSelection).some(Boolean) && this.allColumns[0]) {
      nextSelection[this.allColumns[0].fieldname] = true;
    }

    this.columnSelection = nextSelection;
    this._applyColumnState();
    this._persistColumnState();
  }

  async updateColumnSelection(fieldname: string, value: boolean) {
    const nextSelection = {
      ...this.columnSelection,
      [fieldname]: value,
    };

    if (!Object.values(nextSelection).some(Boolean)) {
      return;
    }

    this.columnSelection = nextSelection;
    this._applyColumnState();
    this._persistColumnState();
    await this.setReportData(undefined, true);
  }

  async moveColumn(fieldname: string, direction: 'up' | 'down') {
    const currentIndex = this.columnOrder.indexOf(fieldname);
    if (currentIndex === -1) {
      return;
    }

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= this.columnOrder.length) {
      return;
    }

    const nextOrder = [...this.columnOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[currentIndex],
    ];

    this.columnOrder = nextOrder;
    this.allColumns = this.columnOrder
      .map((name) =>
        this.allColumns.find((column) => column.fieldname === name)
      )
      .filter(Boolean) as ColumnField[];

    this._applyColumnState();
    this._persistColumnState();
    await this.setReportData(undefined, true);
  }

  _applyColumnState() {
    this.columns = this.allColumns.filter(
      (column) => this.columnSelection[column.fieldname] ?? true
    );
  }

  _restorePersistedColumnState() {
    const stateMap = this.fyo.config.get('reportColumnState', {});
    const persistedState = stateMap?.[this.reportName];
    if (!persistedState) {
      return;
    }

    this.columnOrder = Array.isArray(persistedState.columnOrder)
      ? persistedState.columnOrder
      : [];
    this.columnSelection =
      persistedState.columnSelection &&
      typeof persistedState.columnSelection === 'object'
        ? persistedState.columnSelection
        : {};
  }

  _persistColumnState() {
    const stateMap = this.fyo.config.get('reportColumnState', {});
    const persistedState: ReportColumnState = {
      columnSelection: Object.fromEntries(
        Object.entries(this.columnSelection).map(([fieldname, value]) => [
          fieldname,
          Boolean(value),
        ])
      ),
      columnOrder: [...this.columnOrder],
    };
    const nextStateMap = {
      ...Object.fromEntries(
        Object.entries(stateMap ?? {}).map(([reportName, state]) => [
          reportName,
          state,
        ])
      ),
      [this.reportName]: persistedState,
    };

    this.fyo.config.set('reportColumnState', nextStateMap);
  }

  /**
   * Should first check if filter value is set
   * and update only if it is not set.
   */
  abstract setDefaultFilters(): void | Promise<void>;
  abstract getActions(): Action[];
  abstract getFilters(): Field[] | Promise<Field[]>;
  abstract getColumns(): ColumnField[] | Promise<ColumnField[]>;
  abstract setReportData(filter?: string, force?: boolean): Promise<void>;
}
