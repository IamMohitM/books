<template>
  <div class="flex">
    <SearchBar />
    <!-- Back Button -->
    <a
      ref="backlink"
      class="
        nav-link
        border-l border-r border-white
        dark:border-gray-850 dark:bg-gray-900
      "
      :class="
        historyState.back
          ? 'text-gray-700 dark:text-gray-300 cursor-pointer'
          : 'text-gray-400 dark:text-gray-700'
      "
      @click="$router.back()"
    >
      <feather-icon name="chevron-left" class="w-4 h-4" />
    </a>
    <!-- Forward Button -->
    <a
      class="nav-link rounded-md rounded-l-none dark:bg-gray-900"
      :class="
        historyState.forward
          ? 'text-gray-700 dark:text-gray-400 cursor-pointer'
          : 'text-gray-400 dark:text-gray-700'
      "
      @click="$router.forward()"
    >
      <feather-icon name="chevron-right" class="w-4 h-4" />
    </a>
  </div>
</template>
<script lang="ts">
import { shortcutsKey } from 'src/utils/injectionKeys';
import { ref, inject } from 'vue';
import { defineComponent } from 'vue';
import SearchBar from './SearchBar.vue';
import { historyState } from 'src/utils/refs';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import { getFormRoute, routeTo } from 'src/utils/ui';
import { handleErrorWithDialog } from 'src/errorHandling';

const COMPONENT_NAME = 'PageHeaderNavGroup';

export default defineComponent({
  components: { SearchBar },
  setup() {
    return {
      historyState,
      backlink: ref<HTMLAnchorElement | null>(null),
      shortcuts: inject(shortcutsKey),
    };
  },
  computed: {
    hasBack() {
      return !!history.back;
    },
    hasForward() {
      return !!history.forward;
    },
  },
  activated() {
    this.shortcuts?.shift.set(COMPONENT_NAME, ['Backspace'], () => {
      this.backlink?.click();
    });
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['KeyJ'], async () => {
      await this.createJournalEntry();
    });
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['BracketLeft'], () => {
      this.backlink?.click();
    });
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['BracketRight'], () => {
      this.$router.forward();
    });
    // @ts-ignore
    window.ng = this;
  },
  deactivated() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  methods: {
    async createJournalEntry() {
      try {
        const doc = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry);
        const route = getFormRoute(ModelNameEnum.JournalEntry, doc.name!);
        await routeTo(route);
      } catch (err) {
        await handleErrorWithDialog(err as Error);
      }
    },
  },
});
</script>

<style scoped>
.nav-link {
  @apply flex items-center bg-gray-200 px-3;
}
</style>
