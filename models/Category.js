const mongoose = require('mongoose');

const categorySchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Middleware function to convert name to lowercase before saving
categorySchema.pre('save', function (next) {
    this.name = this.name.toLowerCase();
    next();
});

// Middleware function to convert name to lowercase before bulk insertion
categorySchema.pre('insertMany', function (next, docs) {
    for (let doc of docs) {
        doc.name = doc.name.toLowerCase();
    }
    next();
});

// Middleware to return the document after successful save
categorySchema.post('save', function (doc, next) {
    next(null, { _id: doc._id, name: doc.name });
});

module.exports = mongoose.model('Category', categorySchema);