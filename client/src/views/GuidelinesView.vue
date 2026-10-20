<script setup>
import { RouterLink } from 'vue-router';
import { HeartHandshake } from 'lucide-vue-next';
import InfoLayout from '@/components/info/InfoLayout.vue';
</script>

<template>
  <InfoLayout
    title="Community guidelines"
    intro="Art exchanges work because people show up for each other. These are the habits that keep them fun."
    :icon="HeartHandshake"
    updated="12 October 2026"
    current="guidelines"
  >
    <section id="kindness">
      <h2>Be kind</h2>
      <p>
        Everyone here is making something for a stranger, usually for free, in their spare time. Assume good intentions,
        say thank you, and keep feedback gentle. Harassment, hate and putting down someone's art or characters have no
        place on Drawsicle or in the communities around it.
      </p>
    </section>

    <section id="deadlines">
      <h2>Deliver on time, or tell your organiser early</h2>
      <p>
        Someone is waiting for the gift you agreed to make. If life gets in the way, message the organiser as soon as you
        know, not on deadline day. They can often extend a date, find a backup artist or at least let your recipient know.
      </p>
      <ul>
        <li>Submit before the submission deadline. Late gifts are marked as late, and organisers can see that.</li>
        <li>If you can't finish, say so early so the organiser has time to help.</li>
        <li>Withdraw from an event while sign-ups are open if you realise you can't take part.</li>
      </ul>
    </section>

    <section id="preferences">
      <h2>Respect likes, things to avoid and "can't draw" tags</h2>
      <p>
        Every sign-up lists what the person likes, what they would rather not receive, and any species or tags the artist
        can't draw. Matching uses the "can't draw" tags automatically, but the likes and things to avoid are for you to
        read.
      </p>
      <ul>
        <li>Read your recipient's notes before you start, and check them again before you submit.</li>
        <li>Never ask someone to change their characters or reference notes to suit you.</li>
        <li>Be honest about what you can draw when you sign up. It is better to list a tag you aren't comfortable with than to struggle later.</li>
        <li>Characters are private. Only use a recipient's references for their gift.</li>
      </ul>
    </section>

    <section id="credit">
      <h2>Credit and reposting</h2>
      <ul>
        <li>The artist owns what they make. The recipient gets the gift, not the rights to sell it or claim it as their own.</li>
        <li>Ask before reposting someone's gift outside the event, and always credit the artist.</li>
        <li>Wait for the reveal before sharing who made what, unless the organiser says otherwise.</li>
        <li>Don't use gifts to train AI image generators or in anything commercial without the artist's say-so.</li>
        <li>Characters belong to their owners. Don't trace, copy or share their reference sheets elsewhere.</li>
      </ul>
    </section>

    <section id="organisers">
      <h2>Organisers' responsibilities</h2>
      <p>Running an event means looking after the people who trust you with their characters and their time.</p>
      <ul>
        <li>Write clear rules, and state any age limits or content boundaries up front.</li>
        <li>Set deadlines that give artists a fair amount of time, and don't change them without telling everyone.</li>
        <li>Review applications fairly and explain to people if you reject them.</li>
        <li>Check the matches before you publish them, and swap pairs if something looks wrong.</li>
        <li>Send reminders, step in early when someone falls behind, and keep problems between the people involved.</li>
        <li>Keep what you see about participants (applications, community usernames) to yourself.</li>
      </ul>
    </section>

    <section id="reporting">
      <h2>Reporting a problem</h2>
      <p>
        If something goes wrong, such as a missed gift, a gift that ignores someone's "avoid" notes or unkind behaviour,
        tell the event's organisers first. Their names are on the event page, and the event's community (Discord or
        similar) is the best place to follow up.
      </p>
      <p>
        If the problem is with an organiser, or with the site itself, check the
        <RouterLink to="/help#troubleshooting">troubleshooting section</RouterLink> and contact the Drawsicle team
        through whoever shared the link with you. Accounts that break these guidelines can be deactivated.
      </p>
      <p class="callout">
        Drawsicle has no messaging between users. Take conversations to the event's community, and never share your
        password with anyone, including organisers.
      </p>
    </section>
  </InfoLayout>
</template>
