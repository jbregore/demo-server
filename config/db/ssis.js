const session = require('express-session');

module.exports = function () {
  let mysql = require('mysql2');

  //Establish Connection to the DB
  let connection = mysql.createConnection({
    host: session.settings.dbHost,
    user: session.settings.dbUser,
    password: session.settings.dbPassword,
    database: session.settings.dbName,
    charset: 'utf8mb4'
  });

  //Instantiate the connection
  connection.connect(function (err, ) {
    if (err) {
      console.log('Failed to connect in SSIS Database');
    }
  });

  //return connection object
  return connection;
};
