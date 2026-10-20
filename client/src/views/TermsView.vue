<script setup>
import { RouterLink } from 'vue-router';
import { ScrollText } from 'lucide-vue-next';
import InfoLayout from '@/components/info/InfoLayout.vue';
</script>

<template>
  <InfoLayout
    title="Terms of use"
    intro="Plain-language terms for a student project. By using Drawsicle you agree to them."
    :icon="ScrollText"
    updated="12 October 2026"
    current="terms"
  >
    <section id="about-service">
      <h2>What this is</h2>
      <p>
        Drawsicle is a free web app built by students for the IS216 module at SMU. It helps people run and join art
        exchange events. It is a learning project, not a company, and these terms are written to be short and readable
        rather than legal.
      </p>
    </section>

    <section id="no-warranty">
      <h2>No warranty</h2>
      <p>
        The site is provided as it is. We try to keep it running and your data safe, but we can't promise it will always
        be available, error free or kept forever. Features may change or the site may be taken down, for example when the
        module ends. Please keep your own copies of artwork you care about, and download your data from
        <RouterLink to="/settings/account">account settings</RouterLink> if you want a backup.
      </p>
    </section>

    <section id="your-content">
      <h2>Your content stays yours</h2>
      <p>
        You own the characters, art, writing and text you add. By uploading something you give Drawsicle
        permission to store it and show it to the people it is meant for (for example, your gift to your recipient and the
        event's organisers) so the site can work. We don't claim any other rights.
      </p>
      <p>
        You promise that you have the right to share what you upload, and that it follows the
        <RouterLink to="/guidelines">community guidelines</RouterLink>.
      </p>
    </section>

    <section id="organisers">
      <h2>Organisers run their own events</h2>
      <p>
        Each event belongs to its organisers. They set the rules, choose who joins and decide how matches and deadlines
        work. Drawsicle provides the tools but isn't a party to any exchange and can't guarantee that anyone will deliver
        a gift. Disputes are best settled between the people involved and the organisers.
      </p>
    </section>

    <section id="acceptable-use">
      <h2>Acceptable use</h2>
      <p>Please don't:</p>
      <ul>
        <li>Upload anything illegal, hateful, or sexual content involving minors, or content you don't have the right to share.</li>
        <li>Harass other people or use the site to contact someone who doesn't want to be contacted.</li>
        <li>Create accounts to cheat an event, pose as someone else or spam.</li>
        <li>Try to break, overload or get around the security of the site, or scrape other people's data.</li>
        <li>Share your login with anyone.</li>
      </ul>
      <p>
        We may remove content or deactivate accounts that break these rules, or that put other people or the site at risk.
      </p>
    </section>

    <section id="deactivation">
      <h2>Deactivating your account</h2>
      <p>
        You can deactivate your account at any time from <RouterLink to="/settings/account">account settings</RouterLink>.
        After 30 days an inactive account is anonymised, as explained on the <RouterLink to="/privacy">privacy page</RouterLink>.
      </p>
    </section>

    <section id="changes">
      <h2>Changes and contact</h2>
      <p>
        We may update these terms as the project changes, and the date at the top shows when. If you keep using the
        site after a change, that means you accept it. Questions go to the Drawsicle team through whoever shared the link
        with you.
      </p>
    </section>
  </InfoLayout>
</template>
