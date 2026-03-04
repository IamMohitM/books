<template>
  <div class="p-4 border dark:border-gray-800 rounded">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ t`Cash in Hand` }}
      </p>
      <input
        v-model="asOfDate"
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
    <p class="text-lg font-semibold dark:text-gray-50 mt-2">
      {{ fyo.format(cashInHand, 'Currency') }}
    </p>
  </div>
</template>

<script lang="ts">
import { fyo } from 'src/initFyo';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'CashInHand',
  data() {
    return {
      cashInHand: 0,
      asOfDate: this.getTodayISO(),
      fyo,
    };
  },
  watch: {
    asOfDate: 'setData',
  },
  mounted() {
    void this.setData();
  },
  methods: {
    getTodayISO(): string {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
    async setData() {
      const result = await fyo.db.getCashInHand(this.asOfDate as string);
      this.cashInHand = result.cashInHand;
    },
  },
});
</script>
