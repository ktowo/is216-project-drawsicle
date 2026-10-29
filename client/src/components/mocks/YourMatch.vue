<script setup>
import { Gift, Check } from 'lucide-vue-next';
import { sitePath } from '@/utils/sitePath';
import CardBase from './CardBase.vue';

</script>

<template>
    <CardBase>
        <p class="m-head">
            <Gift :size="14" /> You're making a gift for
        </p>
        <div class="m-char"><img :src="sitePath('/demo-art/spring-mika-sol.jpg')" alt="" />
            <div><b>Sol · Ember</b>
                <p>Fox · fluffy, fantasy</p>
                <p class="m-small">Likes: dynamic poses, sunsets</p>
            </div>
        </div>
        <div class="m-row">
            <div class="m-chip on">
                <Check :size="12" /> You can draw this
            </div>
        </div>
    </CardBase>
</template>