'use strict';
var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');
var walker = require('./walker.js');
var util = require('util');

function run_esprima(code, options){
    var json = true;
    var bool = false;
    if (options){
        if (options.json !== undefined){
            json = options.json;
        }
        if (options.bool !== undefined){
            bool = options.bool;
        }
    }

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

    tree = walker.walk(parsed, code, syntax, exit_funcs);
    var extracted = extract(tree);
    var exits = extracted.exits;
    var non_exits = extracted.non_exits;
    var conditions = exits.concat(non_exits);

    for (var i = 0; i < exits.length; i++) {
        for (var j = 0; j < exits.length; j++) {
            if (i !== j){
                if (exits[j].condition.indexOf(exits[i].condition) === 0){
                    exits.splice(j, 1)
                }
            }
        }
        for (var j = 0; j < non_exits.length; j++){
            if (non_exits[j].condition.indexOf(exits[i].condition) === 0){
                non_exits.splice(j, 1);
            }
        }
    }

    for (var i = 0; i < global_exits.length; i++) {
        delete global_exits[i].type;
        delete global_exits[i].expression;
    }

    if (bool){
        if (global_exits.length){
            return true;
        } else{
            return false;
        }
    } else if (json){
        return {
            'exits': exits,
            'non_exits': non_exits,
            'global_exits': global_exits,
        }
    } else{
        if (global_exits.length){
            return "Hooray! Your code contains a global exit.";
        } else{
            if (non_exits.length){
                var str = "Your code does not contain an exit under the following conditions:\n\n";
                for (var i = 0; i < non_exits.length; i++) {
                    str += "  - " + non_exits[i].condition;
                    var start = non_exits[i].loc.start.line;
                    var end = non_exits[i].loc.end.line;
                    str += "\nlines " + start + "-" + end + "\n";
                }
                return str;
            } else{
                return "Hooray! Your code will always exit."
            }
        }
    }
}

function extract(tree){
    var str = '';
    var exits = [];
    var non_exits = [];

    for (var i = 0; i < tree.length; i++) {
        for (var j = 0; j < tree[i].exits.length; j++) {
            exits.push({
                'condition': tree[i].exits[j].condition,
                'loc': tree[i].exits[j].loc,
            });
        }
        for (var j = 0; j < tree[i].non_exits.length; j++) {
            non_exits.push({
                'condition': tree[i].non_exits[j].condition,
                'loc': tree[i].non_exits[j].loc,
            });
        }
    }

    return {
        'exits': exits,
        'non_exits': non_exits,
    }
}

function read_file(filename, options){
    if (filename !== undefined && filename !== null){
        var file = fs.readFileSync(filename, 'utf-8');
        return run_esprima(file, options);
    } else {
        throw new Error('No file name supplied.');
    }
}

module.exports = {
    'test_file': read_file,
    'test_string': run_esprima,
}