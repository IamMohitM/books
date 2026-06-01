<template>
  <div class="flex flex-col h-full">
    <SectionHeader>
      <template #title>{{ t`Loans` }}</template>
      <template #action>
        <PeriodSelector
          :value="period"
          :options="periodOptions"
          @change="(value) => (period = value)"
        />
      </template>
    </SectionHeader>

    <div v-if="hasData" class="mt-4 flex flex-col gap-6">
      <!-- Loans Taken (Liabilities) -->
      <div v-if="takenSummary.hasData" class="flex flex-col">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 rounded-full border border-amber-200/50 dark:border-amber-900/30">
            {{ t`Liabilities` }}
          </span>
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {{ t`Loans Taken` }}
          </h4>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 hover:shadow-md hover:border-amber-200 dark:hover:border-amber-900/30 transition-all duration-300">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
              {{ t`Principal Outstanding` }}
            </p>
            <p class="text-lg font-bold mt-1 text-gray-900 dark:text-gray-50">
              {{ fyo.format(takenSummary.principalOutstanding, 'Currency') }}
            </p>
          </div>
          <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 hover:shadow-md hover:border-amber-200 dark:hover:border-amber-900/30 transition-all duration-300">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
              {{ t`Interest Owed` }}
            </p>
            <p class="text-lg font-bold mt-1 text-gray-900 dark:text-gray-50">
              {{ fyo.format(takenSummary.interestOwed, 'Currency') }}
            </p>
          </div>
          <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 hover:shadow-md hover:border-amber-200 dark:hover:border-amber-900/30 transition-all duration-300">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
              {{ t`Total Due` }}
            </p>
            <p class="text-lg font-bold mt-1 text-gray-900 dark:text-gray-50">
              {{ fyo.format(takenSummary.totalDue, 'Currency') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Loans Provided (Assets) -->
      <div v-if="providedSummary.hasData" class="flex flex-col">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200/50 dark:border-emerald-900/30">
            {{ t`Assets` }}
          </span>
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {{ t`Loans Provided` }}
          </h4>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-all duration-300">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
              {{ t`Principal Outstanding` }}
            </p>
            <p class="text-lg font-bold mt-1 text-gray-900 dark:text-gray-50">
              {{ fyo.format(providedSummary.principalOutstanding, 'Currency') }}
            </p>
          </div>
          <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-all duration-300">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
              {{ t`Interest Receivable` }}
            </p>
            <p class="text-lg font-bold mt-1 text-gray-900 dark:text-gray-50">
              {{ fyo.format(providedSummary.interestOwed, 'Currency') }}
            </p>
          </div>
          <div class="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-all duration-300">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
              {{ t`Total Receivable` }}
            </p>
            <p class="text-lg font-bold mt-1 text-gray-900 dark:text-gray-50">
              {{ fyo.format(providedSummary.totalDue, 'Currency') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 w-full h-full flex-center my-20">
      <span class="text-base text-gray-600 dark:text-gray-500">
        {{ t`No loans yet` }}
      </span>
    </div>
  </div>
</template>
<script lang="ts">
import { DateTime } from 'luxon';
import { fyo } from 'src/initFyo';
import { getDatesAndPeriodList } from 'src/utils/misc';
import { defineComponent } from 'vue';
import DashboardChartBase from './BaseDashboardChart.vue';
import PeriodSelector from './PeriodSelector.vue';
import SectionHeader from './SectionHeader.vue';

export default defineComponent({
  name: 'LoanSummary',
  components: {
    PeriodSelector,
    SectionHeader,
  },
  extends: DashboardChartBase,
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data: () => ({
    hasData: false,
    takenSummary: {
      principalOutstanding: 0,
      interestOwed: 0,
      totalDue: 0,
      hasData: false,
    },
    providedSummary: {
      principalOutstanding: 0,
      interestOwed: 0,
      totalDue: 0,
      hasData: false,
    },
    periodOptions: ['This Year', 'This Quarter', 'YTD'],
  }),
  activated() {
    this.setData();
  },
  methods: {
    async setData() {
      const { toDate } = getDatesAndPeriodList(this.period);
      const asOfDate = DateTime.fromISO(toDate.toISODate() as string)
        .minus({ days: 1 })
        .toISODate();

      const snapshots = await fyo.db.getLoanPortfolioSnapshot(
        asOfDate as string
      );

      const takenLoans = snapshots.filter(
        (row) => (row as any).loanType !== 'Provided'
      );
      const providedLoans = snapshots.filter(
        (row) => (row as any).loanType === 'Provided'
      );

      this.takenSummary = takenLoans.reduce(
        (acc, row) => {
          acc.principalOutstanding += row.principalOutstanding;
          acc.interestOwed += row.interestOwed;
          acc.totalDue += row.totalDue;
          return acc;
        },
        {
          principalOutstanding: 0,
          interestOwed: 0,
          totalDue: 0,
          hasData: takenLoans.length > 0,
        }
      );

      this.providedSummary = providedLoans.reduce(
        (acc, row) => {
          acc.principalOutstanding += row.principalOutstanding;
          acc.interestOwed += row.interestOwed;
          acc.totalDue += row.totalDue;
          return acc;
        },
        {
          principalOutstanding: 0,
          interestOwed: 0,
          totalDue: 0,
          hasData: providedLoans.length > 0,
        }
      );

      this.hasData = snapshots.length > 0;
    },
  },
});
</script>
