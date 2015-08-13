'use strict';
var utils = require('./utils.js');
var consts = require('./consts.js');

function get_qs(node){
  /*
    Get all variables representing the `q` library.

    @param node: any esprima node with a `body` property

    @return: the names of the variables representing the `q` library
  */
  var vars = [];
  for (var i = 0; i < node.body.length; i++) {
    var block = node.body[i];
    if (block.type === consts.var_dec){
      for (var j = 0; j < block.declarations.length; j++) {
        var dec = block.declarations[j];
        if (dec.init && dec.init.type === consts.call){
          var callee = block.declarations[j].init.callee;
          if (callee.type === consts.identifier && callee.name === 'require'){
            var first_arg = block.declarations[j].init.arguments[0];
            if (first_arg.type === consts.literal && first_arg.value === 'q'){
              vars.push(block.declarations[j].id);
            }
          }
        }
      }
    }
  }

  return vars;
}

function is_defer(q_vars, callee){
  /*
    Checks whether a call represents q.defer

    @param q_vars: an array of variables for the `q` library
    @param callee: an esprima node for a function call

    @return: a bool of whether `callee` represents q.defer
  */
  var defer_var = {
    'type': consts.identifier,
    'name': 'defer',
  };
  
  for (var i = 0; i < q_vars.length; i++) {
    if (utils.variables_equivalent(q_vars[i], callee.object)){
      if (utils.variables_equivalent(callee.property, defer_var)){
        return true;
      }
    }
  }

  return false;
}

function is_promise(defer_var, argument){
  /*
    Checks whether a return value is a promise

    @param defer_var: an esprima node representing a q.defer call
    @param argument: an esprima node for the argument of a return function

    @return: a bool of whether `argument` is a promise
  */
  var promise_var = {
    'type': consts.identifier,
    'name': 'promise',
  };

  if (utils.variables_equivalent(argument.object, defer_var)){
    if (utils.variables_equivalent(argument.property, promise_var)){
      return true;
    }
  }

  return false;
}

function returns_promise(node, q_vars){
  /*
    Checks whether a function returns a promise

    @param node: an esprima node for a function call's body
    @param q_vars: an array of variables for the `q` library

    @return: a boolean of whether `node` is a function returning a promise
  */
  var defer;

  for (var i = 0; i < node.body.length; i++) {
    if (node.body[i].type === consts.var_dec){
      for (var j = 0; j < node.body[i].declarations.length; j++) {
        var callee = node.body[i].declarations[j].init.callee;
        if (is_defer(q_vars, callee)){
          defer = node.body[i].declarations[j].id;
        }
      }
    }

    if (defer && node.body[i].type === consts.return){
      if (is_promise(defer, node.body[i].argument)){
        return true;
      }
    }
  }

  return false;
}

function check_function_decs(node, q_vars){
  /*
    Checks all functions in a program for those which return promises

    @param node: an esprima node representing an entire program (or other 
      block with function delarations)
    @param q_vars: an array of those variables which (at program level) 
      represent the `q` library
  */
  var funcs = [];

  for (var i = 0; i < node.body.length; i++) {
    var block = node.body[i];
    if (block.type === consts.func_dec){
      // but wait! we might require('q') inside the function!
      var local_qs = q_vars.concat(get_qs(block.body));
      if (returns_promise(block.body, local_qs)){
        funcs.push(block.id);
      }
    }
  }

  return funcs;
}

function is_then(node){
  /*
    Checks whether a node represents a "promise.then" call.

    @param node: any esprima node

    @return: a boolean of whether `node` is a "promise.then" call
  */
  var then = {
    'type': consts.identifier,
    'name': 'then',
  };
  var spread = {
    'type': consts.identifier,
    'name': 'spread'
  };

  return (utils.variables_equivalent(then, node) || utils.variables_equivalent(spread, node));
}

function is_catch(node){
  /*
    Checks whether a node represents a "promise.catch" call.

    @param node: any esprima node

    @return: a boolean of whether `node` is a "promise.catch" call
  */
  var catch_var = {
    'type': consts.identifier,
    'name': 'catch',
  };
  var fail = {
    'type': consts.identifier,
    'name': 'fail',
  };

  return (utils.variables_equivalent(catch_var, node) || utils.variables_equivalent(fail, node));
}

function is_finally(node){
  /*
    Checks whether a node represents a "promise.finally" call.

    @param node: any esprima node

    @return: a boolean of whether `node` is a "promise.finally" call
  */
  var finally_var = {
    'type': consts.identifier,
    'name': 'finally',
  };
  var fin = {
    'type': consts.identifier,
    'name': 'fin',
  };

  return (utils.variables_equivalent(finally_var, node) || utils.variables_equivalent(fin, node));
}

function is_done(node){
  /*
    Checks whether a node represents a "promise.done" call.

    @param node: any esprima node

    @return: a boolean of whether `node` is a "promise.done" call
  */
  var done = {
    'type': consts.identifier,
    'name': 'done'
  };
  return (utils.variables_equivalent(done, node));
}

function is_promise_method(node){
  /*
    Checks whether node represents any kind of promise method.

    @param node: any esprima node

    @return: a boolean of whether `node` represents any kind of promise method
  */
  return is_then(node) || is_catch(node) || is_finally(node) || is_done(node);
}

function parse_done(args, test, exits){
  /*
    Tests "promise.done" function calls for when they exit.

    @param args: an array of arguments for the "done" call
    @param test: an object representing what conditions to test

    @return: an object with the following properties:
      `test`: the potentially modified version of `test`
      `run_exits`: a boolean of whether the code to run exits
      `catch_exits`: a boolean of whether the error-handling code exits
        will be undefined if there is no error-handling function
  */
  var run_exits;
  var catch_exits;
  if (test.done){
    for (var i = 0; i < args.length; i++) {
      switch(i){
        case 0:
          // the "run" code
          if (test.then){
            if (utils.has_exit(args[i], exits)){
              test.then = false;
              test.fin = false;
              run_exits = true;
            } else{
              run_exits = false;
            }
          }
          break;
        case 1:
          // error handling
          if (test.catch){
            if (utils.has_exit(args[i], exits)){
              test.catch = false;
              catch_exits = true;
            } else{
              catch_exits = false;
            }
          }
          break;
      }
    }
    test.done = false;
  }

  return {
    'test':test,
    'run_exits': run_exits,
    'catch_exits': catch_exits,
  };
}

function parse_catch(args, test, exits){
  /*
    Tests "promise.catch" function calls for when they exit.

    @param args: an array of arguments for the "catch" call
    @param test: an object representing what conditions to test

    @return: an object with the following properties:
      `test`: the potentially modified version of `test`
      `catch_exits`: a boolean of whether the error-handling code exits
  */
  var code_exits = false;
  if (test.catch){
    if (utils.has_exit(args[0], exits)){
      test.catch = false;
      code_exits = true;
    }
  }

  return {
    'test': test,
    'catch_exits': code_exits,
  };
}

function parse_fin(args, test, exits){
  /*
    Tests "promise.finally" function calls for when they exit.

    @param args: an array of arguments for the "finally" call
    @param test: an object representing what conditions to test

    @return: an object with the following properties:
      `test`: the potentially modified version of `test`
      `run_exits`: a boolean of whether the code to run exits
      `catch_exits`: a boolean of whether the error-handling code exits
        will be undefined if there is no error-handling function
  */
  var run_exits;
  var catch_exits;
  if (test.fin){
    for (var i = 0; i < args.length; i++) {
      switch(i){
        case 0:
          // the "run" code
          if (test.then){
            if (utils.has_exit(args[i], exits)){
              test.then = false;
              test.fin = false;
              run_exits = true;
            } else{
              run_exits = false;
            }
          }
          break;
        case 1:
          // error handling
          if (test.catch){
            if (utils.has_exit(args[i], exits)){
              test.catch = false;
              catch_exits = true;
            } else{
              catch_exits = false;
            }
          }
          break;
      }
    }
  }
  
  return {
    'test':test,
    'run_exits': run_exits,
    'catch_exits': catch_exits,
  };
}

function parse_then(args, test, exits){
  /*
    Tests "promise.then" function calls for when they exit.

    @param args: an array of arguments for the "then" call
    @param test: an object representing what conditions to test

    @return: an object with the following properties:
      `test`: the potentially modified version of `test`
      `run_exits`: a boolean of whether the code to run exits
      `catch_exits`: a boolean of whether the error-handling code exits
        will be undefined if there is no error-handling function
  */
  var run_exits;
  var catch_exits;  
  for (var i = 0; i < args.length; i++) {
    switch(i){
      case 0:
        if (test.then){
          if (utils.has_exit(args[i], exits)){
            test.then = false;
            test.fin = false;
            run_exits = true;
          } else{
            run_exits = false;
          }
        }
        break;
      case 1:
        if (test.catch){
          if (utils.has_exit(args[i])){
            test.catch = false;
            catch_exits = true;
          } else{
            catch_exits = false;
          }
        }
        break;
    }
  } 
  
  return {
    'test': test,
    'run_exits': run_exits,
    'catch_exits': catch_exits,
  };
}

function parse_promise_methods(promise, exits){
  /*
    Determines whether promise methods successfully exit.

    @param promise: an esprima node representing a promise function

    @return: an object with the following properties:
      `all_funcs`: an array of function calls from utils.get_all_functions
      `last_caught_index`: the highest index (of `all_funcs`) at which 
        errors are caught (0 if none caught)
      `last_caught_exit_index`: the highest index (of `all_funcs`) at which 
        errors are caught and exited (0 if none exit)
      `last_run_index`: the highest index (of `all_funcs`) where code is run
      `last_run_exit_index`: the highest index (of `all_funcs`) where code 
        that exits is run
  */
  var test = {
    'then': true,
    'catch': true,
    'fin': true,
    'done': true
  };

  var all_funcs = utils.get_all_functions(promise.expression);

  function parse(promise){
    /*
      Parses all kinds of promises and updates `test` as appropriate.

      @param promise: an esprima node representing a function call

      @return: if `promise` was actually a promise function, an object with the following properties:
        `catch_exits`: whether the error-handling function of `promise` 
          exits
        `run_exits`: whether the code run for `promise` exits
        `type`: a string of the type of promise call
    */
    var result;
    var type;
    if (is_done(promise.property)){
      result = parse_done(promise.arguments, test, exits);
      type = 'done';
    } else if (is_catch(promise.property)){
      result =  parse_catch(promise.arguments, test, exits);
      type = 'catch';
    } else if (is_finally(promise.property)){
      result =  parse_fin(promise.arguments, test, exits);
      type = 'finally';
    } else if (is_then(promise.property)){
      result = parse_then(promise.arguments, test, exits);
      type = 'then';
    }

    if (result){
      test = result.test;
      return {
        'catch_exits': result.catch_exits,
        'run_exits': result.run_exits,
        'type': type,
      };
    }
  }

  var last_caught_exit_index = 0;
  var last_run_exit_index = 0;
  
  for (var i = all_funcs.length - 1; i >= 0; i--){
    var parsed = parse(all_funcs[i]);
    if (parsed){
      if (parsed.catch_exits){
        last_caught_exit_index = i;
      }
      if (parsed.run_exits){
        last_run_exit_index = i;
      }
    } else{
      break;
    }
    all_funcs[i].type = parsed.type;
  }

  var last_caught_index = 0;
  var last_run_index = 0;

  for (var j = 1; j < all_funcs.length; j++) {
    // start at 2nd element since 1st is original fcn call
    var property = all_funcs[j].property;
    if (is_promise_method(property)){
      if (is_catch(property)){
        last_caught_index = j;
      } else{
        if (all_funcs[j].arguments.length > 1){
          // there's an error handling fcn involved
          last_caught_index = j;
        }
        last_run_index = j;
      }
    } else{
      break;
    }
  }

  return {
    'all_funcs': all_funcs,
    'last_caught_index': last_caught_index,
    'last_caught_exit_index': last_caught_exit_index,
    'last_run_index': last_run_index,
    'last_run_exit_index': last_run_exit_index,
  };
}

function check_function_calls(program, promise_funcs, exits){
  /*
    Gets all function calls in a program which return promises.

    @param program: an esprima node representing an entire program
    @param promise_funcs: an array of names of functions determined to return 
      promises

    @return: an array of objects with the following properties
      `all_funcs`: an array of function calls from utils.get_all_functions
      `last_caught_index`: the highest index (of `all_funcs`) at which 
        errors are caught (0 if none caught)
      `last_caught_exit_index`: the highest index (of `all_funcs`) at which 
        errors are caught and exited (0 if none exit)
      `last_run_index`: the highest index (of `all_funcs`) where code is run
      `last_run_exit_index`: the highest index (of `all_funcs`) where code 
        that exits is run
      `promise`: an esprima node for the call
  */
  var promises = [];
  for (var i = 0; i < program.body.length; i++) {
    if (program.body[i].type === consts.expr){
      if (program.body[i].expression.type === consts.call){
        var callee = program.body[i].expression.callee;
        var first_func = utils.get_first_function(callee);
        var promise = false;
        for (var j = 0; j < promise_funcs.length; j++) {
          if (utils.variables_equivalent(promise_funcs[j], first_func)){
            promise = true;
            break;
          }
        }
        if (promise){
          var to_push = parse_promise_methods(program.body[i], exits);
          to_push.promise = program.body[i];
          promises.push(to_push);
        }
      }
    }
  }
  return promises;
}

function test_promises(parsed_code, exits){
  /*
    Fully tests code for promises that exit.

    @param parsed_code: an esprima node for an entire program

    @returns: an array of objects with multiple properties to identify when 
      and whether promises exit
  */
  var q_vars = get_qs(parsed_code);
  var funcs = check_function_decs(parsed_code, q_vars);
  var calls = check_function_calls(parsed_code, funcs, exits);

  return calls;
}

function reduce(all_results){
  /*
    Removes the extraneous information produced by `test_promises` and returns a list of objects with organized information.

    @param all_results: a list of objects returned from `test_promises`

    @return: a list of objects with the following properties:
      `call`: an object with two properties:
        `name`: the name of the original function called
        `loc`: the location of the original call (straight from esprima)
      `run_exits`: a boolean for whether any non-erroring code exits
      `last_run_exits`: a boolean for whether the last block of non-erroring 
        code in a chain of promises exits
      `last_run`: the esprima node for the last run block
      `has_catch`: a boolean for whether there was error handling in the block
      `catch_exits`: a boolean for whether the error handling exits
      `last_caught_exits`: a boolean for whether the last bit of error 
        handling exits
      `last_catch`: the esprima node for the last error handling block
  */
  var results = [];
  var full_exit_count = 0;
  var never_exits = true;
  for (var i = 0; i < all_results.length; i++) {
    var promise = all_results[i];

    var call = {
      'name': promise.all_funcs[0].name,
      'loc': promise.promise.loc,
    };

    // turn assorted indecies into more useful booleans
    var run_exits = !!promise.last_run_exit_index;
    var last_run_exits = (promise.last_run_index === promise.last_run_exit_index);
    var last_run = promise.all_funcs[promise.last_run_index];

    var has_catch = !!promise.last_caught_index;
    var catch_exits = !!promise.last_caught_exit_index;
    var last_catch_exits = (promise.last_caught_exit_index === promise.last_caught_index);
    var last_catch;
    if (has_catch){
      last_catch = promise.all_funcs[promise.last_caught_index];
    }

    // clean up the objects in last_run.arguments without ruining esprima data
    var args = [];
    for (var j = 0; j < last_run.arguments.length; j++) {
      var run_arg = last_run.arguments[j];
      args.push({
        'range': run_arg.range,
        'loc': run_arg.loc, 
        'params': run_arg.params,
      });
    }
    last_run.arguments = args;

    if (last_catch){
      // clean up the objects in last_catch.arguments without ruining anything
      args = [];
      for (j = 0; j < last_catch.arguments.length; j++){
        var catch_arg = last_catch.arguments[j];
        args.push({
          'range': catch_arg.range,
          'loc': catch_arg.loc,
          'params': catch_arg.params,
        });
      }
      last_catch.arguments = args;
    }

    if (run_exits || catch_exits){
      never_exits = false;
    }
    if (run_exits && last_run_exits && catch_exits && last_catch_exits){
      // everything exits at the right time
      full_exit_count++;
    } else {
      // it needs an exit somewhere, so add it to the list
      results.push({
        'call': call,
        'run_exits': run_exits,
        'last_run_exits': last_run_exits,
        'last_run': last_run,
        'has_catch': has_catch,
        'catch_exits': catch_exits,
        'last_caught_exits': last_catch_exits,
        'last_catch': last_catch,
      });
    }
  }

  return {
    'need_exits': results,
    'always_exits': !!full_exit_count && full_exit_count === all_results.length,
    'never_exits': never_exits
  };
}

function output_string(result){
  /*
    Turns parsed promises into a readable string.

    @param result: an array of fcn calls that return promises, which have 
      been parsed to identify when they exit, formatted according to `reduce`

    @return: a string listing exits or lack of exits and where they occur
  */
  if (result.always_exits){
    return "Hooray! Your code always exits.";
  } else if (result.never_exits){
    return "Your code never exits. Adding an `exit()` call to the end of your code will prevent the process from hanging.";
  } else if (result.need_exits.length) {
    var str = "";
    for (var i = 0; i < result.need_exits.length; i++) {
      var promise = result.need_exits[i];
      if (promise.run_exits || (promise.has_catch && promise.catch_exits)){
        if (str){
          str += "\n\n";
        }

        var start = promise.call.loc.start.line;
        var end = promise.call.loc.end.line;
        str += "For call to function `" + promise.call.name + "` ";
        str += "(lines " + start + "-" + end + "):\n";

        if (promise.run_exits){
          if (promise.last_run_exits){
            str += "  - All successful runs exit.";
          } else{
            str += "  - Some successful runs do not exit.\n";
            str += "   Adding an exit call to `" + promise.last_run.type + "` call ";
            start = promise.last_run.arguments[0].loc.start.line;
            end = promise.last_run.arguments[0].loc.end.line;
            str += "(lines " + start + "-" + end + ") ";
            str += "will prevent hanging.";
          }
        } else {
          str += "  - No successful runs exit.\n";
          str += "   Adding an exit call to `" + promise.last_run.type + "` call ";
          start = promise.last_run.arguments[0].loc.start.line;
          end = promise.last_run.arguments[0].loc.end.line;
          str += "(lines " + start + "-" + end + ") ";
          str += "will prevent hanging.";
        }

        if (promise.has_catch){
          str += "\n";
          if (promise.catch_exits){
            if (promise.last_catch_exits){
              str += "  - All caught exceptions exit.";
            } else {
              str += "  - Some caught exceptions do not exit.\n";
              str += "   Adding an exit call to ";
              start = promise.last_catch.arguments[0].loc.start.line;
              end = promise.last_catch.arguments[0].loc.end.line;
              if (promise.last_catch.type !== 'catch'){
                // this error handling not done in a dedicated call
                str += "second parameter of ";
                start = promise.last_catch.arguments[1].loc.start.line;
                end = promise.last_catch.arguments[1].loc.end.line;
              }
              str += "`" + promise.last_catch.type + "` call";
              str += " (lines " + start + "-" + end + ") ";
              str += "will prevent hanging.";
            }
          } else {
            str += "  - No caught exceptions exit.\n";
            str += "   Adding an exit call to ";
            start = promise.last_catch.arguments[0].loc.start.line;
            end = promise.last_catch.arguments[0].loc.end.line;
            if (promise.last_catch.type !== 'catch'){
              // this error handling not done in a dedicated call
              str += "second parameter of ";
              start = promise.last_catch.arguments[1].loc.start.line;
              end = promise.last_catch.arguments[1].loc.end.line;
            }
            str += "`" + promise.last_catch.type + "` call";
            str += " (lines " + start + "-" + end + ") ";
            str += "will prevent hanging.";
          }
        }
      }
    }
    return str;
  } else {
    return "No valid callbacks found; check other results for more information.";
  }
}

module.exports = {
  'test': test_promises,
  'output': output_string,
  'reduce': reduce,
};
