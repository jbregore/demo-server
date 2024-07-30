const { gql } = require('@apollo/client');

exports.CREATE_POS_TRANSACTION_MUTATION = gql`
  mutation CreatePosTransaction($posDeviceId: ID!, $posTransaction: CreatePosTransactionInput!) {
    createPosTransaction(posDeviceId: $posDeviceId, posTransaction: $posTransaction) {
      success
      message
    }
  }
`;

exports.CREATE_POS_PRODUCT_SALES_MUTATION = gql`
  mutation CreatePosProductSales(
    $posDeviceId: ID!
    $posProductSales: [CreatePosProductSalesInput!]!
  ) {
    batchCreatePosProductSales(posDeviceId: $posDeviceId, posProductSales: $posProductSales) {
      success
      message
    }
  }
`;

exports.CREATE_POS_PAYMENT_RECORDS_MUTATION = gql`
  mutation CreatePosPaymentRecord(
    $posDeviceId: ID!
    $posPaymentRecords: [CreatePosPaymentRecordInput!]!
  ) {
    batchCreatePosPaymentRecords(posDeviceId: $posDeviceId, posPaymentRecords: $posPaymentRecords) {
      success
      message
    }
  }
`;

exports.CREATE_POS_GRAND_ACCUMULATED_SALES_MUTATION = gql`
  mutation CreatePosGrandAccumulatedSales(
    $posDeviceId: ID!
    $posGrandAccumulatedSales: CreatePosGrandAccumulatedSalesInput!
  ) {
    createPosGrandAccumulatedSales(
      posDeviceId: $posDeviceId
      posGrandAccumulatedSales: $posGrandAccumulatedSales
    ) {
      success
      message
    }
  }
`;
