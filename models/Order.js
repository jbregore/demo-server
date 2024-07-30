const mongoose = require("mongoose");
const moment = require('moment');

const OrderSchema = mongoose.Schema(
    {
        orderId: {
            type: String,
            required: true
        },
        customerId: {
            type: String,
            required: false
        },
        firstName: {
            type: String,
            default: 'Guest'
        },
        lastName: {
            type: String,
            default: 'Guest'
        },
        products: [
            {
                _id: false,
                productName: {
                    type: String,
                    required: true
                },
                productCode: {
                    type: String,
                    required: true
                },
                categoryName: {
                    type: String,
                    required: true
                },
                poNumber: {
                    type: String,
                    required: true
                },
                origPrice: {
                    type: Number,
                    required: false
                },
                price: {
                    type: Number,
                    required: true
                },
                quantity: {
                    type: Number,
                    required: true
                },
                discounts: {
                    type: [
                        {
                            _id: false,
                            id: {type: Number},
                            prefix: {type: String},
                            receiptLabel: {type: String},
                            label: {type: String},
                            percentage: {type: Boolean},
                            amount: {type: Number},
                        }
                    ],
                    default: []
                },
                status: {
                    type: String,
                    enum: ['paid', 'returned', 'cancelled', 'void', 'for payment'],
                    default: 'for payment'
                },
                isVatable: {
                    type: Boolean,
                    default: true
                },
                isVatZeroRated: {
                    type: Boolean,
                    default: false
                },
                vatAmount: {
                    type: Number,
                    default: 0
                },
                category: {
                    type: mongoose.Schema.ObjectId,
                    required: true
                }
            }
        ],
        status: {
            type: String,
            required: true,
            enum: ['paid', 'returned', 'cancelled', 'void', 'for payment', 'suspend'],
        },
        paymentDate: {
            type: Date,
            default: null
        },
        orderDate: {
            type: Date,
            required: true
        },
        paymentMethods: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment Log'
        }],
        total: {
            type: Number,
            default: 0
        },
        txnNumber: {
            type: String,
            default: ''
        },
        siNumber: {
            type: String,
            default: ''
        },
        employeeId: {
            type: String,
            required: true
        },
        storeCode: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

OrderSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Order", OrderSchema);
