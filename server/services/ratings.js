const mongoose = require('mongoose');
const Rating = require('../models/Rating.js');

// How an organiser is doing, from the ratings artists left after finished exchanges.
// average is null until there is at least one rating; it is rounded to one decimal.
async function organiserSummary(organiserId) {
  const [row] = await Rating.aggregate([
    { $match: { organiser: new mongoose.Types.ObjectId(String(organiserId)) } },
    { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } },
  ]);
  if (!row) return { average: null, count: 0 };
  return { average: Math.round(row.average * 10) / 10, count: row.count };
}

// The newest written comments. The artist who wrote one stays anonymous, so people can be honest
// without worrying about the organiser knowing who said it.
async function recentComments(organiserId, limit = 5) {
  const rows = await Rating.find({ organiser: organiserId, comment: { $ne: '' } })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit)
    .populate('event', 'name');
  return rows.map((r) => ({
    stars: r.stars,
    comment: r.comment,
    eventName: r.event?.name || 'an exchange',
    at: r.updatedAt,
  }));
}

function ratingJson(row) {
  if (!row) return null;
  return { id: row._id.toString(), stars: row.stars, comment: row.comment, at: row.updatedAt };
}

module.exports = { organiserSummary, recentComments, ratingJson };
