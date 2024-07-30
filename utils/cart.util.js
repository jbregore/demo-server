const computeSpecsPrice = (cart, order, specs, netPrice = false) => {
    const normalPrice = specs.price * specs.quantity;
    let computedPrice = specs.overridedPrice ? specs.overridedPrice : normalPrice;

    if (specs.discounts) {
        let totalItemDiscount = 0;

        specs.discounts.forEach((discount) => {
            const oneItemDiscount = discount.amount;

            totalItemDiscount += oneItemDiscount;
        });

        if (totalItemDiscount > computedPrice) {
            computedPrice -= computedPrice;
        } else {
            computedPrice -= totalItemDiscount;
        }
    }

    if (specs.upgrades) {
        const upgradesPrice = specs.upgrades.price;
        computedPrice += upgradesPrice;

        if (specs.upgrades.discounts) {
            let totalUpgradesDiscount = 0;

            specs.upgrades.discounts.forEach((discount) => {
                totalUpgradesDiscount += discount.amount;
            });

            if (totalUpgradesDiscount > upgradesPrice) {
                computedPrice -= upgradesPrice;
            } else {
                computedPrice -= totalUpgradesDiscount;
            }
        }
    }

    if (order.discounts) {
        let totalNumberOrderSpecs = order.products.length;

        let totalOrderDiscount = 0;

        order.discounts.forEach((discount) => {
            totalOrderDiscount += discount.amount;
        });

        computedPrice -= totalOrderDiscount / totalNumberOrderSpecs;
    }

    if (cart.discounts) {
        let totalNumberTransactionSpecs = 0;

        cart.confirmOrders.forEach((order) => {
            order.products.forEach((specs) => {
                const price = specs.overridedPrice || specs.price * specs.quantity;

                if (price !== 0) {
                    totalNumberTransactionSpecs += netPrice ? specs.quantity * 1 : 1;
                }
            });
        });

        let totalTransactionDiscount = 0;

        cart.discounts
            .filter((x) => !x.percentage)
            .forEach((discount) => {
                totalTransactionDiscount += discount.amount;
            });

        computedPrice -= netPrice
            ? (totalTransactionDiscount / totalNumberTransactionSpecs) * specs.quantity
            : totalTransactionDiscount / totalNumberTransactionSpecs;

        let totalTransactionDiscountPercentage = 0;

        cart.discounts
            .filter((x) => x.percentage)
            .forEach((discount) => {
                totalTransactionDiscountPercentage += computeGlobalDiscount(cart, specs);
            });

        computedPrice -= totalTransactionDiscountPercentage;
    }

    return roundUpAmount(netPrice ? computedPrice / specs.quantity : computedPrice);
};

const computeGlobalDiscount = (cart, specs) => {
    let notZero = 0;
    cart.confirmOrders[0].products.forEach((line) => {
      if (line.price !== 0) {
        notZero += line.quantity * 1;
      }
    });
  
    const discounts = cart.discounts.reduce((x, y) => x + y.amount, 0);
    const split = (discounts / notZero) * specs.quantity;
  
    const result = notZero > 1 ? split : discounts;
  
    return specs.price > 0 ? roundUpAmount(result) : specs.price;
  };

const roundUpAmount = (num) => {
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
};

module.exports = {
    computeSpecsPrice
};