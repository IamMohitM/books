<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex items-center justify-between">
      <p class="font-semibold text-base dark:text-white">
        {{ t`Cash in Hand Summary` }}
      </p>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1">
          <label class="text-sm text-gray-600 dark:text-gray-400">
            {{ t`From` }}:
          </label>
          <input
            v-model="dateRangeFrom"
            type="date"
            class="
              text-sm
              px-2
              py-1
              border
              dark:border-gray-700
              rounded
              dark:bg-gray-800 dark:text-gray-100
            "
          />
        </div>
        <div class="flex items-center gap-1">
          <label class="text-sm text-gray-600 dark:text-gray-400">
            {{ t`To` }}:
          </label>
          <input
            v-model="dateRangeTo"
            type="date"
            class="
              text-sm
              px-2
              py-1
              border
              dark:border-gray-700
              rounded
              dark:bg-gray-800 dark:text-gray-100
            "
          />
        </div>
      </div>
    </div>

    <div v-if="summaryData.length > 0" class="overflow-x-auto">
      <table class="w-full text-sm border-collapse dark:text-gray-50">
        <thead>
          <tr class="border-b dark:border-gray-700">
            <th
              class="
                px-3
                py-2
                text-left
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Period` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Opening` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Debits` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Credits` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Expected` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Closing` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Difference` }}
            </th>
            <th
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-700
                dark:text-gray-300
              "
            >
              {{ t`Actions` }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in summaryData"
            :key="row.periodStart"
            class="border-b dark:border-gray-800 align-middle"
          >
            <td class="px-3 py-2 text-gray-900 dark:text-gray-100">
              <div class="font-medium">{{ row.period }}</div>
              <div class="mt-1 flex items-center gap-2">
                <span
                  class="
                    rounded-full
                    px-2
                    py-0.5
                    text-[11px]
                    font-medium
                    uppercase
                    tracking-wide
                  "
                  :class="getClosingBadgeClass(row)"
                >
                  {{ getClosingBadgeText(row) }}
                </span>
              </div>
              <div
                v-if="row.error"
                class="mt-1 text-xs text-red-600 dark:text-red-400"
              >
                {{ row.error }}
              </div>
            </td>
            <td class="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
              {{ fyo.format(row.openingBalance, 'Currency') }}
            </td>
            <td class="px-3 py-2 text-right text-green-600 dark:text-green-400">
              {{ fyo.format(row.debits, 'Currency') }}
            </td>
            <td class="px-3 py-2 text-right text-red-600 dark:text-red-400">
              {{ fyo.format(row.credits, 'Currency') }}
            </td>
            <td
              class="
                px-3
                py-2
                text-right
                font-semibold
                text-gray-900
                dark:text-gray-100
              "
            >
              {{ fyo.format(row.expectedClosingBalance, 'Currency') }}
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center justify-end">
                <label
                  class="
                    flex
                    w-40
                    items-center
                    gap-2
                    rounded-xl
                    border
                    px-3
                    py-2
                    transition-colors
                    dark:bg-gray-850
                  "
                  :class="getClosingFieldClass(row)"
                >
                  <span
                    class="
                      text-[11px]
                      font-semibold
                      uppercase
                      tracking-wide
                      text-gray-400
                      dark:text-gray-500
                    "
                  >
                    {{ t`Close` }}
                  </span>
                  <input
                    :value="row.draftClosingBalance"
                    type="number"
                    step="0.01"
                    class="
                      w-full
                      bg-transparent
                      text-right text-sm
                      font-medium
                      text-gray-900
                      outline-none
                      dark:text-gray-100
                    "
                    :disabled="row.saving || row.deleting"
                    @input="updateDraft(row, $event)"
                  />
                </label>
              </div>
            </td>
            <td
              class="px-3 py-2 text-right font-semibold"
              :class="getDifferenceClass(row.difference)"
            >
              <span
                v-if="row.difference === null"
                class="
                  text-xs
                  font-medium
                  uppercase
                  tracking-wide
                  text-gray-400
                "
              >
                {{ t`Pending` }}
              </span>
              <span v-else>
                {{ row.difference > 0 ? '+' : '' }}
                {{ fyo.format(row.difference, 'Currency') }}
              </span>
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center justify-end gap-1.5">
                <button
                  class="
                    inline-flex
                    min-w-[4.5rem]
                    items-center
                    justify-center
                    rounded-full
                    px-3
                    py-1.5
                    text-xs
                    font-medium
                    transition-colors
                    disabled:opacity-50
                  "
                  :class="
                    canSave(row)
                      ? 'bg-black text-white hover:bg-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-white'
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                  "
                  :disabled="!canSave(row)"
                  @click="saveClosingBalance(row)"
                >
                  {{ row.saving ? t`Saving...` : t`Save` }}
                </button>
                <button
                  class="
                    inline-flex
                    min-w-[4.5rem]
                    items-center
                    justify-center
                    rounded-full
                    px-3
                    py-1.5
                    text-xs
                    font-medium
                    transition-colors
                    disabled:opacity-50
                  "
                  :class="
                    row.recordName && !row.saving && !row.deleting
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                  "
                  :disabled="!row.recordName || row.saving || row.deleting"
                  @click="clearClosingBalance(row)"
                >
                  {{ row.deleting ? t`Clearing...` : t`Clear` }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="flex-1 w-full h-full flex-center my-20">
      <span class="text-base text-gray-600 dark:text-gray-500">
        {{ t`No cash transactions in this period` }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { defineComponent } from 'vue';
import { CashInHandSummaryRow } from 'utils/db/types';

type SummaryRowViewModel = CashInHandSummaryRow & {
  draftClosingBalance: string;
  saving: boolean;
  deleting: boolean;
  error: string | null;
};

export default defineComponent({
  name: 'CashInHandSummary',
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      summaryData: [] as SummaryRowViewModel[],
      dateRangeFrom: this.getDefaultFromDate(),
      dateRangeTo: this.getDefaultToDate(),
      fyo,
    };
  },
  watch: {
    dateRangeFrom: 'setData',
    dateRangeTo: 'setData',
  },
  mounted() {
    void this.setData();
  },
  methods: {
    getDefaultFromDate(): string {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();

      const fromDate = new Date(year, month - 5, 1);
      const fromYear = fromDate.getFullYear();
      const fromMonth = String(fromDate.getMonth() + 1).padStart(2, '0');
      const fromDay = String(fromDate.getDate()).padStart(2, '0');

      return `${fromYear}-${fromMonth}-${fromDay}`;
    },
    getDefaultToDate(): string {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const date = String(today.getDate()).padStart(2, '0');

      return `${year}-${month}-${date}`;
    },
    hydrateRows(rows: CashInHandSummaryRow[]): SummaryRowViewModel[] {
      return rows.map((row) => ({
        ...row,
        draftClosingBalance:
          row.actualClosingBalance === null
            ? ''
            : String(row.actualClosingBalance),
        saving: false,
        deleting: false,
        error: null,
      }));
    },
    parseDraftValue(value: string): number | null {
      const normalized = value.trim();
      if (!normalized.length) {
        return null;
      }

      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    },
    updateDraft(row: SummaryRowViewModel, event: Event) {
      row.error = null;
      row.draftClosingBalance = (event.target as HTMLInputElement).value;
    },
    canSave(row: SummaryRowViewModel): boolean {
      if (row.saving || row.deleting) {
        return false;
      }

      const parsed = this.parseDraftValue(row.draftClosingBalance);
      if (parsed === null) {
        return false;
      }

      return parsed !== row.actualClosingBalance;
    },
    getDifferenceClass(value: number | null): string {
      if (value === null) {
        return 'text-gray-400 dark:text-gray-500';
      }

      if (value > 0) {
        return 'text-green-600 dark:text-green-400';
      }

      if (value < 0) {
        return 'text-red-600 dark:text-red-400';
      }

      return 'text-gray-900 dark:text-gray-100';
    },
    getClosingBadgeText(row: SummaryRowViewModel): string {
      if (row.recordName) {
        return this.t`Saved`;
      }

      if (this.parseDraftValue(row.draftClosingBalance) !== null) {
        return this.t`Editing`;
      }

      return this.t`Open`;
    },
    getClosingBadgeClass(row: SummaryRowViewModel): string {
      if (row.recordName) {
        return 'bg-green-100 text-green-700 dark:bg-green-400/10 dark:text-green-300';
      }

      if (this.parseDraftValue(row.draftClosingBalance) !== null) {
        return 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300';
      }

      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
    },
    getClosingFieldClass(row: SummaryRowViewModel): string {
      if (row.error) {
        return 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10';
      }

      if (this.canSave(row)) {
        return 'border-gray-900 bg-white shadow-sm dark:border-gray-500 dark:bg-gray-800';
      }

      if (row.recordName) {
        return 'border-green-200 bg-green-50/70 dark:border-green-500/30 dark:bg-green-500/10';
      }

      return 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';
    },
    async saveClosingBalance(row: SummaryRowViewModel) {
      const closingBalance = this.parseDraftValue(row.draftClosingBalance);
      if (closingBalance === null) {
        row.error = this.$t`Enter a closing balance`;
        return;
      }

      row.saving = true;
      row.error = null;
      const recordName = row.recordName ?? row.periodStart;

      try {
        if (row.recordName) {
          const doc = await fyo.doc.getDoc(
            ModelNameEnum.MonthlyCashClose,
            recordName
          );
          await doc.set('closingBalance', closingBalance);
          await doc.sync();
        } else {
          const doc = fyo.doc.getNewDoc(ModelNameEnum.MonthlyCashClose, {
            name: recordName,
            periodStart: row.periodStart,
            closingBalance,
          });
          await doc.sync();
        }

        await this.setData();
      } catch (error) {
        row.error = this.$t`Error saving closing balance`;
      } finally {
        row.saving = false;
      }
    },
    async clearClosingBalance(row: SummaryRowViewModel) {
      if (!row.recordName) {
        row.draftClosingBalance = '';
        row.error = null;
        return;
      }

      row.deleting = true;
      row.error = null;

      try {
        await fyo.db.delete(ModelNameEnum.MonthlyCashClose, row.recordName);
        await this.setData();
      } catch (error) {
        row.error = this.$t`Error clearing closing balance`;
      } finally {
        row.deleting = false;
      }
    },
    async setData() {
      const result = await fyo.db.getCashInHandSummary(
        this.dateRangeFrom as string,
        this.dateRangeTo as string
      );
      this.summaryData = this.hydrateRows(result);
    },
  },
});
</script>
