const session = require('express-session');

module.exports = function () {
  let mysql = require('mysql2');

  //Establish Connection to the DB
  let connection = mysql.createConnection({
    host: session.settings.backupDbHost,
    user: session.settings.backupDbUser,
    password: session.settings.backupDbPassword,
    database: session.settings.backupDbName,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  //Instantiate the connection
  connection.connect(function (err) {
    if (err) {
      console.log('Failed to connect in Backup Database');
    }
  });

  //return connection object
  return connection;
};
