<template>
  <Dropdown :items="suggestions" :is-loading="isLoading" :df="df" :doc="doc">
    <template
      #default="{
        toggleDropdown,
        highlightItemUp,
        highlightItemDown,
        selectHighlightedItem,
      }"
    >
      <div v-if="showLabel" :class="labelClasses">
        {{ df.label }}
      </div>
      <div
        class="flex items-center justify-between rounded"
        :style="containerStyles"
        :class="containerClasses"
        @click="focusInput(toggleDropdown)"
      >
        <div class="flex flex-1 flex-wrap items-center gap-1 px-2 py-1">
          <span
            v-for="selected in selectedValues"
            :key="selected"
            class="
              inline-flex
              items-center
              gap-1
              rounded
              bg-gray-100
              px-2
              py-1
              text-xs
              text-gray-800
              dark:bg-gray-800
              dark:text-gray-100
            "
          >
            {{ selected }}
            <button
              type="button"
              class="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
              @click.stop="removeValue(selected)"
            >
              x
            </button>
          </span>
          <input
            ref="input"
            spellcheck="false"
            class="min-w-28 flex-1 bg-transparent focus:outline-none"
            :class="inputClasses"
            type="text"
            :value="linkValue"
            :placeholder="selectedValues.length ? '' : inputPlaceholder"
            :readonly="isReadOnly"
            :tabindex="isReadOnly ? '-1' : '0'"
            @focus="onFocus(toggleDropdown)"
            @blur="onBlur(toggleDropdown)"
            @input="(e) => onInput(e, toggleDropdown)"
            @keydown.up="highlightItemUp($event)"
            @keydown.down="onKeyDownDown($event, toggleDropdown, highlightItemDown)"
            @keydown.enter="
              onPressEnter($event, toggleDropdown, selectHighlightedItem)
            "
            @keydown.backspace="removeLastValueOnBackspace"
            @keydown.tab="closeDropdown($event, toggleDropdown)"
            @keydown.esc="closeDropdown($event, toggleDropdown)"
          />
        </div>
      </div>
    </template>
  </Dropdown>
</template>

<script lang="ts">
import { t } from 'fyo';
import { Field } from 'schemas/types';
import Dropdown from 'src/components/Dropdown.vue';
import { fyo } from 'src/initFyo';
import { DropdownItem } from 'src/utils/types';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import { fuzzyMatch } from 'src/utils';
import { defineComponent, PropType } from 'vue';
import Base from './Base.vue';

type LinkOption = {
  label: string;
  value: string;
  group?: string;
};

function parseSerializedValues(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item).trim())
        .filter(Boolean);
    }
  } catch {
    return [value].map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function serializeValues(values: string[]): string | null {
  if (!values.length) {
    return null;
  }

  return JSON.stringify(values);
}

export default defineComponent({
  name: 'MultiLink',
  components: { Dropdown },
  extends: Base,
  props: {
    df: { type: Object as PropType<Field>, required: true },
  },
  data() {
    return {
      selectedValues: [] as string[],
      linkValue: '',
      isLoading: false,
      suggestions: [] as DropdownItem[],
      results: [] as LinkOption[],
      isFocused: false,
    };
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        if (this.isFocused) {
          return;
        }

        this.selectedValues = parseSerializedValues(String(newValue ?? ''));
      },
    },
  },
  methods: {
    focusInput(toggleDropdown: (flag?: boolean) => void) {
      if (this.isReadOnly) {
        return;
      }

      this.$refs.input instanceof HTMLInputElement && this.$refs.input.focus();
      toggleDropdown(true);
      void this.updateSuggestions();
    },
    parse(value: unknown): unknown {
      if (Array.isArray(value)) {
        return serializeValues(value.map((item) => String(item)));
      }

      if (typeof value === 'string') {
        return value;
      }

      return null;
    },
    async getOptions(filters: Record<string, unknown> = {}) {
      const schemaName = this.df.target;
      if (!schemaName) {
        return [];
      }

      if (this.results.length) {
        return this.results;
      }

      const schema = fyo.schemaMap[schemaName];
      const fields = [
        ...new Set(['name', schema?.titleField, this.df.groupBy]),
      ].filter(Boolean) as string[];

      const rows = await fyo.db.getAll(schemaName, {
        fields,
        filters,
      });

      this.results = rows
        .map((row) => ({
          label: String(row[schema?.titleField ?? 'name'] ?? row.name),
          value: String(row.name),
          group: this.df.groupBy ? String(row[this.df.groupBy] ?? '') : undefined,
        }))
        .filter((row) => row.value);

      return this.results;
    },
    async getFilters() {
      if (this.df.filters) {
        return this.df.filters;
      }

      if (fyo.singles.SystemSettings?.removeFilter) {
        return null;
      }

      const { schemaName, fieldname } = this.df;
      const getFilters = schemaName
        ? fyo.models[schemaName]?.filters?.[fieldname]
        : undefined;

      if (getFilters === undefined) {
        return null;
      }

      if (this.doc) {
        return await getFilters(this.doc);
      }

      try {
        return await getFilters();
      } catch {
        return null;
      }
    },
    async getCreateFilters() {
      const { schemaName, fieldname } = this.df;
      const getCreateFilters =
        schemaName && fieldname
          ? fyo.models[schemaName]?.createFilters?.[fieldname]
          : undefined;

      const createFilters = await getCreateFilters?.(this.doc);
      if (createFilters !== undefined) {
        return createFilters;
      }

      const filters = (await this.getFilters()) ?? {};
      return getCreateFiltersFromListViewFilters(filters);
    },
    async updateSuggestions(keyword = '') {
      this.isLoading = true;
      this.suggestions = await this.getSuggestions(keyword);
      this.isLoading = false;
    },
    async getSuggestions(keyword = ''): Promise<DropdownItem[]> {
      let options = await this.getOptions((await this.getFilters()) ?? {});
      options = options.filter(
        (option) => !this.selectedValues.includes(option.value)
      );

      if (keyword) {
        options = options
          .map((item) => ({ ...fuzzyMatch(keyword, item.label), item }))
          .filter(({ isMatch }) => isMatch)
          .sort((a, b) => a.distance - b.distance)
          .map(({ item }) => item);
      }

      if (!options.length) {
        return [
          {
            label: t`No results found`,
            action: () => {},
            component: {
              template:
                '<span class="text-gray-600 dark:text-gray-400">{{ t`No results found` }}</span>',
            },
          },
        ];
      }

      return options.map((option) => ({
        label: option.label,
        value: option.value,
        group: option.group,
        action: () => this.selectValue(option.value),
      }));
    },
    selectValue(value: string) {
      if (this.selectedValues.includes(value)) {
        return;
      }

      const nextValues = [...this.selectedValues, value];
      this.selectedValues = nextValues;
      this.linkValue = '';
      this.triggerChange(nextValues);
    },
    removeValue(value: string) {
      const nextValues = this.selectedValues.filter((item) => item !== value);
      this.selectedValues = nextValues;
      this.triggerChange(nextValues);
    },
    removeLastValueOnBackspace() {
      if (this.linkValue || !this.selectedValues.length) {
        return;
      }

      this.removeValue(this.selectedValues[this.selectedValues.length - 1]);
    },
    onFocus(toggleDropdown: (flag?: boolean) => void) {
      this.isFocused = true;
      toggleDropdown(true);
      void this.updateSuggestions(this.linkValue);
    },
    onBlur(toggleDropdown: (flag?: boolean) => void) {
      this.isFocused = false;
      window.setTimeout(() => toggleDropdown(false), 100);
    },
    onInput(
      e: Event,
      toggleDropdown: (flag?: boolean) => void
    ) {
      const target = e.target as HTMLInputElement;
      this.linkValue = target.value;
      toggleDropdown(true);
      void this.updateSuggestions(this.linkValue);
    },
    onKeyDownDown(
      e: Event,
      toggleDropdown: (flag?: boolean) => void,
      highlightItemDown: (e?: Event) => void
    ) {
      toggleDropdown(true);
      highlightItemDown(e);
    },
    onPressEnter(
      e: Event,
      toggleDropdown: (flag?: boolean) => void,
      selectHighlightedItem: () => Promise<void>
    ) {
      e.preventDefault();
      toggleDropdown(true);
      void selectHighlightedItem();
    },
    closeDropdown(e: Event, toggleDropdown: (flag?: boolean) => void) {
      e.preventDefault();
      toggleDropdown(false);
    },
  },
});
</script>
