<script setup>
import { Dice5 } from 'lucide-vue-next';
import TextField from './TextField.vue';
import { Loader2 } from 'lucide-vue-next';
import { ref } from 'vue';
import axios from 'axios';

const modelValue = defineModel({ type: String, default: '' });

const COOLDOWN_TIME = 200; // ms

const props = defineProps({
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  autocomplete: { type: String, default: undefined },
  maxlength: { type: Number, default: undefined },
  hint: { type: String, default: '' },
});

const isLoading = ref(false);


async function getRandomWord(type) {
  try {
    // https://randomapi.dev/apis/words
    const response = await axios.get(`https://randomapi.dev/api/words?type=${type}&maxLength=12&count=1&fields=word&unwrap=true`);
    const word = response.data[0].word;
    return word.toLocaleUpperCase().substring(0, 1) + word.toLocaleLowerCase().substring(1)
  } catch (e) {
    console.error(e)
  }  
}

async function assignRandomUsername() {
  if (isLoading.value) return;
  isLoading.value = true
  const adj = await getRandomWord(Math.random() > 0.9? 'noun': 'adjective');
  const noun = await getRandomWord('noun');
  
  if (noun == undefined) {
    modelValue.value = "THAT'S ENOUGH!!"
  } else {
    modelValue.value = adj + " " + noun;
  }
  setTimeout(() => isLoading.value = false, COOLDOWN_TIME);
}
    
</script>

<template>
    <TextField
        @iconClick="e => assignRandomUsername()" 
        v-model="modelValue"
        :label="label"
        :icon="isLoading? Loader2 : Dice5"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :maxlength="maxlength"
        :hint="hint"/>
</template>

<style scoped>
    
</style>