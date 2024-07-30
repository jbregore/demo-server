// Function to get unique property values
function getUniquePropertyValues(arr, prop) {
    return [...new Set(arr.map(item => item[prop]))];
}


module.exports = {
    getUniquePropertyValues
};