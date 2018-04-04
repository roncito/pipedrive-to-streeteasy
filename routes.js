var request = require('request');
var async = require('async');
var xml = require('xml');
var AWS = require('aws-sdk');

// object templates

var xmlObj = { streeteasy: [ 
  { _attr: { version: "1.6"} }, 
  { properties: [] } 
]};

var emptyPropertyTmpl = { property: [ 
  { _attr: { type: "rental", status: "active", url: "http://www.grandand.co/" } },            
  { location: [ 
    { address: '' },
    // TODO { apartment: '4H' }
  ]},
  { details: [ 
    { price: '' },
    { bedrooms: '' },
    { bathrooms: '' },
    { totalrooms: '' },
    { description: { _cdata: ""} },
    { propertyType: '' }
  ]}
]};

var propertyTypes = {'116':'rental','117':'condo','118':'coop','119':'townhouse','120':'condop','121':'house','122':'other'};

var albumBucketName = process.env.BUCKET_NAME;
var bucketRegion = process.env.REGION;
var IdentityPoolId = process.env.IDENTITY_POOL_ID;

AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

var s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: {Bucket: albumBucketName}
});

// Functions

function getProp(arry, key) {
  return arry.find(item => Object.keys(item)[0] === key)[key];
}

function setProp(arry, key, value) {
  var thing = arry.find(item => Object.keys(item)[0] === key);
  if (thing) {
    thing[key] = value;
  } else {
    var tmpThang = {};
    tmpThang[key] = value;
    arry.push(tmpThang);
  }
}

function validateProperty(deal){
  var errors = [];
  // required fields
  // address, city, state, zipcode, price, bedrooms, bathrooms, totalrooms, description, propertyType
  if (!deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_street_number'] || !deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_route']) {
    errors.push("address");
  }
  if (!deal['1e9ee8939fba1c89c1db9348e23023d30866b488']) {
    errors.push("apartment #");
  }
  if (!deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_sublocality']) {
    errors.push("city");
  } 
  if (!deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_admin_area_level_1']) {
    errors.push("state");
  } 
  if (!deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_postal_code']) {
    errors.push("zipcode");
  } 
  if (!deal['460a26a639ef3b52b94fafbea36692cbf4a19f9c']) {
    errors.push("price");
  } 
  if (!deal['cbd454e4c7ae8d76298bee7c4a567fa144b22545']) {
    errors.push("bedrooms");
  } 
  if (!deal['e305c643ef826967949493737e9c26eb7ea72be7']) {
    errors.push("bathrooms");
  } 
  if (!deal['018a380f8ec781628bd4a2b9324f706d82d3bf1d']) {
    errors.push("totalrooms");
  } 
  if (!deal['322f68d44c329c5a28c258cba99bfde3b9fb0179']) {
    errors.push("description");
  } 
  if (!deal['003e50245a8dc0949e426da21e5bfcfacd6f2b7d']) {
    errors.push("propertyType");
  } 
  return errors;
}

function buildProperty(deal,fxn) {
  
  var errors = validateProperty(deal);
  if (errors.length > 0) {
    fxn(null);
    return;
  }
  
  var newProperty = JSON.parse(JSON.stringify(emptyPropertyTmpl)); // clone object
  var _attr = getProp(newProperty.property, '_attr');
  _attr.id = deal.id;
  
  var location = getProp(newProperty.property, 'location');
  setProp(location, 'address', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_street_number'] + ' ' + deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_route']);
  setProp(location, 'apartment', deal['1e9ee8939fba1c89c1db9348e23023d30866b488']);
  setProp(location, 'city', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_sublocality']);
  setProp(location, 'state', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_admin_area_level_1']);
  setProp(location, 'zipcode', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_postal_code']);

  var details = getProp(newProperty.property, 'details');
  setProp(details, 'price', deal['460a26a639ef3b52b94fafbea36692cbf4a19f9c']);
  setProp(details, 'bedrooms', deal['cbd454e4c7ae8d76298bee7c4a567fa144b22545']);
  setProp(details, 'bathrooms', deal['e305c643ef826967949493737e9c26eb7ea72be7']);
  setProp(details, 'availableOn', deal['4fe667043c8b8af2f71803c0a4d211389b23c2c0']);
  // TODO  totalRooms
  var desc = getProp(details,'description');
  if (!!deal['322f68d44c329c5a28c258cba99bfde3b9fb0179'])
    desc['_cdata'] = deal['322f68d44c329c5a28c258cba99bfde3b9fb0179'].replace("\n", "<br />");
  
  setProp(details, 'propertyType', propertyTypes[deal['003e50245a8dc0949e426da21e5bfcfacd6f2b7d']]);
  
  // amenities
  
  var amenities = { amenities: []};
  if (!!deal['870b5f5f53a7ca8189aa7a317c886d7874839c09'])
    amenities.amenities.push({pets: null})

  if (amenities.amenities.length > 0)
    newProperty.property.push(amenities);

  var agents = { agents: []};
  var newAgent = { agent: []};
  newAgent.agent.push({name: deal['user_id']['name']}, {email: deal['user_id']['email']});
  agents.agents.push(newAgent);
  newProperty.property.push(agents);
  
  // open houses ... TODO
  // var open_houses = { openHouses: []};

  // media
  var media = { media: []};
  var albumPhotosKey = encodeURIComponent(deal.id);
  s3.listObjects({Prefix: albumPhotosKey}, function(err, data) {
    if (err) {
      console.log(err);
    }
    // `this` references the AWS.Response instance that represents the response
    var href = this.request.httpRequest.endpoint.href;
    var bucketUrl = href + albumBucketName + '/';
    var photos = data.Contents.map(function(photo) {
      var photoKey = photo.Key;
      var photoUrl = bucketUrl + photoKey;
      media.media.push({photo: { _attr: { url: photoUrl} }});
    });
    newProperty.property.push(media);
    // TODO: add some error checking here so we know XML contains all required fields 
    fxn(newProperty);
  })
}

function addDealLink(item) {
  var dealLink = "https://grandco.glitch.me/deals/"+item.id;
  if (item['3d1491ff621c8ce3e482fd9362caf532b1f0d904']!=dealLink) {
    // write dealLink to Pipedrive
    request({ json: {"3d1491ff621c8ce3e482fd9362caf532b1f0d904": dealLink}, method: 'PUT', url: "https://" + process.env.PIPEDRIVE_SUBDOMAIN + ".pipedrive.com/v1/deals/" + item.id + "?api_token=" + process.env.PIPEDRIVE_API_TOKEN }, function(error, response, body) { 
      if (!error && response.statusCode == 200) { 
        console.log(dealLink);
      } else {
        console.log(response);
      }
    });
  }
}

// Define the routes that our API is going to use.

var routes = function(app) {

  app.get("/", function(req, res) {
    res.render('index');
  });
  
  app.get("/deals", function(req, res) {
    var goOnThen = true, offset = 0, allListings = [];
    // handle pagination
    async.whilst(
      function () { return goOnThen; },
        function (callback) {
          request.get({ url: "https://" + process.env.PIPEDRIVE_SUBDOMAIN + ".pipedrive.com/v1/deals?start=" + offset + "&api_token=" + process.env.PIPEDRIVE_API_TOKEN }, function(error, response, body) { 
            if (!error && response.statusCode == 200) { 
              var response_obj = JSON.parse(body)
              allListings = allListings.concat(response_obj.data);
              offset = response_obj.additional_data.pagination.next_start;
              goOnThen = response_obj.additional_data.pagination.more_items_in_collection;
            } else {
              goOnThen = false;
            }
            callback();
          });            
        },
      function (err) {
        // done loading!
        var StreetEasyListings = [];
        var myObj = JSON.parse(JSON.stringify(xmlObj)); // clone object
        allListings.forEach(item => {
          if (!!item['25c2c17e1ebef818af09df0bc7a4fd8b9401236f']) { // streeteasy tag
            StreetEasyListings.push(item);
          }
          // check to see if item has URL, if not add it
          addDealLink(item);
        });
        var idx = 0;
        for (let deal of StreetEasyListings) {
          buildProperty(deal, function(property) {
            if (property) {
              myObj['streeteasy'][1]['properties'].push(property);
            }
            idx++;
            if (idx == StreetEasyListings.length){
              res.set('Content-Type', 'text/xml');
              res.send(xml(myObj, { declaration: true, indent: '\t' }));
            }
          });
        }
        if (StreetEasyListings.length==0){
          res.set('Content-Type', 'text/xml');
          res.send(xml(myObj, { declaration: true, indent: '\t' }));
        }
      }
    );
  }); 
  
  app.get("/deals/:pid", function(req, res) {
    request.get({ url: "https://" + process.env.PIPEDRIVE_SUBDOMAIN + ".pipedrive.com/v1/deals/" + req.params.pid + "?api_token=" + process.env.PIPEDRIVE_API_TOKEN }, function(error, response, body) { 
      if (!error && response.statusCode == 200) {
        var response_obj = JSON.parse(body)
        var vars = {
          bucketName: process.env.BUCKET_NAME,
          region: process.env.REGION,
          identityPoolId: process.env.IDENTITY_POOL_ID,
          pid: req.params.pid,
          title: response_obj['data']['title'],
          errors: validateProperty(response_obj['data'])
        }
        res.render('deal', vars);
      } else {
        res.send('Whoops, something went wrong. Try refreshing the page.');
      }
    });
  })
}

module.exports = routes;