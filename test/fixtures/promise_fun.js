'use strict';
var exit = console.log;

var rest = require('restler');
var Q = require('q');

function request(url) {
    var deferred = Q.defer();
    rest.get(url).on('success', function(data, res) {
        deferred.resolve(data);
    }).on('error', function(err, res) {
        deferred.reject(err);
    });
    return deferred.promise;
}

// Promise Magic
// Change any URL to a non-existant one to get the `err` to fire.
request('http://googhle.com').then(function(data) {
    [data, request('http://google.com')]
}).spread(function(data1, data2) {
    [data1, data2, request('http://google.com')]
}).spread(function(data1, data2, data3) {
    exit([data1, data2, data3]);
}).catch(function(err) {
    //exit(err)
}).finally(function() {
    exit();
});