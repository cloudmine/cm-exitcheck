'use strict';
var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');
var walker = require('./walker.js');
var util = require('util');

function run_esprima(code){
    var parsed = esprima.parse(code, {
        loc: true,
        range: true,
    });
    var tree;
    var global_exits = [];
    var syntax = walker.syntax();

    var exit_funcs = utils.check_functions(parsed);

    for (var i = 0; i < parsed.body.length; i++){
        if (utils.is_exit(parsed.body[i], exit_funcs)){
            global_exits.push(parsed.body[i]);
        }
    }

    tree = walker.walk(parsed, syntax, exit_funcs, code);
    var str = "";
    var exits = [];
    var non_exits = [];
    for (var i = 0; i < tree.all.length; i++) {
        for (var j = 0; j < tree.all[i].exits.length; j++) {
            var str = tree.all[i].exits[j].condition;
            var start = tree.all[i].exits[j].loc.start.line;
            var end = tree.all[i].exits[j].loc.end.line;
            str += " (lines " + start + "-" + end + ")"
            exits.push(str);
        }
        for (var j = 0; j < tree.all[i].non_exits.length; j++) {
            var str = tree.all[i].non_exits[j].condition;
            var start = tree.all[i].non_exits[j].loc.start.line;
            var end = tree.all[i].non_exits[j].loc.end.line;
            str += " (lines " + start + "-" + end + ")";
            non_exits.push(str);
        }
    }

    console.log("exits:");
    console.log(exits);
    console.log("\ndoesn't exit:");
    console.log(non_exits);

    return tree;
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
    var returned = read_file(filename);
    // console.log(read_file(filename));
    // console.log(JSON.stringify(read_file(filename), null, 2));
}