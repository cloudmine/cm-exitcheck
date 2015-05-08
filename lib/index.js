#! /usr/bin/env node
'use strict';
var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');
var walker = require('./walker.js');
var promise = require('./promise.js');
var callback = require('./callback.js');

function extract(tree){
   /*
      Extracts exits/non exits from branch-specific organization into one array for each type.

      @param tree: an array of objects each with an 'exits' and 'non_exits' 
         property (i.e. the result of multiple walker.walk calls)

      @return: an object with a single 'exits' and 'non_exits' property
   */
   var exits = [];
   var non_exits = [];

   for (var i = 0; i < tree.length; i++) {
      for (var j = 0; j < tree[i].exits.length; j++) {
         exits.push({
            'condition': tree[i].exits[j].condition,
            'loc': tree[i].exits[j].loc,
         });
      }
      for (j = 0; j < tree[i].non_exits.length; j++) {
         non_exits.push({
            'condition': tree[i].non_exits[j].condition,
            'loc': tree[i].non_exits[j].loc,
         });
      }
   }

   return {
      'exits': exits,
      'non_exits': non_exits,
   };
}

function promise_string(promises){
   /*
      Turns parsed promises into a readable string.

      @param promises: an array of fcn calls that return promises, which have 
         been parsed to identify when they exit

      @return: a string listing exits or lack of exits and where they occur
   */

   var str = "";
   for (var i = 0; i < promises.length; i++) {
      var p = promises[i];

      if (p.last_caught_exit_index || p.last_run_exit_index){
         if (str !== ""){
            str += "\n\nFor promised function `" + p.all_funcs[0].name + "` ";
         } else{
            str += "For promised function `" + p.all_funcs[0].name + "` ";
         }
         var start = p.promise.loc.start.line;
         var end = p.promise.loc.end.line;
         str += "(call lines " + start + "-" + end + ")";
         var last_catch, catch_start, catch_end;
         if (p.last_caught_exit_index){
            if (p.last_caught_exit_index < p.last_caught_index){
               str += "\n  - Some caught exceptions do not exit.";
               str += "\n    Adding an exit call to ";
               last_catch = p.all_funcs[p.last_caught_index];
               catch_start = last_catch.arguments[0].loc.start.line;
               catch_end = last_catch.arguments[0].loc.end.line;
               if (last_catch.type !== 'catch'){
                  str += "second parameter of ";
                  catch_start = last_catch.arguments[1].loc.start.line;
                  catch_end = last_catch.arguments[1].loc.end.line;
               }
               str += "`" + last_catch.type + "` call ";
               str += "(lines " + catch_start + "-" + catch_end + ") ";
               str += "will prevent hanging.";
            } else{
               str += "\n  - All caught exceptions exit";
            }
         } else{
            if (p.last_caught_index){
               str += "\n  - No caught exceptions exit.";
               str += "\n    Adding an exit call to ";
               last_catch = p.all_funcs[p.last_caught_index];
               catch_start = last_catch.arguments[0].loc.start.line;
               catch_end = last_catch.arguments[0].loc.end.line;
               if (last_catch.type !== 'catch'){
                  str += "second parameter of ";
                  catch_start = last_catch.arguments[1].loc.start.line;
                  catch_end = last_catch.arguments[1].loc.end.line;
               }
               str += "`" + last_catch.type + "` call ";
               str += "(lines " + catch_start + "-" + catch_end + ") ";
               str += "will prevent hanging.";
            }
         }

         if (p.last_run_exit_index){
            if (p.last_run_exit_index < p.last_run_index){
               str += "\n  - Some successful runs do not exit.";
               str += "\n    Adding an exit call to ";
               var last_run = p.all_funcs[p.last_run_index];
               var run_start = last_run.arguments[0].loc.start.line;
               var run_end = last_run.arguments[0].loc.end.line;
               str += "`" + last_run.type + "` call ";
               str += "(lines " + run_start + "-" + run_end + ") ";
               str += "will prevent hanging.";
            } else{
               str += "\n  - All successful runs exit.";
            }
         } else{
            str += "\n  - No successful runs exit.";
         } 
      }

   }
   return str;
}

function ith(i){
   /*
      Turns regular number into ordinal

      @param i: any number > 0 (since % w/negatives is weird in js)

      @return: a string of the corresponding ordinal for the number
   */
   switch(i){
      case 11:
      case 12:
      case 13:
         return i + "th";
      default:
         switch (i % 10){
            case 1:
               return i + "st";
            case 2:
               return i + "nd";
            case 3:
               return i + "rd";
            default:
               return i + "th";
         }
   }
}

function callback_string(callbacks){
   /*
      Turns parsed callbacks into a readable string.

      @param callbacks: an array of functions with their callbacks, which have 
         been parsed to identify when they exit      

      @return: a string listing exits or lack of exits and where they occur
   */

   var str = "";
   for (var i = 0; i < callbacks.length; i++) {
      str += "For callback chain beginning on line ";
      str += callbacks[i][0].loc.start.line + ":";
      var callback;
      for (var j = 0; j < callbacks[i].length; j++) {
         callback = callbacks[i][j];
         if (callback.err_exits === false){
            str += "\n  - Errors caught by " + ith(i + 1) + " callback ";
            str += "(lines " + callback.err.loc.start.line + "-" + callback.err.loc.end.line + ")";
            str += " do not exit.";   
         }
      }

      var last_exit_index = -1;
      for (j = callbacks[i].length - 1; j >= 0; j--) {
         callback = callbacks[i][j];
         if (callback.exits){
            last_exit_index = j;
            break;
         }
      }

      if (last_exit_index >= 0){
         str += "\n  - Successful callbacks exit";
      } else{
         // nothing exits, it's not relevant
         str = "";
      }
   }

   return str;
}

function generate_output_string(exits, non_exits, global_exits, promises, callbacks){
   /*
      Generates final program output as a readable string.

      @param exits: an array of esprima nodes which exit
      @param non_exits: an array of esprima nodes related to previous nodes which 
         do not exit
      @param global_exits: an array of esprima nodes of program scope which exit
      @param promises: an array of fcn calls that return promises, which have 
         been parsed to identify when they exit
      @param callbacks: an array of functions with their callbacks, which have 
         been parsed to identify when they exit

      @return: a string explaining problems or lack thereof.
         - strings which begin 'Hooray!' always exit
         - strings which begin 'For promised function' deal with promises
         - strings which begin 'For callback chain' deal with callbacks
         - strings which begin with none of the above never exit
   */
   if (promises.length){
      return promise_string(promises);
   } else if (callbacks.length){
      return callback_string(callbacks);
   } else{
      if (global_exits.length){
         return "Hooray! Your code contains a global exit.";
      } else{
         if (non_exits.length){
            var str = "Your code does not contain an exit under the following conditions:\n\n";
            for (var i = 0; i < non_exits.length; i++) {
               if (i !== 0){
                  str += "\n";
               }
               str += "  - " + non_exits[i].condition;
               var start = non_exits[i].loc.start.line;
               var end = non_exits[i].loc.end.line;
               str += "\n    lines " + start + "-" + end;
            }
            return str;
         } else{
            if (exits.length){
               return "Hooray! Your code will always exit.";
            } else{
               return "Your code never exits. Adding an `exit()` call to the end of your code will prevent the process from hanging.";
            }
         }
      }
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
   var tree;
   var global_exits = [];
   var syntax = walker.syntax();

   var added = utils.check_functions(parsed);
   var exit_funcs = added;
   var callbacks = [];

   var exits = [];
   var non_exits = [];

   function filter_out(element){
      return exit_funcs.indexOf(element) < 0;
   }

   while (added.length){
      added = utils.check_functions(parsed, exit_funcs);
      added = added.filter(filter_out);
      exit_funcs = exit_funcs.concat(added);
   }

   for (var i = 0; i < parsed.body.length; i++){
      if (utils.is_exit(parsed.body[i], exit_funcs)){
         global_exits.push(parsed.body[i]);
      }


      var tested = callback.test(parsed.body[i], exit_funcs.concat(['exit']));
      if (tested.length){
         callbacks.push(tested);
      }
   }

   var promises = promise.test(parsed);

   if (!(global_exits.length)){
      tree = walker.walk(parsed, code, syntax, exit_funcs);
      var extracted = extract(tree);
      exits = extracted.exits;
      non_exits = extracted.non_exits;

      for (i = 0; i < exits.length; i++) {
         for (var j = 0; j < exits.length; j++) {
            if (i !== j){
               if (exits[j].condition.indexOf(exits[i].condition) === 0){
                  exits.splice(j, 1);
               }
            }
         }
         for (j = 0; j < non_exits.length; j++){
            if (non_exits[j].condition.indexOf(exits[i].condition) === 0){
               non_exits.splice(j, 1);
            }
         }
      }

      for (i = 0; i < global_exits.length; i++) {
         delete global_exits[i].type;
         delete global_exits[i].expression;
      }
   }

   if (options !== undefined){
      if (options.json){   
         return {
            'exits': exits,
            'non_exits': non_exits,
            'global_exits': global_exits,
            'promises': promises,
            'callbacks': callbacks,
         };
      }
   }
   return generate_output_string(exits, non_exits, global_exits, promises, callbacks);
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
   if (args[0] === 'node'){
      // loop through actual args
      for (var i = 2; i < args.length; i++) {
         console.log(read_file(args[i]));
         if (i < args.length - 1){
            console.log("------------");
         }
      }
   }
}