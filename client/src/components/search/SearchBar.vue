<script setup>
    import { Search } from 'lucide-vue-next';

    const search = defineModel({required: true});

    const props = defineProps({
        id: String,
        srLabel: String,
        placeholder: String,
        maxlength: {
            type: Number,
            default: 100
        }
    })

    const emit = defineEmits(['input', 'keydown.enter.prevent'])

</script>

<template>
    <div class="input-wrap search">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <label :for="id" class="sr-only">{{ srLabel }}</label>
        <input
          :id="id"
          v-model="search"
          class="input"
          type="search"
          autocomplete="off"
          :placeholder="placeholder"
          :maxlength="maxlength"
          @input="$emit('input')",
          @keydown.enter.prevent="$emit('keydown.enter.prevent')"
        />
      </div>
</template>

<style scoped>
    
</style>