#! /usr/bin/env node
'use strict';
var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');
var walker = require('./walker.js');
var promise = require('./promise.js');
var callback = require('./callback.js');
var conditional = require('./conditional.js');
var consts = require('./consts.js');

function generate_output_string(global_exit, conditionals, promises, callbacks){
  /*
    Generates final program output as a readable string.

    @param global_exit: an array of esprima nodes of program scope which exit
    @param conditionals: an object that indicates when/whether conditionals exit
    @param promises: an object that indicates when/whether promises exit
    @param callbacks: an object that indicates when/whether callbacks exit

    @return: a string explaining problems or lack thereof
      - strings which begin 'Hooray!' always exit
      - strings which begin 'Your code never exits' never exit
      - strings containing 'under the following conditions' deal with conditionals
      - strings containing 'For promised function' deal with promises
      - strings containing 'For callback chain' deal with callbacks
  */
  if (global_exit){
    return "Hooray! Your code contains a global exit.";
  } else if (conditionals.never_exits && promises.never_exits && callbacks.never_exits){
    return "Your code never exits. Adding an `exit` call to the end of your code will prevent the process from hanging.";
  } else if (conditionals.always_exits || promises.always_exits || callbacks.always_exits){
    return "Hooray! Your code will always exit.";
  } else {
    // Some exit, some don't, let's just share what's relevant
    var str = "";
    for (var i = 0; i < conditionals.need_exits.length; i++){
      var conditional = conditionals.need_exits[i];
      if (str) str += "\n";
      str += "Line " + conditional.line + ": " + conditional.message;
    }

    for (var j = 0; j < callbacks.need_exits.length; j++){
      var callback = callbacks.need_exits[j];
      if (str) str += "\n";
      str += "Line " + callback.line + ": " + callback.message;
    }

    for (var k = 0; k < promises.need_exits.length; k++){
      var promise = promises.need_exits[k];
      if (str) str += "\n";
      str += "Line " + promise.line + ": " + promise.message;
    }

    if (str === ""){
      str = "Something went wrong with parsing. Your code lacks an exit, but we can't figure out where. Adding a global `exit` call to the end of your code will prevent the process from hanging.";
    }

    return str;
  }
}

function run_esprima(code, options){
  /*
    Tests string of code for exit calls.

    @param code: a string of some code to test
    @param options: an optional parameter used to format output
      options.json sets whether to return a JSON object, defaults to false.

    @return: varies based on options.json:
      if options.json is truthy, an object with the following properties:
        `global_exit`: a boolean of whether there is a global exit
        `conditionals`: an object that indicates when/whether conditionals exit
        `promises`: an object that indicates when/whether promises exit
        `callbacks`: an object that indicates when/whether callbacks exit
      if options.json is falsy/options undefined, a string which explains 
        problems with relevant line numbers
  */
  var parsed = esprima.parse(code, {
    loc: true,
    range: true,
  });
  var global_exit = false;
  var syntax = walker.syntax();

  // get all functions that always exit
  var added = utils.check_functions(parsed);
  var exit_funcs = added;

  function filter_out(element){
    return exit_funcs.indexOf(element) < 0;
  }

  while (added.length){
    added = utils.check_functions(parsed, exit_funcs);
    added = added.filter(filter_out);
    exit_funcs = exit_funcs.concat(added);
  }

  // look for global exits and functions declarations that take callbacks
  var callback_funcs = [];

  for (var i = 0; i < parsed.body.length; i++){
    if (!global_exit && utils.is_exit(parsed.body[i], exit_funcs)){
      global_exit = true;
    }

    if (parsed.body[i].type === consts.func_dec){
      var callback_func = callback.test_declaration(parsed.body[i], exit_funcs);
      if (callback_func){
        callback_funcs.push(callback_func);
      }
    }
  }

  // test promises
  var promises = promise.test(parsed, exit_funcs);
  promises = promise.reduce(promises);

  // actually test the callbacks, as long as callback_funcs has meaningful content
  function test_callback(node){
    return callback.test(node, callback_funcs, exit_funcs);
  }
  var callbacks = walker.walk(parsed, test_callback, syntax);
  callbacks = callback.reduce(callbacks);

  // test conditionals
  function test_conditional(node){
    return conditional.test(node, exit_funcs, code);
  }
  var conditionals = walker.walk(parsed, test_conditional, syntax);
  conditionals = conditional.reduce(conditionals);

  if (options && options.json){  
    return {
      'global_exit': global_exit,
      'conditionals': conditionals,
      'promises': promises,
      'callbacks': callbacks,
    };
  } else {
    return generate_output_string(global_exit, conditionals, promises, callbacks); 
  }
}

function read_file(filename, options){
  /*
    Tests file for exit calls.

    @param filename: a path to a file
    @param options: an optional parameter used to format output
      options.json sets whether to return a JSON object, defaults to false.

    @return: depending on options.json either:
      if options.json is truthy, an object with the following properties:
        `global_exit`: a boolean of whether there is a global exit
        `conditionals`: an object that indicates when/whether conditionals exit
        `promises`: an object that indicates when/whether promises exit
        `callbacks`: an object that indicates when/whether callbacks exit
      if options.json is falsy/options undefined, a string which explains 
        problems with relevant line numbers
  */
  if (filename !== undefined && filename !== null){
    var file = String(fs.readFileSync(filename));
    return run_esprima(file, options);
  } else {
    throw new Error('No file name supplied.');
  }
}

module.exports = {
  'test_file': read_file,
  'test_string': run_esprima,
};

if (process.argv.length > 2){
  var args = process.argv;
  if (args[0] === 'node' && !(/mocha$/.exec(args[1]))){
    // we are not testing, so what args were we given (assume they're filenames)
    for (var i = 2; i < args.length; i++) {
      console.log(read_file(args[i]));
      if (i < args.length - 1){
        console.log("------------");
      }
    }
  }
}
