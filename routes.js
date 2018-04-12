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
  { _attr: { url: "http://www.grandand.co/" } },            
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
  if (!deal['db856b47ec6d743bd178f979ca762b560ae77fe5']) {
    errors.push("propertyStatus");
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
  
  _attr.type = propertyTypeById(deal['db856b47ec6d743bd178f979ca762b560ae77fe5']);
  _attr.status = statusById(deal['1ebd49852bc24dadf2ac29b68f0afa251dc8667a']);

  /*
  if (deal.id!=628) {
    fxn(null);
    return;
  }
  */
  //console.log(deal);
  
  var location = getProp(newProperty.property, 'location');
  setProp(location, 'address', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_street_number'] + ' ' + deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_route']);
  setProp(location, 'apartment', deal['1e9ee8939fba1c89c1db9348e23023d30866b488']);
  setProp(location, 'city', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_sublocality']);
  setProp(location, 'state', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_admin_area_level_1']);
  setProp(location, 'zipcode', deal['c02cee8bf70bc825900eaf357738cc921cd29ed5_postal_code']);

  var details = getProp(newProperty.property, 'details');
  setProp(details, 'price', deal['460a26a639ef3b52b94fafbea36692cbf4a19f9c']);
  if (!!deal['4f410cb04877fd90cf679cff33d05a5b54355a3b'])
    setProp(details, 'noFee', null);
  
  if (!!deal['b37fd09fade78bfc53efa0571d067b462a2dc523'])
    setProp(details, 'exclusive', null);

  setProp(details, 'bedrooms', deal['cbd454e4c7ae8d76298bee7c4a567fa144b22545']);
  setProp(details, 'bathrooms', deal['e305c643ef826967949493737e9c26eb7ea72be7']);
  setProp(details, 'availableOn', deal['4fe667043c8b8af2f71803c0a4d211389b23c2c0']);
  // TODO  totalRooms
  var desc = getProp(details,'description');
  if (!!deal['322f68d44c329c5a28c258cba99bfde3b9fb0179'])
    desc['_cdata'] = deal['322f68d44c329c5a28c258cba99bfde3b9fb0179'].replace(/\n/g, "<br />");
  
  console.log(propertyTypes[deal['003e50245a8dc0949e426da21e5bfcfacd6f2b7d']]);
  
  if (propertyTypes[deal['003e50245a8dc0949e426da21e5bfcfacd6f2b7d']]) {
    setProp(details, 'propertyType', propertyTypes[deal['003e50245a8dc0949e426da21e5bfcfacd6f2b7d']]);
  } else {
    setProp(details, 'propertyType', 'other');
  }
  
  // amenities
  var amenities = { amenities: []};
  if (!!deal['870b5f5f53a7ca8189aa7a317c886d7874839c09'])
    amenities.amenities.push({pets: null})

  if (amenities.amenities.length > 0)
    newProperty.property.push(amenities);
  
  // Open houses
  if (deal['7583fec7ddcee5d2ecc0cbcb3f2ad7d9746db210']) {
    var open_houses = { openHouses: []}, itemArry, startTime, endTime, newOpenHouse;
    deal['7583fec7ddcee5d2ecc0cbcb3f2ad7d9746db210'].split(",").map(function(item) {
      newOpenHouse = { openHouse: []};
	    item = item.trim();
      if (/\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}\w{2} to \d{1,2}:\d{2}\w{2}( APPT-ONLY)?/.test(item)) {
      	itemArry = item.split(' ');
      	startTime = itemArry[0] + ' ' + itemArry[1];
      	endTime = itemArry[0] + ' ' + itemArry[3];
        newOpenHouse.openHouse.push({startsAt: startTime}, {endsAt: endTime});
        if (itemArry[4]=='APPT-ONLY') {
          newOpenHouse.openHouse.push({apptOnly: null});
        }
        open_houses.openHouses.push(newOpenHouse);
      }
    });
    newProperty.property.push(open_houses);
  }
 
  // agents
  var agents = { agents: []}, newAgent = { agent: []}, myAgent;  
  /*
  if (deal['aa9ec1d69792cbbfd7f15cf4c98ea334197f03ca']) {
    // billing
    newAgent = { agent: []};
    myAgent = billingAgentById(deal['aa9ec1d69792cbbfd7f15cf4c98ea334197f03ca']);
    newAgent.agent.push({name: myAgent[0]}, {email: myAgent[1]});
    agents.agents.push(newAgent);
  }
  */
  if (deal['f70ffcba8da2d1bd2f98107d648222d43cbdb34a']) {
    // primary
    newAgent = { agent: []};
    myAgent = primaryAgentById(deal['f70ffcba8da2d1bd2f98107d648222d43cbdb34a']);
    console.log(billingAgentById(deal['aa9ec1d69792cbbfd7f15cf4c98ea334197f03ca']));
    console.log(primaryAgentById(deal['f70ffcba8da2d1bd2f98107d648222d43cbdb34a']));
    newAgent.agent.push({name: myAgent[0]}, {email: myAgent[1]});
    agents.agents.push(newAgent);
  }
  if (deal['c476ecc1c31a94902db81c5b4f2de6cb67b19f1c']) {
    // secondary
    newAgent = { agent: []};
    myAgent = secondaryAgentById(deal['c476ecc1c31a94902db81c5b4f2de6cb67b19f1c']);
    newAgent.agent.push({name: myAgent[0]}, {email: myAgent[1]});
    agents.agents.push(newAgent);
  }
  if (deal['aa9ec1d69792cbbfd7f15cf4c98ea334197f03ca'] || deal['f70ffcba8da2d1bd2f98107d648222d43cbdb34a'] || deal['c476ecc1c31a94902db81c5b4f2de6cb67b19f1c']) {
    newProperty.property.push(agents);
  }

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

function billingAgentById(id) {
  if (id == '144') {
    return ['David Shapiro','david@grandand.co'];
  } else if (id == '145') {
    return ['Ryan Hanover','rhanover@grandand.co'];
  } else if (id == '146') {
    return ['Kelly Moffet', 'kmoffett@grandand.co'];
  } else if (id == '147') {
    return ['Jen Taher','jtaher@grandand.co'];
  } else if (id == '148') {
    return ['Grand and Co.','hello@grandand.co'];
  } else {
    return ''
  }
}

function primaryAgentById(id) {
  if (id == '132') {
    return ['David Shapiro','david@grandand.co'];
  } else if (id == '133') {
    return ['Ryan Hanover','rhanover@grandand.co'];
  } else if (id == '134') {
    return ['Kelly Moffet', 'kmoffett@grandand.co'];
  } else if (id == '164') {
    return ['Jen Taher','jtaher@grandand.co'];
  } else if (id == '135') {
    return ['Grand and Co.','hello@grandand.co'];
  } else {
    return ['Grand and Co.','hello@grandand.co'];
  }
}
          
function secondaryAgentById(id) {
  if (id == '129') {
    return ['Ryan Hanover','rhanover@grandand.co'];
  } else if (id == '130') {
    return ['Kelly Moffet', 'kmoffett@grandand.co'];
  } else if (id == '128') {
    return ['Jen Taher','jtaher@grandand.co'];
  } else if (id == '131') {
    return ['Grand and Co.','hello@grandand.co'];
  } else {
    return ['Grand and Co.','hello@grandand.co'];
  }
}

function propertyTypeById(id) {
  if (id == '149') {
    return 'rental';
  } else if (id == '150') {
    return 'sale';
  } else {
    return '';
  }
}

// active|off-market|temp-off-market|in-contract|contract-out|contract-signed|unavailable|sold|rented
function statusById(id) {
  if (id == '151') {
    return 'active';
  } else if (id == '152') {
    return 'off-market';
  } else if (id == '153') {
    return 'temp-off-market';
  } else if (id == '154') {
    return 'in-contract';
  } else if (id == '155') {
    return 'contract-out';
  } else if (id == '165') {
    return 'contract-signed';
  } else if (id == '166') {
    return 'unavailable';
  } else if (id == '167') {
    return 'sold';
  } else if (id == '168') {
    return 'rented';
  } else {
    return '';
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