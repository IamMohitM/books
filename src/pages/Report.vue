<template>
  <div class="flex flex-col w-full h-full">
    <PageHeader :title="title">
      <DropdownWithActions
        v-for="group of groupedActions"
        :key="group.label"
        :icon="false"
        :type="group.type"
        :actions="group.actions"
        class="text-xs"
      >
        {{ group.group }}
      </DropdownWithActions>
      <Button
        ref="printButton"
        :icon="true"
        :title="t`Open Report Print View`"
        @click="routeTo(`/report-print/${reportClassName}`)"
      >
        <feather-icon name="printer" class="w-4 h-4"></feather-icon>
      </Button>
      <Popover
        v-if="report?.columnOptions.length"
        placement="bottom-end"
        :popover-class="'w-64'"
      >
        <template #target="{ togglePopover }">
          <Button
            :icon="true"
            :title="t`Choose visible columns`"
            @click="togglePopover()"
          >
            <feather-icon name="sliders" class="w-4 h-4"></feather-icon>
          </Button>
        </template>
        <template #content>
          <div class="p-3">
            <p
              class="
                mb-2
                text-xs
                font-semibold
                uppercase
                tracking-wide
                text-gray-500
                dark:text-gray-400
              "
            >
              {{ t`Columns` }}
            </p>
            <div class="flex flex-col gap-2">
              <label
                v-for="column in report.columnOptions"
                :key="column.fieldname"
                class="
                  flex
                  items-center
                  justify-between
                  gap-3
                  rounded
                  px-2
                  py-1.5
                  hover:bg-gray-50
                  dark:hover:bg-gray-800
                "
              >
                <span class="text-sm text-gray-800 dark:text-gray-100">
                  {{ column.label }}
                </span>
                <div class="flex items-center gap-1.5">
                  <button
                    class="
                      inline-flex
                      h-6
                      w-6
                      items-center
                      justify-center
                      rounded
                      text-gray-500
                      hover:bg-gray-100 hover:text-gray-900
                      dark:text-gray-400
                      dark:hover:bg-gray-700
                      dark:hover:text-gray-100
                    "
                    type="button"
                    :title="t`Move left`"
                    @click.prevent="moveColumn(column.fieldname, 'up')"
                  >
                    <feather-icon name="chevron-up" class="w-3 h-3" />
                  </button>
                  <button
                    class="
                      inline-flex
                      h-6
                      w-6
                      items-center
                      justify-center
                      rounded
                      text-gray-500
                      hover:bg-gray-100 hover:text-gray-900
                      dark:text-gray-400
                      dark:hover:bg-gray-700
                      dark:hover:text-gray-100
                    "
                    type="button"
                    :title="t`Move right`"
                    @click.prevent="moveColumn(column.fieldname, 'down')"
                  >
                    <feather-icon name="chevron-down" class="w-3 h-3" />
                  </button>
                  <input
                    type="checkbox"
                    :checked="report.columnSelection[column.fieldname] ?? true"
                    @change="handleColumnToggle(column.fieldname, $event)"
                  />
                </div>
              </label>
            </div>
          </div>
        </template>
      </Popover>
    </PageHeader>

    <!-- Filters -->
    <div
      v-if="report && report.filters.length"
      class="grid grid-cols-5 gap-4 p-4 border-b dark:border-gray-800"
    >
      <FormControl
        v-for="field in report.filters"
        :key="field.fieldname + '-filter'"
        :border="true"
        size="small"
        :class="[field.fieldtype === 'Check' ? 'self-end' : '']"
        :show-label="true"
        :df="field"
        :value="report.get(field.fieldname)"
        :read-only="loading"
        @change="async (value) => await report?.set(field.fieldname, value)"
      />
    </div>

    <!-- Report Body -->
    <ListReport v-if="report" :report="report" class="" />
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { reports } from 'reports';
import { Report } from 'reports/Report';
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import Popover from 'src/components/Popover.vue';
import ListReport from 'src/components/Report/ListReport.vue';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap, getReport } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup } from 'src/utils/types';
import { routeTo } from 'src/utils/ui';
import { PropType, computed, defineComponent, inject } from 'vue';

export default defineComponent({
  components: {
    PageHeader,
    FormControl,
    ListReport,
    DropdownWithActions,
    Button,
    Popover,
  },
  provide() {
    return {
      report: computed(() => this.report),
    };
  },
  props: {
    reportClassName: {
      type: String as PropType<keyof typeof reports>,
      required: true,
    },
    defaultFilters: {
      type: String,
      default: '{}',
    },
  },
  setup() {
    return { shortcuts: inject(shortcutsKey) };
  },
  data() {
    return {
      loading: false,
      report: null as null | Report,
    };
  },
  computed: {
    title() {
      return reports[this.reportClassName]?.title ?? t`Report`;
    },
    groupedActions() {
      const actions = this.report?.getActions() ?? [];
      const actionsMap = actions.reduce((acc, ac) => {
        if (!ac.group) {
          ac.group = 'none';
        }

        acc[ac.group] ??= {
          group: ac.group,
          label: ac.label ?? '',
          type: ac.type ?? 'secondary',
          actions: [],
        };

        acc[ac.group].actions.push(ac);
        return acc;
      }, {} as Record<string, ActionGroup>);

      return Object.values(actionsMap);
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async activated() {
    docsPathRef.value =
      docsPathMap[this.reportClassName] ?? docsPathMap.Reports!;
    await this.setReportData();

    const filters = this.$route.query as Record<string, DocValue>;
    const validFilters: Record<string, DocValue> = {};

    if (filters.defaultFilters && typeof filters.defaultFilters === 'string') {
      const parsed = JSON.parse(filters.defaultFilters);
      Object.assign(validFilters, parsed);
    }

    for (const [key, value] of Object.entries(filters)) {
      if (key !== 'defaultFilters' && typeof value === 'string') {
        validFilters[key] = value;
      }
    }
    const filterKeys = Object.keys(validFilters);
    for (const key of filterKeys) {
      await this.report?.set(key, validFilters[key]);
    }

    if (filterKeys.length) {
      await this.report?.updateData();
    }

    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.rep = this;
    }
  },
  deactivated() {
    docsPathRef.value = '';
    this.shortcuts?.delete(this.reportClassName);
  },
  methods: {
    routeTo,
    async handleColumnToggle(fieldname: string, event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      await this.updateColumnSelection(fieldname, target.checked);
    },
    async updateColumnSelection(fieldname: string, value: boolean) {
      await this.report?.updateColumnSelection(fieldname, value);
    },
    async moveColumn(fieldname: string, direction: 'up' | 'down') {
      await this.report?.moveColumn(fieldname, direction);
    },
    async setReportData() {
      if (this.report === null) {
        this.report = await getReport(this.reportClassName);
      }

      if (!this.report.reportData.length) {
        await this.report.setReportData();
      } else if (this.report.shouldRefresh) {
        await this.report.setReportData(undefined, true);
      }
    },
  },
});
</script>
