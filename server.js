//
// This is where the app starts, and sets things up
// We require the packages we need, body parser and express, and then set up body parser to accept
// JSON and URL encoded values. We then include the `routes.js` file, in which we define the API
// end-points we're going to be using, and we pass it the `app` variable. Lastly, we specify the
// port to listen to for requests. In this case, port 3000.
// 
var express = require("express");
var bodyParser = require("body-parser");
var path = require("path");
var app = express();
var hbs = require('express-hbs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// set the view engine
app.set('view engine', 'hbs');

// configure the view engine 
app.engine('hbs', hbs.express4({  
  defaultLayout: __dirname + '/views/layouts/main.hbs',
  partialsDir: __dirname + '/views/partials',
  layoutsDir: __dirname + '/views/layouts'
}));

// configure views path
app.set('views', path.join(__dirname,'/views'));


var routes = require("./routes.js")(app);

var server = app.listen(3000, function () {
  console.log("Listening on port %s", server.address().port);
});