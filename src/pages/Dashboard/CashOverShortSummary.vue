<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex items-center justify-between gap-3">
      <p class="font-semibold text-base dark:text-white whitespace-nowrap shrink-0">
        {{ t`Account Summary` }}
      </p>
      <div class="flex items-center gap-1.5 justify-end whitespace-nowrap">
        <label class="text-sm text-gray-600 dark:text-gray-400">{{ t`Account` }}:</label>
        <select
          v-model="selectedAccount"
          class="w-36 text-sm px-2 py-1 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
        >
          <option v-for="account in accounts" :key="account.name" :value="account.name">
            {{ account.name }}
          </option>
        </select>
        <div class="flex items-center gap-1">
          <label class="text-sm text-gray-600 dark:text-gray-400">{{ t`From` }}:</label>
          <input
            v-model="dateRangeFrom"
            type="date"
            class="w-36 text-sm px-2 py-1 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div class="flex items-center gap-1">
          <label class="text-sm text-gray-600 dark:text-gray-400">{{ t`To` }}:</label>
          <input
            v-model="dateRangeTo"
            type="date"
            class="w-36 text-sm px-2 py-1 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>
    </div>

    <div v-if="summaryData.length > 0" class="overflow-x-auto">
      <table class="w-full text-sm border-collapse dark:text-gray-50">
        <thead>
          <tr class="border-b dark:border-gray-700">
            <th class="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">
              {{ t`Period` }}
            </th>
            <th class="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
              {{ t`Debits` }}
            </th>
            <th class="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
              {{ t`Credits` }}
            </th>
            <th class="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
              {{ t`Balance` }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in summaryData"
            :key="`${row.periodStart}-${row.periodEnd}`"
            class="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <td class="px-3 py-2 text-gray-900 dark:text-gray-100">{{ row.period }}</td>
            <td class="px-3 py-2 text-right text-green-600 dark:text-green-400">
              {{ fyo.format(row.debits, 'Currency') }}
            </td>
            <td class="px-3 py-2 text-right text-red-600 dark:text-red-400">
              {{ fyo.format(row.credits, 'Currency') }}
            </td>
            <td
              class="px-3 py-2 text-right font-semibold"
              :class="row.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
            >
              {{ fyo.format(row.balance, 'Currency') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="flex-1 w-full h-full flex-center my-20">
      <span class="text-base text-gray-600 dark:text-gray-500">
        {{ selectedAccount ? t`No posted entries for this account in this period` : t`No account selected` }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { defineComponent } from 'vue';
import type { MonthlyAccountSummaryRow } from 'utils/db/types';

export default defineComponent({
  name: 'CashOverShortSummary',
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      dateRangeFrom: this.getDefaultFromDate(),
      dateRangeTo: this.getDefaultToDate(),
      selectedAccount: '',
      accounts: [] as Array<{ name: string }>,
      summaryData: [] as MonthlyAccountSummaryRow[],
      fyo,
    };
  },
  watch: {
    dateRangeFrom: 'setData',
    dateRangeTo: 'setData',
    selectedAccount: 'setData',
  },
  mounted() {
    void this.loadAccounts();
  },
  methods: {
    getDefaultFromDate(): string {
      const today = new Date();
      const fromDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
      return [
        fromDate.getFullYear(),
        String(fromDate.getMonth() + 1).padStart(2, '0'),
        String(fromDate.getDate()).padStart(2, '0'),
      ].join('-');
    },
    getDefaultToDate(): string {
      const today = new Date();
      return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-');
    },
    async loadAccounts() {
      const rows = await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'isGroup'],
        filters: { isGroup: false },
        orderBy: 'name',
      });
      this.accounts = rows as Array<{ name: string }>;

      const preferred = this.accounts.find((row) => {
        const name = row.name.toLowerCase();
        return name.includes('cash over') || name.includes('cash short');
      });

      this.selectedAccount = preferred?.name ?? this.accounts[0]?.name ?? '';
      await this.setData();
    },
    async setData() {
      if (!this.selectedAccount) {
        this.summaryData = [];
        return;
      }

      this.summaryData = await fyo.db.getMonthlyAccountSummary(
        this.selectedAccount,
        this.dateRangeFrom,
        this.dateRangeTo
      );
    },
  },
});
</script>
