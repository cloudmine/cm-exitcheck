'use strict';

function wrapped_exit(args){
   exit(args);
}

var rest = require('restler');

function request(url, cb) {
   rest.get(url).on('success', function(data, res) {
      cb(null, data);
   }).on('error', function(err, res) {
      cb(err);
   });
}

// Callback Hell
// Change any URL to a non-existant one to get the `err` to fire.
request('http://google.com', function(err, data1) {
   if (err) {
//      return wrapped_exit(err);
   } else {
      
   }
   request('http://google.com', function(err, data2) {
      if (err != null)
        return exit(err);

      request('http://google.com', function(err, data3) {
        if (null !== err){
           wrapped_exit(err); 
        }

        request('http://google.com', function(err, data4) {
           exit([
              data1,
              data2,
              data3,
              data4,
           ]);
        });
      });
   });
});
