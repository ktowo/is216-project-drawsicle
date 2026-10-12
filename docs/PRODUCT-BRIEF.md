# Drawisicle | Event-based Art Exchange Platform

## Project Overview

Drawisicle is a web platform for running art exchange events (e.g. Secret Santa, Valentine swaps, seasonal exchanges)
within online art communities. It replaces spreadsheets, Google Forms, and manual Discord tracking with a single system
that collects participant preferences, matches artists automatically, and tracks deadlines and submissions.

It solves common issues such as manual matching which takes effort and may not be efficient, participants requesting
characters artists cannot draw, organisers juggling multiple tools, and character references being re-submitted every
event. Drawisicle centralises all of this into one workflow.

## Target Users

- Event Organisers: create and manage exchange events, rules, and duration
- Participants (hobby artists): artists who give and receive gifts

## Core Features

- Matching algorithm
- Deadline tracking
- Event and form management

### User Accounts

- Persistent accounts across events
- Basic profile info (username, email, preferences)
- Default form response filling for convenience
- Account states: active, deactivated (pending delete)

### Character Library (medium priority)

Each user maintains a private character library:

- Character name and description
- Species / tags (for matching purposes)
- Reference links (external only)
- Notes for artists

Key rules:

- Characters are reusable across events
- Characters are private
- Character collections (Google Docs, Toyhou.se) are supported via links
- Characters may also be added during event sign-up directly and saved for future use
- Users may delete characters which are unused and may soft-delete (archive) characters which have already been used

### Event Creation

Organisers configure:

- Event name, description, theme
- Signup deadline and submission deadline
- Minimum / maximum participants
- Community platform where the event is held (Discord, DeviantArt, etc.)
- Visibility (Draft, Open, Closed)
- Publicity (Private/Invite-only, Public event)

### Event Lifecycle

1. Draft
2. Open (accepting applications)
3. Matching (signups closed, matches generated)
4. Active (participants create gifts)
5. Completed

### Event Roles

Users can hold multiple roles for one event:

- Organiser: full control, can delete the event, manage participants and the event
- Participant: regular participant

### Joining Events

Participants:

- Apply via an event link sent out in their community
- Fill an event-specific preference form
- Select which characters they offer
- Specify what they can draw or create (art, adoptable, writing, music)
- Provide community usernames for tracking

### Public Event Listing

- Browse upcoming and ongoing events
- Filter by status (open for sign-ups, active, completed), theme/season, participant count
- Search by event name or organiser

## User Workflows

### Typical Participant Journey

1. Discovery: finds an art exchange event via link invite or browsing
2. Account Creation: creates an account or logs in
3. Character Setup: adds characters to their library (or while filling the form)
4. Application: applies to join the event
5. Preference Form: fills out what they can draw and which characters to offer
6. Matching: the algorithm pairs them with another participant
7. Creation: creates artwork for their assigned match
8. Submission: submits completed artwork before the deadline
9. Reveal: receives artwork from their Secret Santa
10. Completion: event concludes, can join new events

### Typical Organiser Journey

1. Event Planning: decides on theme, rules, deadlines
2. Event Creation: sets up the event with all parameters
3. Promotion: shares the event link in the community
4. Monitoring: tracks form completion, answers questions
5. Matching: generates matches when sign-ups close
6. Management: sends reminders, monitors progress
7. Completion: verifies all submissions, closes the event
8. Archival: event remains viewable for participants

## Scope

In scope (MVP): user accounts and character management, event creation and management, participant applications
(preset form options), matching algorithm, reminder notifications, image upload.

Out of scope: messaging, payment processing, advanced analytics, public galleries, support tickets, custom form options.

## Technology

Tailwind for styling, Vue.js for the front end, Express.js + MongoDB for the back end, Vercel for deployment.

## Main files and routes

Pages: Home, Register, Login, Settings (notifications, character library, profile settings), Matches, Event, Dashboard.
`auth.js` middleware for role-based access. Components: Navbar (logo, links, notifications, user), Footer (links).

Routes: `/`, `/register`, `/login`, `/profile`, `/my-events`, `/notification`, `/characters`, `/characters/new`,
`/characters/:id/edit`, `/events`, `/events/:id`, `/events/:id/apply`, `/events/:id/edit`, `/dashboard`,
`/events/:id/manage`, `/events/new`, `/events/:id/matches`, `/events/:id/submit`, `/events/:id/results`.
