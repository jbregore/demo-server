const mongoose = require("mongoose");

const CounterSchema = mongoose.Schema(
    {
        _id: {
            type: String,
            default: 'activityNumber',
            required: true
        },
        seq: {
            type: Number,
            default: 0,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Counter", CounterSchema);
