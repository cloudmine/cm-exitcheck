'use strict';
var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');
var walker = require('./walker.js');

function run_esprima(code){
    var parsed = esprima.parse(code, {
        loc: true,
        range: true,
    });
    var tree = [];
    var global_exits = [];
    var syntax = walker.syntax();

    for (var i = 0; i < parsed.body.length; i++){
        if (utils.is_exit(parsed.body[i])){
            global_exits.push(parsed.body[i]);
        }
    }

    tree.push(walker.walk(parsed, syntax));

    var exits = [];
    var non_exits = [];
    for (var i = 0; i < tree.length; i++){
        for (var j = 0; j < tree[i].length; j++){
            var branch = tree[i][j];
            exits = utils.combine(exits, branch.exits);
            non_exits = utils.combine(non_exits, branch.non_exits);
        }
    }

    var all = utils.combine_by_test(exits, non_exits, code);
    all = utils.reformat(all);
    all.global = global_exits;

    return all;
}

module.exports = {
    'test_file': read_file,
    'test_string': run_esprima,
}

function read_file(filename){
    if (filename !== undefined && filename !== null){
        var file = fs.readFileSync(filename, 'utf-8');
        return run_esprima(file);
    } else {
        throw new Error('No file name supplied.');
    }
}

var filename = process.argv[2];
if(filename !== undefined){
    console.log(read_file(filename));
    // console.log(JSON.stringify(read_file(filename), null, 2));
}