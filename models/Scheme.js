// models/Scheme.js
const mongoose = require('mongoose');

const schemeSchema = new mongoose.Schema({
    schemeName: String,
    description: String,
    ministry: String,
    type: String,
    state: String,
    eligibility: {
        category: [String],
        income_notes: String,
        notes: String,
        occupation: [String],
        gender: String,
        age_min: Number,
        age_max: Number,
        area: String,
        disability: Boolean
    },
    benefits: String,
    applicationLink: String
});

const Scheme = mongoose.model('Scheme', schemeSchema);

module.exports = Scheme;