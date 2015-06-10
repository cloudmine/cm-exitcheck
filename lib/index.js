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

function generate_output_string(conditionals, global_exits, promises, callbacks){
   /*
      Generates final program output as a readable string.

      @param conditionals: conditionals
      @param global_exits: an array of esprima nodes of program scope which exit
      @param promises: an array of fcn calls that return promises, which have 
         been parsed to identify when they exit
      @param callbacks: an array of functions with their callbacks, which have 
         been parsed to identify when they exit

      @return: a string explaining problems or lack thereof.
         - strings which begin 'Hooray!' always exit
         - strings which begin 'Your code never exits' never exit
         - strings containing 'For promised function' deal with promises
         - strings containing 'For callback chain' deal with callbacks
         - strings containing 'under the following conditions' deal with conditionals
   */
   if (global_exits.length){
      return "Hooray! Your code contains a global exit.";
   } else if (conditionals.never_exits && promises.never_exits && callbacks.never_exits){
      return "Your code never exits. Adding an `exit` call to the end of your code will prevent the process from hanging.";
   } else if (conditionals.always_exits || promises.always_exits || callbacks.always_exits){
      return "Hooray! Your code will always exit.";
   } else {
      // Some exit, some don't, let's just share what's relevant
      var str = "";
      if (conditionals.need_exits.length){
         str += conditional.output(conditionals);
      }

      if (promises.need_exits.length){
         str += promise.output(promises);
      }

      if (callbacks.need_exits.length){
         str += callback.output(callbacks);
      }

      if (str === ""){
         str = "Something went wrong with parsing. Your code lacks an exit, but we can't figure out where. Adding a global `exit` call to the end of your code will certainly prevent hanging."
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

      @return: depending on options.json either:
         if options.json is truthy, an object with the following properties:
            `exits`: an array of nodes that exit successfully
            `non_exits`: an array of nodes related to `exits` that do not exit
            `global_exits`: an array of program-scope exits
            `promises`: an array of exiting/non exiting promise fcn calls
         if options.json is falsy/options undefined, a string which explains 
            problems with relevant line numbers
   */
   var parsed = esprima.parse(code, {
      loc: true,
      range: true,
   });
   var global_exits = [];
   var syntax = walker.syntax();

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

   var callback_funcs = [];

   for (var i = 0; i < parsed.body.length; i++){
      if (utils.is_exit(parsed.body[i], exit_funcs)){
         global_exits.push(parsed.body[i]);
      }

      if (parsed.body[i].type === consts.func_dec){
         var callback_func = callback.test_declaration(parsed.body[i]);
         if (callback_func){
            callback_funcs.push(callback_func);
         }
      }
   }


   var promises = promise.test(parsed);
   promises = promise.reduce(promises) || [];

   function test_callback(node){
      return callback.test(node, callback_funcs);
   }
   var callbacks = walker.walk(parsed, test_callback, syntax);
   callbacks = callback.reduce(callbacks) || [];

   function test_conditional(node){
      return conditional.test(node, exit_funcs, code);
   }
   var conditionals = walker.walk(parsed, test_conditional, syntax);
   conditionals = conditional.reduce(conditionals) || [];

   for (i = 0; i < global_exits.length; i++) {
      delete global_exits[i].type;
      delete global_exits[i].expression;
   }
   

   if (options !== undefined){
      if (options.json){   
         return {
            'global_exits': global_exits,
            'conditionals': conditionals,
            'promises': promises,
            'callbacks': callbacks,
         };
      }
   }
   return generate_output_string(conditionals, global_exits, promises, callbacks);
}

function read_file(filename, options){
   /*
      Tests file for exit calls.

      @param filename: a path to a file (rel from execution folder or abs)
      @param options: an optional parameter used to format output
         options.json sets whether to return a JSON object, defaults to false.

      @return: depending on options.json either:
         if options.json is truthy, an object with the following properties:
            `exits`: an array of nodes that exit successfully
            `non_exits`: an array of nodes related to `exits` that do not exit
            `global_exits`: an array of program-scope exits
            `promises`: an array of exiting/non exiting promise fcn calls
         if options.json is falsy/options undefined, a string which explains 
            problems with relevant line numbers
   */
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
};

if (process.argv.length > 2){
   var args = process.argv;
   if (args[0] === 'node' && !(/mocha$/.exec(args[1]))){
      // loop through actual args when not testing
      for (var i = 2; i < args.length; i++) {
         console.log(read_file(args[i]));
         if (i < args.length - 1){
            console.log("------------");
         }
      }
   }
}