<script setup>
import { RouterLink } from 'vue-router';
import { ShieldCheck } from 'lucide-vue-next';
import InfoLayout from '@/components/info/InfoLayout.vue';
</script>

<template>
  <InfoLayout
    title="Privacy"
    intro="What Drawsicle stores about you, who can see it, and how to take it with you or delete it."
    :icon="ShieldCheck"
    updated="12 October 2026"
    current="privacy"
  >
    <section id="stored">
      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> email address, a password stored only as a hash (or a Google or Discord sign-in link), display name and username.</li>
        <li><strong>Your profile:</strong> an optional picture, bio and social handles that you choose to add.</li>
        <li><strong>Your character library:</strong> names, species, tags, descriptions, reference links and notes for artists.</li>
        <li><strong>Your activity:</strong> event sign-ups, matches, submitted gifts (images, messages and links) and your notifications.</li>
        <li><strong>Your settings:</strong> default sign-up answers and which emails you want.</li>
      </ul>
      <p>
        We don't sell your data, show ads or run third-party analytics. We don't use tracking cookies.
      </p>
    </section>

    <section id="visibility">
      <h2>Who sees what</h2>
      <h3>Only you</h3>
      <ul>
        <li>Your character library. Characters are private and are never listed publicly.</li>
        <li>Your email address, notification settings and default sign-up answers.</li>
      </ul>
      <h3>You and the event's organisers</h3>
      <ul>
        <li>
          Your application to an event: community username, what you can make, the characters you offered, likes, things
          to avoid and notes. Organisers need this to approve sign-ups and check matches.
        </li>
        <li>Your submitted gift for that event.</li>
      </ul>
      <h3>Your recipient</h3>
      <ul>
        <li>The characters you offered, and your likes and avoid notes, are shown to the one person who is making your gift.</li>
        <li>
          Who is making a gift for you stays hidden until the event is completed and the reveal happens. Organisers can
          see all pairings so they can run the event.
        </li>
      </ul>
      <h3>Everyone</h3>
      <ul>
        <li>
          Your public profile: display name, username, picture, bio, social handles, the month you joined, and the public
          events you have organised.
        </li>
        <li>
          Finished public exchanges you took part in, and how many. You can hide these in
          <RouterLink to="/profile">your profile</RouterLink>.
        </li>
        <li>
          Gifts you made in finished public exchanges, on your profile and the home page, but only if you <em>and</em> the
          person you made it for both turn on "Allow public display of gifts". Thank-you notes for those gifts can be
          shown with them. It is off unless you turn it on, and the private message with a gift is never shown.
        </li>
        <li>Public events you organise, including your display name as organiser.</li>
      </ul>
      <p class="callout">
        Want fewer details public? Leave the bio and social handles empty and hide your exchanges in
        <RouterLink to="/profile">your profile</RouterLink>. Only a display name and username are always shown.
      </p>
    </section>

    <section id="cookies">
      <h2>Cookies</h2>
      <p>
        Drawsicle sets one cookie: a login cookie that keeps you signed in for up to 7 days. It is marked httpOnly, so
        scripts on the page can't read it, and it is only used to know who you are. We don't use advertising or analytics
        cookies.
      </p>
    </section>

    <section id="emails">
      <h2>Emails</h2>
      <p>
        We email you for password resets, and, if you leave them on, for deadline reminders, new matches and event
        updates. You can switch each kind off in <RouterLink to="/profile">your profile</RouterLink> settings. We don't
        send newsletters or share your address with anyone.
      </p>
    </section>

    <section id="your-data">
      <h2>Your data: download and deletion</h2>
      <ul>
        <li>
          <strong>Download:</strong> from <RouterLink to="/settings/account">account settings</RouterLink> you can
          download a copy of your account, characters, applications, submissions and notifications.
        </li>
        <li>
          <strong>Deactivate:</strong> deactivating hides your profile, withdraws your sign-ups from events that haven't published their matches
          yet, and stops emails. Log back in within 30 days to reactivate (withdrawn sign-ups are not restored).
        </li>
        <li>
          <strong>After 30 days:</strong> a deactivated account is anonymised. Your email, name, bio, picture, social links, username, saved
          sign-up answers and sign-in details are wiped, and the account can't be used again. Anything already part of
          an event (applications, matches, gifts) stays with that event under the name 'Deleted user', so other people
          keep what they received.
        </li>
      </ul>
    </section>

    <section id="contact">
      <h2>Questions</h2>
      <p>
        Drawsicle is a university project run by a small student team. If you have a question about your data, want
        something corrected or want your account removed sooner, contact the team through whoever shared the link with you.
        See also the <RouterLink to="/terms">terms</RouterLink> and the
        <RouterLink to="/help#privacy-faq">privacy questions in the FAQ</RouterLink>.
      </p>
    </section>
  </InfoLayout>
</template>
