const mongoose = require("mongoose");

const LoyaltyPointSchema = mongoose.Schema(
    {
        loyaltyPointId: {
            type: String,
            required: true
        },
        customerId: {
            type: String,
            required: true
        },
        firstName: {
            type: String,
            required: true
        },
        lastName: {
            type: String,
            required: true
        },
        loyaltyPoints: {
            type: Number,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Loyalty Point", LoyaltyPointSchema);
