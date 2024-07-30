const mongoose = require('mongoose')

const AyalaTxnSchema = mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    hour: {
        type: Number, 
        required: true
    },
    start: {
        type: Number,
        required: true
    },
    end: {
        type: Number,
    }
}, {timestamps: true})

module.exports = mongoose.model('ayalatxn', AyalaTxnSchema)