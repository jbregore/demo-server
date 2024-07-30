exports.simplePaginate = async (model, params, query) => {
  const { page, pageSize } = params;

  const pageNumber = parseInt(page);
  const limit = parseInt(pageSize);

  const skip = (pageNumber - 1) * limit;

  const totalCount = await model.countDocuments(query);
  const nextPage = pageNumber * limit < totalCount ? pageNumber + 1 : null;
  const lastPage = Math.ceil(totalCount / limit);

  const paginationMeta = {
    totalRecords: totalCount,
    nextPage: nextPage,
    lastPage: lastPage
  };

  return { paginationMeta, limit, skip };
};

exports.paginateOrderSales = async (model, params, query) => {
  const { page, pageSize } = params;

  const pageNumber = parseInt(page);
  const limit = parseInt(pageSize);

  const skip = (pageNumber - 1) * limit;

  const pipeline = [
    { $match: query },
    {
      $unwind: '$products'
    },
    { $match: { 'products.status': { $ne: 'cancelled' } } },
    {
      $group: {
        _id: {
          productCode: '$products.productCode',
          productName: '$products.productName'
        },
        countOrders: { $sum: '$products.quantity' },
        totalAmount: { $sum: { $multiply: ['$products.price', '$products.quantity'] } }
      }
    },
    { $count: 'totalCount' }
  ];

  const aggregationResult = await model.aggregate(pipeline);

  const totalCount = aggregationResult.length > 0 ? aggregationResult[0].totalCount : 0;

  const nextPage = pageNumber * limit < totalCount ? pageNumber + 1 : null;
  const lastPage = Math.ceil(totalCount / limit);

  const paginationMeta = {
    totalRecords: totalCount,
    nextPage: nextPage,
    lastPage: lastPage
  };

  return { paginationMeta, limit, skip };
};

