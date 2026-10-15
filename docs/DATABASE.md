# Database

MongoDB through Mongoose (`server/models/`). Eight collections. Every document has `_id`, `createdAt` and `updatedAt`.
Relationships are ObjectId references; nothing relies on joins at the database level except the event listing,
which counts accepted applications with a `$lookup`.

```mermaid
erDiagram
    USER ||--o{ CHARACTER : "owns (private library)"
    USER ||--o{ EVENT_MEMBER : "holds roles"
    EVENT ||--o{ EVENT_MEMBER : "grants roles"
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ EVENT : "created by"
    EVENT ||--o{ APPLICATION : "sign-ups"
    USER ||--o{ APPLICATION : "signs up"
    APPLICATION }o--o{ CHARACTER : "offers 1-5"
    EVENT ||--o{ MATCH : "gift loop"
    USER ||--o{ MATCH : "gives (giver)"
    USER ||--o{ MATCH : "receives (recipient)"
    APPLICATION ||--o{ MATCH : "giver / recipient form"
    MATCH ||--o| SUBMISSION : "fulfilled by"
    EVENT ||--o{ SUBMISSION : collects

    USER {
        ObjectId _id PK
        string email UK "lowercase"
        string username UK "3-30 a-z 0-9 _"
        string passwordHash "never selected by default"
        string googleId UK "optional"
        string discordId UK "optional"
        string role "user | admin"
        string status "active | deactivated"
        date deactivatedAt
        number sessionVersion "bumped to log out other devices"
        string displayName
        string avatarUrl
        string bio
        object socials "twitter instagram bluesky discord deviantart toyhouse tumblr"
        object defaultForm "communityUsername canCreate wantsTypes likes avoid cannotDraw"
        object notificationPrefs "emailReminders emailMatches emailEventUpdates"
        string resetTokenHash "sha-256 of the reset link token"
        date resetTokenExpires
    }

    EVENT_MEMBER {
        ObjectId _id PK
        ObjectId user FK
        ObjectId event FK
        array roles "organizer participant helper approver"
    }

    NOTIFICATION {
        ObjectId _id PK
        ObjectId user FK
        string type "match_assigned deadline_reminder ..."
        string title
        string message
        string link "client route"
        date readAt "null = unread"
    }

    CHARACTER {
        ObjectId _id PK
        ObjectId owner FK
        string name
        string description
        string species
        array tags "lowercase, used by matching"
        array referenceLinks "label + url, external only"
        string notesForArtists
        date archivedAt "soft delete once used"
    }

    EVENT {
        ObjectId _id PK
        ObjectId createdBy FK
        string name
        string description
        string theme
        string season "winter spring ... other"
        string rules
        array tags
        string platform "discord deviantart toyhouse ..."
        string platformName
        string platformLink
        date signupDeadline
        date submissionDeadline "after signupDeadline"
        number minParticipants
        number maxParticipants
        array allowedTypes "art adoptable writing"
        string status "draft open matching active completed"
        string publicity "public | private"
        string inviteCode "organisers only"
        boolean requireApproval
        string bannerUrl
        array statusHistory "status, at, by"
        date publishedAt "matches published"
        date completedAt
        array remindersSent "keys of reminders already sent"
    }

    APPLICATION {
        ObjectId _id PK
        ObjectId event FK
        ObjectId user FK
        string status "pending accepted rejected withdrawn"
        string communityUsername
        array canCreate "what they can make"
        array wantsTypes "what they would like"
        array offeredCharacters FK "Character ids"
        string likes
        string avoid
        array cannotDraw "tags/species, used by matching"
        string notes "for organisers"
        ObjectId reviewedBy FK
        date reviewedAt
    }

    MATCH {
        ObjectId _id PK
        ObjectId event FK
        ObjectId giver FK
        ObjectId recipient FK
        ObjectId giverApplication FK
        ObjectId recipientApplication FK
        number score "0-100 fit"
        array reasons
        boolean published "false = organiser draft"
        string status "assigned | submitted"
        array remindersSent
    }

    SUBMISSION {
        ObjectId _id PK
        ObjectId event FK
        ObjectId match FK "unique"
        ObjectId giver FK
        ObjectId recipient FK
        string title
        string message "note to the recipient"
        string type "art adoptable writing"
        array images "up to 4 upload URLs"
        array links "up to 5 external links"
        date submittedAt
        boolean late
        boolean verified
        date verifiedAt
        ObjectId verifiedBy FK
    }
```

## Collections

| Collection | Model | What it holds | Indexes |
| --- | --- | --- | --- |
| `users` | `User` | Accounts, profile, sign-up form defaults, email preferences | `email` unique, `username` unique, `googleId` unique, `discordId` unique |
| `eventmembers` | `EventMember` | One row per (user, event) with that person's roles in the event | `(user, event)` unique, `(event, roles)` |
| `notifications` | `Notification` | In-app notifications (emails are sent alongside, not stored) | `(user, createdAt desc)`, `(user, readAt)` |
| `characters` | `Character` | Each person's private character library | `owner`, `(owner, archivedAt, updatedAt desc)` |
| `events` | `Event` | Exchanges and their lifecycle | `status`, `inviteCode`, `(publicity, status, signupDeadline)` |
| `applications` | `Application` | Sign-up forms, one per person per event | `(event, user)` unique, `(event, status)`, `offeredCharacters` |
| `matches` | `Match` | Who makes a gift for whom; drafts until published | `(event, giver)` unique, `(event, recipient)` |
| `submissions` | `Submission` | The finished gift for one match | `match` unique, `event` |
| `auditlogs` | `AuditLog` | Every site admin action (bans, role changes, deleting or moderating events) with the reason | `createdAt desc`, `(targetType, targetId, createdAt desc)` |
| `jobruns` | `JobRun` | When each background job last ran (`_id: 'reminders'`), so serverless instances share one schedule | `_id` |
| `uploads.files`, `uploads.chunks` | GridFS | Uploaded images and demo artwork when the database is a shared one (Atlas); served at `/api/files/<id>.<ext>` | GridFS defaults |

## How the pieces fit

- **Roles are per event.** Organisers and participants are `EventMember` rows, not fields on `User` or `Event`.
  Creating an event grants `organizer`; an accepted application grants `participant`; a user can hold both.
  `User.role` is only for site admins.
- **Characters are reused.** Applications point at characters in the owner's library. A character that any application
  references can't be deleted, only archived (`archivedAt`), so past events keep their references.
- **One loop per event.** Each accepted participant is a `giver` exactly once and a `recipient` exactly once in the
  published matches of an event. `giverApplication` / `recipientApplication` keep the forms the match was made from.
- **Secrecy is enforced in the API, not the schema.** A recipient's match row names their giver, so routes never return
  it to them before the event is `completed`; applications are only returned to their owner and the organisers.
- **Uploads are stored as URLs.** `bannerUrl`, `avatarUrl` and `Submission.images` hold URLs from
  `services/storage.js`: `/api/files/<id>.<ext>` for GridFS (the default with a connection string, so Vercel can
  serve them), an Azure Blob Storage URL, or `/uploads/...` for files in `server/uploads/` with the local database.
- **Deactivation** sets `User.status`; after 30 days the reminder job anonymises the account in place so references from
  events, matches and submissions stay valid.
