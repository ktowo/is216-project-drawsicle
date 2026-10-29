<script setup>
    
</script>

<template>
    <div class="toolbar card">
      <div class="input-wrap search">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <label for="artist-search" class="sr-only">Search artists by name or username</label>
        <input
          id="artist-search"
          v-model="search"
          class="input"
          type="search"
          autocomplete="off"
          placeholder="Search artists by name or @username"
        />
      </div>

      <div class="toolbar-row">
        <button
          type="button"
          class="btn btn-outline btn-sm filters-toggle"
          :aria-expanded="filtersOpen ? 'true' : 'false'"
          aria-controls="discover-filters"
          @click="filtersOpen = !filtersOpen"
        >
          <SlidersHorizontal :size="16" aria-hidden="true" /> Filters
          <span v-if="activeFilters" class="filter-count">{{ activeFilters }}</span>
        </button>
        <label class="sort">
          <span class="label-inline">Sort by</span>
          <select class="select" :value="sort" @change="setQuery({ sort: $event.target.value })">
            <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div id="discover-filters" class="filters" :class="{ open: filtersOpen }">
        <div class="filter-group">
          <p id="filter-makes" class="label">Makes</p>
          <ChoiceChips :model-value="makes" :options="CREATION_TYPES" aria-labelledby="filter-makes" @update:model-value="setQuery({ makes: $event })" />
        </div>
        <div class="filter-group">
          <p id="filter-themes" class="label">Loves</p>
          <ChoiceChips :model-value="themes" :options="THEME_OPTIONS" aria-labelledby="filter-themes" @update:model-value="setQuery({ themes: $event })" />
        </div>
        <div class="filter-group">
          <p id="filter-more" class="label">Only show</p>
          <ChoiceChips :model-value="extras" :options="extraOptions" aria-labelledby="filter-more" @update:model-value="setExtras" />
        </div>
      </div>
    </div>
</template>

<style scoped>
    
</style>