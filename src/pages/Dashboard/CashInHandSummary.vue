<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex items-center justify-between">
      <p class="font-semibold text-base dark:text-white">
        {{ t`Cash in Hand Summary` }}
      </p>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1">
          <label class="text-sm text-gray-600 dark:text-gray-400"
            >{{ t`From` }}:</label
          >
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
          <label class="text-sm text-gray-600 dark:text-gray-400"
            >{{ t`To` }}:</label
          >
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
              {{ t`Closing` }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in summaryData"
            :key="index"
            class="
              border-b
              dark:border-gray-800
              hover:bg-gray-50
              dark:hover:bg-gray-800
              cursor-pointer
            "
            @click="selectMonth(row)"
          >
            <td class="px-3 py-2 text-gray-900 dark:text-gray-100">
              {{ row.period }}
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
              {{ fyo.format(row.closingBalance, 'Currency') }}
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
import { fyo } from 'src/initFyo';
import { defineComponent } from 'vue';
import { CashInHandSummaryRow } from 'utils/db/types';

export default defineComponent({
  name: 'CashInHandSummary',
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      summaryData: [] as CashInHandSummaryRow[],
      dateRangeFrom: this.getDefaultFromDate(),
      dateRangeTo: this.getDefaultToDate(),
      selectedMonth: null as CashInHandSummaryRow | null,
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
    selectMonth(row: CashInHandSummaryRow) {
      this.selectedMonth = row;
      this.$emit('month-selected', row);
    },
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
    async setData() {
      const result = await fyo.db.getCashInHandSummary(
        this.dateRangeFrom as string,
        this.dateRangeTo as string
      );
      this.summaryData = result;
    },
  },
});
</script>
