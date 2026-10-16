const mongoose = require('mongoose');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const Submission = require('../models/Submission.js');
const Character = require('../models/Character.js');

// What a report points at, worked out fresh each time so admins see the thing as it is now.
// Returns null when it no longer exists.
//   label    readable name ("Ember", "Autumn Leaves Art Trade", ...)
//   owner    the user it belongs to (ObjectId)
//   event    the event it belongs to, if any (ObjectId)
//   link     where to see it in the app, if anywhere
//   preview  enough of it for an admin to judge without opening private pages
async function describeTarget(type, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  switch (type) {
    case 'submission': {
      const sub = await Submission.findById(id).populate('giver', 'displayName username').populate('event', 'name');
      if (!sub) return null;
      const by = sub.giver?.displayName || 'someone';
      return {
        label: `${sub.title ? `"${sub.title}"` : 'A gift'} by ${by}${sub.event ? ` in ${sub.event.name}` : ''}`,
        owner: sub.giver?._id || sub.giver,
        event: sub.event?._id || sub.event,
        link: sub.event ? `/events/${sub.event._id}/results` : '',
        preview: {
          title: sub.title || '',
          type: sub.type,
          message: sub.message || '',
          images: [...(sub.images || [])].slice(0, 4),
          links: (sub.links || []).map((l) => l.url),
          contentWarnings: [...(sub.contentWarnings || [])],
        },
      };
    }
    case 'user': {
      const user = await User.findById(id);
      if (!user) return null;
      return {
        label: user.username ? `${user.displayName} (@${user.username})` : user.displayName || 'An account',
        owner: user._id,
        event: null,
        link: user.username && user.status === 'active' ? `/users/${user.username}` : '',
        preview: { bio: user.bio || '', status: user.status || 'active' },
      };
    }
    case 'character': {
      const c = await Character.findById(id);
      if (!c) return null;
      return {
        label: c.species ? `${c.name} (${c.species})` : c.name,
        owner: c.owner,
        event: null,
        link: '', // characters are private to their owner and the artists drawing them
        preview: {
          description: c.description || '',
          notesForArtists: c.notesForArtists || '',
          referenceLinks: (c.referenceLinks || []).map((l) => l.url),
          contentWarnings: [...(c.contentWarnings || [])],
        },
      };
    }
    case 'event': {
      const e = await Event.findById(id);
      if (!e) return null;
      return {
        label: e.name,
        owner: e.createdBy,
        event: e._id,
        link: `/events/${e._id}`,
        preview: { description: (e.description || '').slice(0, 600), status: e.status, disabled: Boolean(e.disabledAt) },
      };
    }
    default:
      return null;
  }
}

module.exports = { describeTarget };
