'use strict';
var utils = require('./utils.js');
var vars_equiv = utils.variables_equivalent;
var consts = require('./consts.js');

function is_error(call){
  /*
    Determines whether `call` represents an `.on('error', [cb])` call.

    @param call: an esprima node for a fcn call

    @return: a boolean of whether `call` represents an on error call
  */
  if (vars_equiv(call.property, consts.cb_on)){
    if (call.arguments[0].value && call.arguments[0].value === consts.cb_error){
      return true;
    }
  }
  return false;
}

function is_success(call){
  /*
    Determines whether `call` represents an `.on('success', [cb])` call.

    @param call: an esprima node for a fcn call

    @return: a boolean of whether `call` represents an on error call.
  */
  if (vars_equiv(call.property, consts.cb_on)){
    if (call.arguments[0].value && call.arguments[0].value === consts.cb_success){
      return true;
    }
  }
  return false;
}

function test_expression(node, exits){
  /*
    Tests a function call for exits.

    @param node: an esprima node for a fcn call with callbacks
    @param exits: an optional array of functions not named 'exit' which exit

    @return: an object with the following properties:
      `success_found`: a boolean of whether an on success call was found
      `success_exits`: a boolean of whether the on success call exits
      `error_found`: a boolean of whether an on error call was found
      `error_exits`: a boolean of whether the on error call exits
      `error_node`: an esprima node representing the error handling
        will be undefined if no error handling found
  */
  if (!(Array.isArray(exits))){
    exits = [];
  }
  var funcs = utils.get_all_functions(node.expression);
  var success_found = false;
  var success_exits = false;
  var error_found = false;
  var error_exits = false;
  var error_node;

  for (var i = funcs.length - 1; i > 0; i--) {
    var arg = funcs[i].arguments[1];
    if (is_error(funcs[i])){
      error_found = true;
      error_node = arg;
      if (utils.is_exit(arg, exits) || utils.has_exit(arg, exits)){
        error_exits = true;
      }
    }
    if (is_success(funcs[i])){
      success_found = true;
      if (utils.is_exit(arg, exits) || utils.has_exit(arg, exits)){
        success_exits = true;
      }
    }
  }

  return {
    'success_found': success_found,
    'success_exits': success_exits,
    'error_found': error_found,
    'error_exits': error_exits,
    'error_node': error_node,
  };
}

function check(arg, params){
  /*
    Gets the index for success_call_index and error_call_index when given 
    the correct parameter.

    @param arg: an esprima node for the body of a callback function (as 
      defined in the second argument of an on success/error call)
    @param params: the params as supplied in function declaration

    @return: a number representing the index of the call's callback param
  */
  if (utils.is_exit(arg) || utils.has_exit(arg)){
    return -1;
  }
  for (var i = 0; i < params.length; i++) {
    var name = params[i].name;
    if (utils.is_exit(arg, [name]) || utils.has_exit(arg, [name])){
      return params[i].index;
    }
  }
}

function param(body, params){
  /*
    Gets information about what is passed to the error callback function in 
    the event of an error

    @param body: the body of a callback
    @param params: the list of parameters supplied to the callback-invoking 
      function

    @return: an object with the following properties:
      `index`: a number used to identify which parameter contains error 
        data in the call to the callback
      `args_passed`: an array of those args passed to the callback function
  */
  var index = -1;
  var args_passed;
  for (var i = 0; i < body.length; i++) {
    if (body[i].type === consts.expr){
      if (body[i].expression.type === consts.call){
        for (var j = 0; j < params.length; j++) {
          if (vars_equiv(params[j], body[i].expression.callee)){
            index = j;
            args_passed = body[i].expression.arguments;
          }
        }
      }
    }
  }
  if (index >= 0){
    return {
      'index': index,
      'args_passed': args_passed,
    };
  }
}

function test_declaration(node){
  /*
    Determines whether a function uses callbacks and how and when those 
    callbacks exit.

    @param node: an esprima node for a FunctionDeclaration

    @return: if a callback was recognized, an object with these properties:
      `success_found`: a boolean of whether there was an on success call
      `success_exits`: a boolean of whether the on success call exits
      `success_call_index`: a number used to identify which parameter is the 
        callback function for success calls
      `error_found`: a boolean of whether there was an on error call
      `error_exits`: a boolean of whether the on error call exits
      `error_call_index`: a number used to identify which parameter is the 
        callback function for error calls
      `error_param`: an object with the following properties:
        `index`: a number used to identify which parameter contains error 
          data in the call to the callback in the parent function
        `args_passed`: an array of those args passed to the callback function
      `node`: an esprima node for the original function declaration
  */
  var params = [];

  for (var i = node.params.length - 1; i >= 0; i--) {
    if (node.params[i].type === consts.identifier){
      params.push({
        'name': node.params[i].name,
        'index': i,
      });
    }
  }

  var success_found = false;
  var success_call_index;
  var error_found = false;
  var error_call_index;
  var error_param;

  for (i = 0; i < node.body.body.length; i++) {
    var child = node.body.body[i];
    if (child.type === consts.expr){
      var funcs = utils.get_all_functions(child.expression);
      for (var j = 1; j < funcs.length; j++) {
        var arg = funcs[j].arguments[1];
        if (is_error(funcs[j])){
          error_found = true;
          error_call_index = check(arg, params);
          error_param = param(funcs[j].arguments[1].body.body, node.params);
        }

        if (is_success(funcs[j])){
          success_found = true;
          success_call_index = check(arg, params);
        }
      }
    }
  }

  if (success_found || error_found){
    return {
      'success_found': success_found,
      'success_exits': success_call_index === -1,
      'success_call_index': success_call_index,
      'error_found': error_found,
      'error_exits': error_call_index === -1,
      'error_call_index': error_call_index,
      'error_param': error_param,
      'node': node,
    };
  }
}

function something_exited(tested){
  /*
    Tests whether anything exited.

    @param tested: an object identifying when a callback exits

    @returns: a boolean for whether there are exits on success OR error
  */
  if (tested){
    if (tested.success_found && tested.success_exits){
      return true;
    }
    if (tested.error_found && tested.error_exits){
      return true;
    }
  }
  return false;
}

function get_callback_func(node, callback_fcns){
  /*
    Given a node that calls a function, gets the original function definition 
    if it is a callback.

    @param node: an esprima node that is a function call
    @param callback_fcns: an array of esprima nodes representing function 
      declarations for functions that use callbacks

    @return: an esprima node of a callback-utilizing function defintion
  */
  var original_call = utils.get_first_function(node.expression);
  if (original_call){
    for (var i = 0; i < callback_fcns.length; i++) {
      if (original_call.name === callback_fcns[i].node.id.name){
        return callback_fcns[i];
      }
    }
  }
}

function get_err_index_from_args(args){
  /*
    Gets the location of the error argument by looking for `err` in a variable 
    name.

    @param args: a list of arguments

    @return: a number for the location of the error argument
  */
  if (args.length === 1){
    return 0;
  }
  for (var i = 0; i < args.length; i++) {
    if (args[i].type === consts.identifier && /err/.exec(args[i].name)){
      return i;
    }
  }
}

function test_callback_call(call, callback, callback_fcns, exits){
  /*
    Tests a call to a callback-using function for exits.

    @param call: an esprima node for a function call
    @param callback: an object parsed from `test_declaration` with 
      information about a callback-using function declaration and its exit 
      cases
    @param callback_fcns: an array of esprima nodes for callback function 
      declarations
    @param exits: a list of names of functions which always exit, used to 
      improve exit checking 

    @return: an object with the following properties:
      `success_found`: a boolean of whether there was an success callback 
        call
      `success_exits`: a boolean of whether the success code exits
      `error_found`: a boolean of whether there was an on error callback 
        call
      `error_exits`: a boolean of whether the error-handling code exits
      `error_node`: an esprima node representing the error-handling, so it 
        can be located later 
  */
  if (!(Array.isArray(callback_fcns))){
    callback_fcns = [];
  }

  var error_found = callback.error_found;
  var error_exits = callback.error_exits;
  var success_found = callback.success_found;
  var success_exits = callback.success_exits;
  var error_node;

  if (error_found && !error_exits){
    if (callback.error_call_index >= 0){
      var err = call.expression.arguments[callback.error_call_index];
      if (err && err.type === consts.func_expr){
        if (utils.has_exit(err.body, exits)){
          error_exits = true;
        } else if (callback.error_param){
          var index = get_err_index_from_args(callback.error_param.args_passed);
          var arg = call.expression.arguments[callback.error_param.index];
          var param = arg.params[index];
          if (arg.body.type === consts.block){
            for (var i = 0; i < arg.body.body.length; i++) {
              var ifs = utils.test_if(arg.body.body[i], param, exits);
              if (ifs.err_caught){
                error_node = arg.body.body[i];
                if (ifs.err_exits){
                  error_exits = true;
                }
              }
            }
          }
        }
      }
    }
  }

  if (success_found && !(success_exits)){
    if (callback.success_call_index >= 0){
      var success = call.expression.arguments[callback.success_call_index];
      if (success && success.type === consts.func_expr){
        if (utils.has_exit(success.body, exits)){
          success_exits = true;
        } else {
          for (var j = 0; j < success.body.body.length; j++) {
            var callbacks = test_callbacks(success.body.body[j], callback_fcns, exits);
            if (callbacks && callbacks.success_exits){
              success_exits = true;
            }
          }
        }
      }
    }
  }

  return {
    'success_found': success_found,
    'success_exits': success_exits,
    'error_found': error_found,
    'error_exits': error_exits,
    'error_node': error_node,
  };
}

function test_callbacks(node, callback_fcns, exits){
  /*
    Determines whether a node is a callback and if so when it exits.

    @param node: an esprima node
    @param callback_fcns: an array of objects with crucial information about 
      callback-using functions (multiple results of `test_declaration`)
    @param exits: an array of those functions which always call exit

    @return: if `node` represented a call to a callback-using function, an 
    object with the following properties:
      `success_found`: whether the callback included an on success call
      `success_exits`: whether the successful call exits
      `error_found`: whether the callback included an on error call
      `error_exits`: whether the error handling code exits
      `node`: the original node that was tested
  */
  var res;
  if (node.type === consts.expr && node.expression.type != consts.literal){
    // literals are expressions, but they're not what we're looking for
    res = test_expression(node, exits);
    if (!(something_exited(res))){
      var callback = get_callback_func(node, callback_fcns);
      if (callback){
        res = test_callback_call(node, callback, callback_fcns, exits);
      }
    }
  }

  if (res){
    res.node = node;
  }

  return res;
}

function reduce(all_results){
  /*
    Reformats the result of test_callbacks into JSON that is more useful by 
    stripping out those callbacks that never exit (and thus shouldn't 
    generate warnings).

    @param all_results: an array of objects resulting from test_callbacks 
      calls

    @return: an object with the following properties:
      `need_exits`: an array of objects with line number and error message 
      `always_exits`: a boolean of whether the callback code always exits
      `never_exits`: a boolean of whether the callback code never exits
  */
  var sometimes_exit = [];
  var fully_exit = [];
  var never_exits = true;

  for (var i = 0; i < all_results.length; i++){
    if (something_exited(all_results[i])){
      never_exits = false;
      if (both_exited(all_results[i])){
        fully_exit.push(all_results[i]);
      } else {
        sometimes_exit.push(all_results[i]);
      }
    } // we ignore ones that never exit
  }

  var always_exits = !!!sometimes_exit.length && !!fully_exit.length;
  var need_exits = [];

  for (var j = 0; j < sometimes_exit.length; j++){
    if (sometimes_exit[j].success_found && !sometimes_exit[j].success_exits){
      // does not exits on success
      need_exits.push({
        'line': sometimes_exit[j].node.loc.start.line,
        'message': "Code doesn't exit if this callback is successful, but it does if there's an error.",
      });
    }

    if (sometimes_exit[j].error_found && !sometimes_exit[j].error_exits){
      // does not exit on error, but dedicated error handling
      // it's gonna be some sort of if(err) statement since that's all I grab
      need_exits.push({
        'line': sometimes_exit[j].error_node.loc.start.line,
        'message': "Code doesn't exit in this error handling, but it does if there's no error.",
      });
    }
  }

  return {
    'need_exits': need_exits,
    'always_exits': always_exits,
    'never_exits': never_exits,
  };
}

function both_exited(tested){
  /*
    Checks whether a callback exited both on success and error.

    @param tested: a parsed callback

    @return: a boolean of whether tested represents code that exited both on 
      success and error
  */
  if (tested){
    if (tested.success_found && tested.success_exits){
      if (tested.error_found && tested.error_exits){
        return true;
      }
    }
  }
  return false;
}

module.exports = {
  'test': test_callbacks,
  'test_declaration': test_declaration,
  'reduce': reduce,
};
