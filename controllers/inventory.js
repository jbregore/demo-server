const HttpError = require('../middleware/http-error');
const Product = require('../models/Product');
const Papa = require('papaparse');
const { validationResult } = require('express-validator');
const Category = require('../models/Category');
const { simplePaginate } = require('../services/simplePaginate');

exports.createCategory = async (req, res, next) => {
  const { name } = req.body;

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const category = new Category({
    name
  });

  try {
    const newCategory = await category.save();

    return res.status(201).json({
      message: 'Category created successfully',
      data: newCategory
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getAllCategories = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 });

    return res.status(200).json({
      data: categories
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getCategories = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 5, search = '', sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;

    let query = {};
    if (search) {
      query = { name: { $regex: new RegExp(search, 'i') } };
    }

    const { paginationMeta, limit, skip } = await simplePaginate(
      Category,
      { page, pageSize },
      query
    );

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const categories = await Category.find(query)
      .sort(sortOptions)
      .limit(limit).skip(skip);

    return res.status(200).json({
      meta: paginationMeta,
      data: categories
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.updateCategory = async (req, res, next) => {
  const { categoryId } = req.params;
  const { name } = req.body;

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  try {
    const category = await Category.findByIdAndUpdate(categoryId, { name }, { new: true });

    if (!category) {
      return res.status(401).json({ message: 'Category not found' });
    }

    return res.status(200).json({
      message: 'Category updated successfully',
      data: category
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const associatedProducts = await Product.findOne({ category: categoryId });

    if (associatedProducts) {
      return res.status(401).json({
        message: 'Category cannot be deleted as it is associated with one or more products.'
      });
    }

    await Category.findByIdAndDelete(categoryId);
    return res.status(200).json({ message: 'Category deleted' });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getAllProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 5,
      search = '',
      sortBy = 'productCode',
      sortOrder = 'asc',
      category = "All",
      availability = "All"
    } = req.query;

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: new RegExp(search, 'i') } },
          { productCode: { $regex: new RegExp(search, 'i') } }
        ]
      };
    }
    if (category !== "All") {
      query.category = category;
    }
    if (availability !== "All") {
      query.availability = availability;
    }

    const { paginationMeta, limit, skip } = await simplePaginate(
      Product,
      { page, pageSize },
      query
    );

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .populate('category')
      .sort(sortOptions)
      .limit(limit)
      .skip(skip);

    return res.status(200).json({
      meta: paginationMeta,
      data: products
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      pageSize = 5,
      sort = 'productCode',
      sortDirection = 'asc',
      filter = "{}"
    } = req.query;
    const query = await JSON.parse(filter);
    if (query.category == -1) delete query.category;
    if (query.search) {
      query.$or = [
        {
          name: {
            $regex: new RegExp(query.search, 'i')
          }
        },
        {
          productCode: {
            $regex: new RegExp(query.search, 'i')
          }
        }
      ];
      delete query.search;
    }


    const { paginationMeta, limit, skip } = await simplePaginate(
      Product,
      { page, pageSize },
      query
    );
    const sortOptions = {};
    sortOptions[sort] = sortDirection === 'desc' ? -1 : 1;

    const products = await Product.find({
      ...query,
      availability: true
    })
      .populate('category')
      .sort(sortOptions)
      .limit(limit)
      .skip(skip);

    return res.status(200).json({
      meta: paginationMeta,
      data: products
    });
  } catch (err) {

    console.log("err ",err)
    return res.status(400).json({ message: err.message });
  }
};

exports.createProduct = async (req, res, next) => {
  const { productCode, name, price, vatable, description, category, size, color } = req.body;

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  try {
    const newProduct = new Product({
      name,
      productCode,
      description,
      price,
      category,
      size,
      color,
      vatable
    });

    await newProduct.save();
    return res.status(201).json({ message: 'Product created successfully', data: newProduct });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.updateProduct = async (req, res, next) => {
  const { productCode } = req.params;
  const { availability } = req.body;

  try {
    const message = availability ? 'enabled' : 'disabled';

    await Product.findOneAndUpdate({ productCode }, { availability: availability });
    return res.status(200).json({ message: `Product ${message} successfully` });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

async function formatProducts(products) {
  try {
    let categories;
    const getCategories = await Category.find({});
    if (getCategories) {
      categories = getCategories.map(({ _id, name }) => ({ _id, name }));
    }

    const importedCategories = [...new Set(products.map(product => product.Category.toLocaleLowerCase()))]
      .filter((category) => !getCategories.find(({ name }) => category == name));

    if (importedCategories.length > 0) {
      const insertedCats = await Category.insertMany(
        importedCategories.map(category => ({
          name: category
        })));
      categories = [
        ...categories,
        ...insertedCats.map(({ _id, name }) => ({ _id, name }))
      ];
    }

    const existingProducts = await Product.find({}, 'productCode');
    const productCodes = existingProducts.map(product => product.productCode);

    return products
    .filter(product => !productCodes.includes(product['Product Code']))
    .map((product) => {
      let category = categories.find(({ name }) => name.toLocaleLowerCase() === product.Category.toLocaleLowerCase());

      return {
        name: product.Name,
        productCode: product['Product Code'],
        description: product.Description,
        price: parseFloat(product.Price),
        category,
        stock: parseInt(product.Stocks),
        size: product.Size,
        color: product.Color,
        availability: Boolean(product.Availability),
        vatable: Boolean(product.Vatable)
      };
    });
  } catch (error) {
    console.error(error);
  }
}

exports.updateProductsFromCsv = async (req, res, next) => {
  try {
    const csvData = req.files.file.data.toString();

    const { data: products, errors } = Papa.parse(csvData, { header: true, skipEmptyLines: true, });

    if (errors.length > 0) {
      const error = new HttpError('Unable to parse CSV file.', 400);
      return next(error);
    }

    const uniqueProducts = removeCsvDuplicates(products);
    const formattedProducts = await formatProducts(uniqueProducts);
    await Product.insertMany(formattedProducts);
    return res.status(200).json({ data: 'OK' });
  } catch (err) {
    console.log("err ", err)
    return res.status(400).json({ message: err.message });
  }
};

exports.updateProductsFromOnline = async (req, res, next) => {
  try {
    const { products, products1 } = req.body;
    let formattedProducts = await formatProducts(products);
    await Product.insertMany(formattedProducts);
    formattedProducts = await formatProducts(products1);
    await Product.insertMany(formattedProducts);
    return res.status(200).json({ data: 'OK' });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ message: err.message });
  }
};

exports.removeProducts = async (req, res, next) => {
  const { category } = req.query;
  try {
    const result = await Product.deleteMany({
      ...(category != 'All' && {
        category: category
      })
    });
    return res.status(200).json({ data: result });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

const removeCsvDuplicates = (products) => {
  const uniqueProducts = [];
  const productCodesSet = new Set();

  for (const product of products) {
    if (!productCodesSet.has(product['Product Code'])) {
      uniqueProducts.push(product);
      productCodesSet.add(product['Product Code']);
    }
  }

  return uniqueProducts;
};
