const fetch = require('cross-fetch');
const { ApolloClient, createHttpLink, InMemoryCache } = require('@apollo/client');
const { setContext } = require('@apollo/client/link/context');

const createApolloClient = (apiKey = null) => {
  const httpLink = createHttpLink({
    uri: process.env.UMBRA_SYSTEMS_API_URL,
    fetch
  });

  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        'x-api-key': apiKey
      }
    };
  });

  const client = new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network'
      }
    }
  });

  return client;
};

module.exports = {
  createApolloClient
};
