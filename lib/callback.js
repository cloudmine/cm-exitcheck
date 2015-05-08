'use strict';
var utils = require('./utils.js')
var vars_equiv = utils.variables_equivalent;

function get_callbacks(node){
   /*
      Extracts callbacks from a function call.

      @param node: an esprima node representing a function call

      @return: an array of all the chained callback nodes
   */
   var callbacks = [];
   if (node.type == 'ExpressionStatement'){
      return get_callbacks(node.expression);
   } else if (node.type === 'CallExpression'){
      if (node.arguments.length){
         for (var i = 0; i < node.arguments.length; i++) {
            var arg = node.arguments[i];
            if (arg.type === 'FunctionExpression'){
               if (arg.params.length === 2){
                  // params ~ (err, data)
                  callbacks.push(arg);
                  var body = arg.body.body;
                  for (var j = 0; j < body.length; j++) {
                     var child_callbacks = get_callbacks(body[j])
                     callbacks = callbacks.concat(child_callbacks);
                  }
               }
            }
         }
      }
   }
   return callbacks;
}

function test_if(if_statement, err, exits){
   /*
      Determines whether an if statement represents error handling and whether 
      it exits.

      @param if_statement: an esprima node representing an if statement
      @param err: an esprima node representing the error parameter
      @param exits: an array of names of exiting functions

      @return: an object with the following properties:
         `err_exits`: whether the node exits
         `err_caught`: whether the node represents error handling
   */
   var test = if_statement.test;
   var consequent = if_statement.consequent;

   var undef = {
      'type': 'Identifier',
      'name': 'undefined',
   }

   var err_caught = false;
   var err_exits = false;

   if (vars_equiv(err, test)){
      err_caught = true;
      // if ([err])
      err_exits = utils.exits(consequent, exits);
   } else if (test.type === 'BinaryExpression'){
      if (test.operator === '!='){
         if (vars_equiv(test.left, err) && vars_equiv(undef, test.right)){
            // if ([err] != undefined)
            err_caught = true;
            err_exits = utils.exits(consequent, exits)
         } else if (vars_equiv(test.left, undef) && vars_equiv(err, test.right)){
            // if (undefined != [err])
            err_caught = true;
            err_exits = utils.exits(consequent, exits);
         }
      } else if (test.operator === '!=='){
         if (vars_equiv(test.left, err) && vars_equiv(undef, test.right)){
            // if ([err] !== undefined)
            err_caught = true;
            err_exits = utils.exits(consequent, exits);
         } else if (vars_equiv(test.left, undef) && vars_equiv(err, test.right)){
            // if (undefined !== [err])
            err_caught = true;
            err_exits = utils.exits(consequent, exits);
         }

      }
   }

   return {
      'err_exits': err_exits,
      'err_caught': err_caught,
   }
}

function callback_exits_on_err(callback, exiting_functions){
   /*
      Determines whether a callback exits in case of error.

      @param callback: an esprima node representing a callback
      @param exiting_functions: the names of functions that fully exit

      @return: an object with the following properties
         `exits`: a bool of whether the error-handling part of the code exits
         `caught`: a bool of whether there was any error handling found
         `block`: the code block where the error is handled
   */

   // assumes error param is first since that's node standard
   var err = callback.params[0];
   var actual_body = callback.body.body;
   var err_caught = false;
   var err_exits = false;
   var err_block;

   for (var i = 0; i < actual_body.length; i++) {
      if (actual_body[i].type === 'IfStatement'){
         var tested = test_if(actual_body[i], err, exiting_functions);
         if (tested.err_exits){
            err_exits = true;
         }
         if (tested.err_caught){
            err_caught = true;
            err_block = actual_body[i];
            break;
         }
      }
   }

   return {
      'exits': err_exits,
      'caught': err_caught,
      'block': err_block,
   }
}

function test_callbacks(node, exiting_functions){
   /*
      Recursively tests callbacks for exit calls.

      @param node: an esprima node of a function call with arguments
      @param exiting_functions: the names of functions that fully exit

      @return: an array of esprima nodes with additional properites:
         `exits`: whether the callback itself exits
         `err_exits`: whether the callback exits given an error
         `err`: the block where the error handling occurs
   */
   var callbacks = get_callbacks(node);

   for (var i = 0; i < callbacks.length; i++) {
      if (utils.has_exit(callbacks[i], exiting_functions)){
         callbacks[i].exits = true;
      } else{
         callbacks[i].exits = false;
      }

      var err = callback_exits_on_err(callbacks[i], exiting_functions);
      if (err.caught){
         callbacks[i].err_exits = err.exits;
         callbacks[i].err = err.block;
      }
   }  

   return callbacks;
}


module.exports = {
   'test': test_callbacks,
}