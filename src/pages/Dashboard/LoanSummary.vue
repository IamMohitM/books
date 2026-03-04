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

    <div v-if="hasData" class="mt-4 grid grid-cols-3 gap-4">
      <div class="p-4 rounded border dark:border-gray-800">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Principal Outstanding` }}
        </p>
        <p class="text-lg font-semibold dark:text-gray-50">
          {{ fyo.format(summary.principalOutstanding, 'Currency') }}
        </p>
      </div>
      <div class="p-4 rounded border dark:border-gray-800">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Interest Owed` }}
        </p>
        <p class="text-lg font-semibold dark:text-gray-50">
          {{ fyo.format(summary.interestOwed, 'Currency') }}
        </p>
      </div>
      <div class="p-4 rounded border dark:border-gray-800">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Total Due` }}
        </p>
        <p class="text-lg font-semibold dark:text-gray-50">
          {{ fyo.format(summary.totalDue, 'Currency') }}
        </p>
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
    summary: {
      principalOutstanding: 0,
      interestOwed: 0,
      totalDue: 0,
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
      this.summary = snapshots.reduce(
        (acc, row) => {
          acc.principalOutstanding += row.principalOutstanding;
          acc.interestOwed += row.interestOwed;
          acc.totalDue += row.totalDue;
          return acc;
        },
        { principalOutstanding: 0, interestOwed: 0, totalDue: 0 }
      );
      this.hasData = snapshots.length > 0;
    },
  },
});
</script>
