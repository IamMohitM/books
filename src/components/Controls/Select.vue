<template>
  <Dropdown :items="dropdownItems" :df="df" :doc="doc">
    <template #default="{ toggleDropdown }">
      <div v-if="showLabel" :class="labelClasses">
        {{ df.label }}
      </div>
      <div
        class="relative flex items-center justify-between"
        :class="[inputClasses, containerClasses]"
      >
        <div
          class="w-full"
          @click="(e) => !isReadOnly && onClick(e, toggleDropdown)"
        >
          <div
            class="
              flex
              items-center
              justify-between
              bg-transparent
              w-full
              cursor-pointer
              custom-scroll custom-scroll-thumb2
            "
            :class="{
              'pointer-events-none': isReadOnly,
              'text-gray-500': !currentLabel,
            }"
          >
            <span
              v-if="currentLabel"
              class="cursor-text text-black dark:text-white w-full"
              >{{ currentLabel }}</span
            >
            <span v-else>{{ inputPlaceholder }}</span>
            <svg
              v-if="!isReadOnly"
              class="w-3 h-3"
              style="background: inherit; margin-right: -3px"
              viewBox="0 0 5 10"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 2.636L2.636 1l1.637 1.636M1 7.364L2.636 9l1.637-1.636"
                class="stroke-current"
                :class="
                  showMandatory
                    ? 'text-red-400 dark:text-red-600'
                    : 'text-gray-400 dark:text-gray-600'
                "
                fill="none"
                fill-rule="evenodd"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </template>
  </Dropdown>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { SelectOption } from 'schemas/types';
import Base from './Base.vue';
import Dropdown from 'src/components/Dropdown.vue';
import { DropdownItem } from 'src/utils/types';

export default defineComponent({
  name: 'Select',
  extends: Base,
  emits: ['focus'],
  components: {
    Dropdown,
  },
  data() {
    return {
      selectValue: '',
      toggleDropdownRef: null as null | ((flag?: boolean) => void),
    };
  },
  props: {
    closeDropDown: {
      type: Boolean,
      default: true,
    },
  },
  computed: {
    options(): SelectOption[] {
      if (this.df.fieldtype !== 'Select') {
        return [];
      }

      return this.df.options;
    },
    dropdownItems(): DropdownItem[] {
      return this.options.map((option) => {
        return {
          label: option.label,
          value: option.value,
          action: () => this.selectOption(option),
        };
      });
    },
    currentLabel(): string {
      return this.selectValue || this.getLabelFromValue(this.value);
    },
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        this.selectValue = this.getLabelFromValue(newValue);
      },
    },
  },
  methods: {
    getLabelFromValue(value: unknown): string {
      const option = this.options.find((opt) => opt.value === value);
      if (option) {
        return option.label;
      }

      return typeof value === 'string' ? value : '';
    },
    onClick(_e: MouseEvent, toggleDropdown: (flag?: boolean) => void) {
      this.toggleDropdownRef = toggleDropdown;
      toggleDropdown();
    },
    selectOption(option: SelectOption) {
      this.selectValue = option.label;
      this.triggerChange(option.value);

      if (!this.closeDropDown && this.toggleDropdownRef) {
        setTimeout(() => this.toggleDropdownRef?.(true), 0);
      }
    },
  },
});
</script>
