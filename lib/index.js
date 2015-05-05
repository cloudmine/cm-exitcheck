'use strict';
var esprima = require('esprima');
var fs = require('fs');
var utils = require('./utils.js');
var walker = require('./walker.js');
var util = require('util');
var promiseparser = require('./promiseparser.js');

function exits_successfully(result){
   if (result.exits.then && result.exits.fail){
      return true;
   }

   if (result.exits.catch && result.exits.finally){
      return true;
   }

   return false;
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

function generate_string(exits, non_exits, global_exits, promises){
   
}

function generate_output(exits, non_exits, global_exits, promises, json){
   if (json){
      return {
         'exits': exits,
         'non_exits': non_exits,
         'global_exits': global_exits,
         'promises': promises
      }
   }

   if (promises.length){
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
            var end = p.promise.loc.end.line
            str += "(call lines " + start + "-" + end + ")";
            if (p.last_caught_exit_index){
               if (p.last_caught_exit_index < p.last_caught_index){
                  str += "\n  - Some caught exceptions do not exit.";
                  str += "\n    Adding an exit call to ";
                  var last_catch = p.all_funcs[p.last_caught_index];
                  var catch_start = last_catch.arguments[0].loc.start.line;
                  var catch_end = last_catch.arguments[0].loc.end.line;
                  if (last_catch.type !== 'catch'){
                     str += "second parameter of ";
                     catch_start = last_catch.arguments[1].loc.start.line;
                     catch_end = last_catch.arguments[1].loc.end.line;
                  }
                  str += "`" + last_catch.type + "` call ";
                  str += "(lines " + catch_start + "-" + catch_end + ") ";
                  str += "will prevent hanging."
               } else{
                  str += "\n  - All caught exceptions exit";
               }
            } else{
               if (p.last_caught_index){
                  str += "\n  - No caught exceptions exit.";
                  str += "\n    Adding an exit call to ";
                  var last_catch = p.all_funcs[p.last_caught_index];
                  var catch_start = last_catch.arguments[0].loc.start.line;
                  var catch_end = last_catch.arguments[0].loc.end.line;
                  if (last_catch.type !== 'catch'){
                     str += "second parameter of ";
                     catch_start = last_catch.arguments[1].loc.start.line;
                     catch_end = last_catch.arguments[1].loc.end.line;
                  }
                  str += "`" + last_catch.type + "` call ";
                  str += "(lines " + catch_start + "-" + catch_end + ") ";
                  str += "will prevent hanging."
               } else{
                  // str += "\n  - No exceptions caught.";
                  // str += "\n    Consider some error handling with a `catch"
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
                  str += "will prevent hanging."
               } else{
                  str += "\n  - All successful runs exit.";
               }
            } else{
               // str += "\n  - No successful runs exit.";
            } 
         }

      }
      return str;
   } else{
      if (global_exits.length){
         return "Hooray! Your code contains a global exit.";
      } else{
         if (non_exits.length){
            var str = "Your code does not contain an exit under the following conditions:\n\n";
            for (var i = 0; i < non_exits.length; i++) {
               if (i !== 0){
                  str += "\n"
               }
               str += "  - " + non_exits[i].condition;
               var start = non_exits[i].loc.start.line;
               var end = non_exits[i].loc.end.line;
               str += "\n    lines " + start + "-" + end;
            }
            return str;
         } else{
            if (exits.length){
               return "Hooray! Your code will always exit."
            } else{
               return "Your code never exits. Adding an `exit()` call to the end of your code will prevent the process from hanging."
            }
         }
      }
   }
}

function run_esprima(code, options){
   var parsed = esprima.parse(code, {
      loc: true,
      range: true,
   });
   var tree;
   var global_exits = [];
   var syntax = walker.syntax();

   var added = utils.check_functions(parsed);
   var exit_funcs = added;
   var digested = [];

   while (added.length){
      added = utils.check_functions(parsed, exit_funcs);
      added = added.filter(function(element){
         return exit_funcs.indexOf(element) < 0;
      });
      exit_funcs = exit_funcs.concat(added);
   }

   for (var i = 0; i < parsed.body.length; i++){
      if (utils.is_exit(parsed.body[i], exit_funcs)){
         global_exits.push(parsed.body[i]);
      }


      var cmd = utils.digest_command(parsed.body[i], exit_funcs.concat(['exit']));
      if (exits_successfully(cmd)){
         digested.push(cmd);
      }
   }

   var exits = [];
   var non_exits = [];
   var promises = promiseparser.test(code, parsed);

   if (!(global_exits.length)){
      tree = walker.walk(parsed, code, syntax, exit_funcs);
      var extracted = extract(tree);
      exits = extracted.exits;
      non_exits = extracted.non_exits;

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
   }

   if (options !== undefined){
      return generate_output(exits, non_exits, global_exits, promises, options.json)
   } else{
      return generate_output(exits, non_exits, global_exits, promises);
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